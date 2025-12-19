/**
 * GNSS SpaceTime Dashboard - MOTEUR V8 "REAL-PHYSICS"
 * Intégration Newtonienne Signée & Compensation Gravitationnelle
 */

((window) => {
    "use strict";

    // --- SÉCURITÉ MATH.JS ---
    if (typeof math === 'undefined') {
        console.error("Erreur: math.js est requis pour les calculs de matrices UKF.");
    }

    const $ = id => document.getElementById(id);

    // --- ÉTAT DU SYSTÈME ---
    const state = {
        running: false,
        v: 0,           // m/s
        vMax: 0,
        dist: 0,
        moveTime: 0,
        startTime: Date.now(),
        lastT: 0,
        pitch: 0,
        roll: 0,
        accelY: 0,      // Accélération brute mesurée sur l'axe longitudinal
        pos: { lat: 0, lon: 0, alt: 0 },
        ambientLightMax: 0,
        soundLevelMax: 0
    };

    // --- CONSTANTES PHYSIQUES ---
    const PHYS = {
        C: 299792458,
        G: 6.67430e-11,
        G_EARTH: 9.80665,
        R_GAS: 287.05,
        P0: 101325,
        T0: 288.15,
        L_RATE: 0.0065
    };

    // --- 1. INITIALISATION DES CAPTEURS ---
    const initSensors = async () => {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try { await DeviceMotionEvent.requestPermission(); } catch (e) { console.error(e); }
        }

        state.running = !state.running;
        const btn = $('gps-pause-toggle');
        
        if (state.running) {
            btn.textContent = "⏸️ PAUSE SYSTÈME";
            btn.style.backgroundColor = "#dc3545";
            state.lastT = performance.now();
            requestAnimationFrame(physicsLoop);
            
            // Démarrage GPS (pour la position, pas pour la vitesse inertielle)
            navigator.geolocation.watchPosition(
                p => {
                    state.pos.lat = p.coords.latitude;
                    state.pos.lon = p.coords.longitude;
                    state.pos.alt = p.coords.altitude || 0;
                    if($('gps-status')) $('gps-status').textContent = "ACQUISITION OK";
                },
                null, { enableHighAccuracy: true }
            );
        } else {
            btn.textContent = "▶️ MARCHE GPS";
            btn.style.backgroundColor = "#28a745";
        }
    };

    // --- 2. ÉCOUTEUR DE MOUVEMENT (HAUTE FRÉQUENCE) ---
    window.addEventListener('devicemotion', (e) => {
        if (!state.running) return;

        // On utilise l'accélération AVEC gravité pour calculer le Pitch (inclinaison)
        const ag = e.accelerationIncludingGravity;
        if (ag) {
            state.pitch = Math.atan2(-ag.y, ag.z) * (180 / Math.PI);
            state.roll = Math.atan2(ag.x, Math.sqrt(ag.y**2 + ag.z**2)) * (180 / Math.PI);
            
            // L'axe Y est notre axe de marche (longitudinal)
            state.accelY = ag.y; 
            
            // Mise à jour des IDs IMU
            if($('accel-x')) $('accel-x').textContent = ag.x.toFixed(3);
            if($('accel-y')) $('accel-y').textContent = ag.y.toFixed(3);
            if($('accel-z')) $('accel-z').textContent = ag.z.toFixed(3);
        }
    });

    // --- 3. MOTEUR PHYSIQUE RÉALISTE ---
    function updatePhysics(dt) {
        const mass = parseFloat($('mass-input')?.value) || 70;
        
        // A. COMPENSATION DE LA GRAVITÉ
        // Si le téléphone est incliné, une partie de 9.81 m/s² "fuit" sur l'axe Y.
        // On la soustrait pour obtenir l'accélération réelle du wagon.
        const pitchRad = state.pitch * (Math.PI / 180);
        const gravityComponent = Math.sin(pitchRad) * PHYS.G_EARTH;
        
        let realA = state.accelY + gravityComponent; // Accélération pure (signée)

        // B. FILTRE DE BRUIT (Deadzone millimétrique)
        if (Math.abs(realA) < 0.04) realA = 0;

        // C. INTÉGRATION DE LA VITESSE (v = v0 + a*dt)
        // C'est ici que la décélération fonctionne : si realA est négatif, v diminue.
        state.v += realA * dt;

        // D. TRAÎNÉE AÉRODYNAMIQUE (Réalisme Manège)
        const rho = PHYS.P0 / (PHYS.R_GAS * PHYS.T0); // Densité air standard
        const dragForce = 0.5 * rho * Math.pow(state.v, 2) * 0.47 * 0.6; 
        state.v -= (dragForce / mass) * dt;

        // E. SÉCURITÉ ARRÊT
        if (state.v < 0.001) state.v = 0;
        
        // F. CALCULS DÉRIVÉS
        state.dist += state.v * dt;
        if (state.v > state.vMax) state.vMax = state.v;
        if (state.v > 0.1) state.moveTime += dt;

        return { realA, dragForce, rho };
    }

    // --- 4. BOUCLE DE RENDU ---
    function physicsLoop() {
        if (!state.running) return;

        const now = performance.now();
        const dt = Math.min((now - state.lastT) / 1000, 0.1);
        state.lastT = now;

        const p = updatePhysics(dt);

        // --- MISE À JOUR DE TOUS LES IDS HTML ---
        
        // Vitesse & Distance
        if($('speed-main-display')) $('speed-main-display').textContent = (state.v * 3.6).toFixed(1) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = (state.v * 3.6).toFixed(1) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(3) + " m/s";
        if($('speed-max-session')) $('speed-max-session').textContent = (state.vMax * 3.6).toFixed(1) + " km/h";
        if($('total-distance')) $('total-distance').textContent = state.dist.toFixed(2) + " m";
        if($('elapsed-time')) $('elapsed-time').textContent = ((Date.now() - state.startTime)/1000).toFixed(2) + " s";
        if($('movement-time')) $('movement-time').textContent = state.moveTime.toFixed(2) + " s";

        // Dynamique & Forces
        if($('accel-long')) $('accel-long').textContent = p.realA.toFixed(3);
        if($('force-g-long')) $('force-g-long').textContent = (p.realA / PHYS.G_EARTH).toFixed(2) + " G";
        if($('drag-force')) $('drag-force').textContent = p.dragForce.toFixed(2) + " N";
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * 70 * state.v**2).toFixed(0) + " J";
        if($('air-density')) $('air-density').textContent = p.rho.toFixed(3);

        // Relativité
        const beta = state.v / PHYS.C;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(15);
        if($('pct-speed-of-light')) $('pct-speed-of-light').textContent = (beta * 100).toExponential(2) + " %";

        // IMU Niveau à bulle
        if($('pitch')) $('pitch').textContent = state.pitch.toFixed(1) + "°";
        if($('roll')) $('roll').textContent = state.roll.toFixed(1) + "°";
        if($('bubble')) {
            const bx = Math.max(-45, Math.min(45, state.roll));
            const by = Math.max(-45, Math.min(45, state.pitch));
            $('bubble').style.transform = `translate(${bx}px, ${by}px)`;
        }

        // GPS status
        if($('gps-accuracy-display')) $('gps-accuracy-display').textContent = "OFF (Mode Grotte)";

        requestAnimationFrame(physicsLoop);
    }

    // --- 5. ÉVÉNEMENTS INTERFACE ---
    $('gps-pause-toggle').onclick = initSensors;
    
    $('reset-dist-btn').onclick = () => { state.dist = 0; };
    $('reset-max-btn').onclick = () => { state.vMax = 0; };
    $('reset-all-btn').onclick = () => {
        state.v = 0; state.dist = 0; state.vMax = 0; state.moveTime = 0;
        state.startTime = Date.now();
    };

    // Mode Nuit
    $('toggle-mode-btn').onclick = () => {
        document.body.classList.toggle('dark-mode');
    };

    // Horloge UTC
    setInterval(() => {
        const d = new Date();
        if($('local-time')) $('local-time').textContent = d.toLocaleTimeString();
        if($('utc-datetime')) $('utc-datetime').textContent = d.toUTCString();
    }, 1000);

})(window);
