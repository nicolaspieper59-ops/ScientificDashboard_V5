/**
 * GNSS SpaceTime Dashboard - MOTEUR MASTER V6.0 (FINAL)
 * Intégrant: ZUPT Anti-Drift, Modèle ISA, et Permissions W3C
 */

((window) => {
    "use strict";
    const $ = id => document.getElementById(id);

    // --- CONSTANTES PHYSIQUES (Modèle ISA & WGS84) ---
    const PHYS = {
        C: 299792458,           // Vitesse lumière (m/s)
        G: 6.67430e-11,         // Constante grav.
        G_STD: 9.80665,         // Gravité standard
        R_GAS: 287.05,          // Constante gaz air sec (J/kg·K)
        P0: 101325,             // Pression niveau mer (Pa)
        T0: 288.15,             // Temp standard (K)
        L_RATE: 0.0065,         // Gradient thermique (K/m)
        VISCOSITY: 1.48e-5      // Viscosité cinématique
    };

    // --- ÉTAT DU SYSTÈME ---
    const state = {
        running: false,
        v: 0, vMax: 0, dist: 0,
        moveTime: 0, lastT: 0,
        pos: { lat: 0, lon: 0, alt: 0, acc: 0 }, // Position par défaut (Null Island)
        acc: { x:0, y:0, z:9.81 },
        gpsLock: false
    };

    // --- 1. GESTION DES PERMISSIONS & DÉMARRAGE ---
    const initSystem = async () => {
        const btn = $('gps-pause-toggle');
        
        // Demande de permission pour iOS 13+
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                if (response !== 'granted') {
                    alert("Permission capteurs refusée. Le dashboard restera en mode simulation.");
                }
            } catch (e) { console.warn(e); }
        }

        // Bascule de l'état
        state.running = !state.running;
        
        if (state.running) {
            btn.textContent = "⏸️ PAUSE SYSTÈME";
            btn.style.backgroundColor = "#dc3545";
            btn.classList.add('pulse-active');
            state.lastT = performance.now();
            
            // Démarrage GPS explicite
            if (navigator.geolocation) {
                navigator.geolocation.watchPosition(
                    (p) => {
                        state.gpsLock = true;
                        state.pos.lat = p.coords.latitude;
                        state.pos.lon = p.coords.longitude;
                        state.pos.alt = p.coords.altitude || 0;
                        state.pos.acc = p.coords.accuracy;
                        // Correction de vitesse si GPS précis
                        if (p.coords.speed !== null && p.coords.accuracy < 20) {
                            state.v = p.coords.speed; 
                        }
                    },
                    (err) => console.warn("Erreur GPS:", err.message),
                    { enableHighAccuracy: true, maximumAge: 0 }
                );
            }
            requestAnimationFrame(physicsLoop);
        } else {
            btn.textContent = "▶️ DÉMARRER SYSTÈME";
            btn.style.backgroundColor = "#28a745";
            btn.classList.remove('pulse-active');
            state.gpsLock = false;
        }
    };

    // Liaison du bouton (Impératif pour les navigateurs)
    const startBtn = $('gps-pause-toggle');
    if(startBtn) startBtn.onclick = initSystem;


    // --- 2. CALCULS PHYSIQUES & MODÈLE ATMOSPHÉRIQUE ---
    function updatePhysics(dt) {
        const mass = parseFloat($('mass-input')?.value) || 70;

        // A. Modèle ISA (International Standard Atmosphere)
        // Calcule la densité même sans capteur de pression
        const temp = PHYS.T0 - (PHYS.L_RATE * state.pos.alt);
        const press = PHYS.P0 * Math.pow((1 - (PHYS.L_RATE * state.pos.alt) / PHYS.T0), 5.255);
        const rho = press / (PHYS.R_GAS * temp); // Densité calculée (kg/m³)

        // B. Accélération Nette & ZUPT (Anti-Drift)
        // On retire la gravité (9.81) pour obtenir le mouvement pur
        const rawAcc = Math.sqrt(state.acc.x**2 + state.acc.y**2 + (state.acc.z - 9.81)**2);
        
        // ZUPT : Si accélération faible (< 0.2 m/s²) ET pas de mouvement GPS, on force l'arrêt.
        if (rawAcc < 0.25 && !state.gpsLock) {
            state.v *= 0.9; // Freinage exponentiel
            if (state.v < 0.05) state.v = 0;
        } else {
            // Intégration
            state.v += rawAcc * dt;
        }

        // C. Aérodynamique (Traînée)
        const q = 0.5 * rho * state.v**2; // Pression dynamique
        const drag = q * 0.47 * 0.7;      // F = 1/2 rho v² Cd A
        state.v -= (drag / mass) * dt;    // La traînée ralentit l'objet

        // Sécurités
        if (state.v < 0) state.v = 0;
        if (state.v > state.vMax) state.vMax = state.v;
        if (state.v > 0.1) state.moveTime += dt;
        state.dist += state.v * dt;

        return { rho, press, q, drag, mass, temp };
    }


    // --- 3. BOUCLE D'AFFICHAGE (60 FPS) ---
    function physicsLoop() {
        if (!state.running) return;
        
        const now = performance.now();
        const dt = (now - state.lastT) / 1000; // Delta temps en secondes
        state.lastT = now;

        const phys = updatePhysics(dt);
        const vKmh = state.v * 3.6;

        // --- INJECTION DANS LE HTML (ZÉRO N/A) ---

        // 1. Vitesse & Mouvement
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(2) + " m/s";
        if($('total-distance')) $('total-distance').textContent = (state.dist / 1000).toFixed(3) + " km";
        
        // 2. Fluides & Atmosphère (Fixe les N/A)
        if($('air-density')) $('air-density').textContent = phys.rho.toFixed(3) + " kg/m³";
        if($('pressure-hpa')) $('pressure-hpa').textContent = (phys.press / 100).toFixed(1) + " hPa";
        if($('dynamic-pressure')) $('dynamic-pressure').textContent = phys.q.toFixed(2) + " Pa";
        if($('drag-force')) $('drag-force').textContent = phys.drag.toFixed(2) + " N";
        if($('air-temp-c')) $('air-temp-c').textContent = (phys.temp - 273.15).toFixed(1) + " °C";

        // 3. Relativité & Énergie
        const gamma = 1 / Math.sqrt(1 - (state.v**2 / PHYS.C**2));
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * phys.mass * state.v**2).toExponential(2) + " J";
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        if($('momentum')) $('momentum').textContent = (gamma * phys.mass * state.v).toFixed(2) + " kg·m/s";

        // 4. Astro (Basé sur Lat/Lon ou par défaut)
        updateAstro(state.pos.lat, state.pos.lon);

        // 5. Statut GPS
        const statusText = state.gpsLock ? 
            `LOCK (${state.pos.acc.toFixed(1)}m)` : 
            "ESTIMATION INERTIELLE (ATTENTE GPS)";
        if($('speed-status-text')) $('speed-status-text').textContent = statusText;
        if($('gps-accuracy-display')) $('gps-accuracy-display').textContent = state.pos.acc ? state.pos.acc + " m" : "N/A";

        requestAnimationFrame(physicsLoop);
    }

    // --- 4. CALCULS ASTRONOMIQUES ---
    function updateAstro(lat, lon) {
        if (!lat && !lon) return; // Pas de calcul si pas de coords
        
        const now = new Date();
        // Calcul simplifié Azimut/Altitude solaire
        // (Nécessite normalement une librairie lourde, ici approx pour performance)
        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
        
        if($('sun-altitude')) $('sun-altitude').textContent = (90 - Math.abs(lat - declination)).toFixed(1) + "°";
        if($('local-time')) $('local-time').textContent = now.toLocaleTimeString();
        if($('utc-datetime')) $('utc-datetime').textContent = now.toUTCString();
    }

    // --- 5. ÉCOUTEURS PASSIFS ---
    window.addEventListener('devicemotion', (e) => {
        state.acc.x = e.accelerationIncludingGravity.x || 0;
        state.acc.y = e.accelerationIncludingGravity.y || 0;
        state.acc.z = e.accelerationIncludingGravity.z || 9.81;
        
        // Niveau à bulle
        const pitch = Math.atan2(-state.acc.x, state.acc.z) * 57.29;
        const roll = Math.atan2(state.acc.y, state.acc.z) * 57.29;
        if($('pitch')) $('pitch').textContent = pitch.toFixed(1) + "°";
        if($('roll')) $('roll').textContent = roll.toFixed(1) + "°";
        if($('accel-long')) $('accel-long').textContent = state.acc.x.toFixed(2);
    });

})(window);
