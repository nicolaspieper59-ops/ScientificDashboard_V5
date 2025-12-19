/**
 * GNSS SpaceTime Dashboard - MOTEUR FINAL "INERTIA-PRO"
 * - Intégration Newtonienne Signée (Accélération/Décélération)
 * - Compensation de Gravité par Pitch (Inclinaison)
 * - Conservation de l'Élan (Inertie Infinie)
 * - Précision Microscopique (Seuil 0.005 m/s²)
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);

    // --- ÉTAT DU SYSTÈME ---
    const state = {
        running: false,
        v: 0,               // Vitesse en m/s
        vMax: 0,
        dist: 0,
        moveTime: 0,
        startTime: Date.now(),
        lastT: 0,
        pitch: 0,           // Inclinaison longitudinale
        roll: 0,            // Inclinaison latérale
        accelX: 0,
        accelY: 0,          // Axe principal du mouvement
        accelZ: 0,
        pos: { lat: 0, lon: 0, alt: 0 }
    };

    // --- CONSTANTES PHYSIQUES ---
    const PHYS = {
        C: 299792458,
        G_EARTH: 9.80665,
        R_GAS: 287.05,
        P0: 101325,
        T0: 288.15
    };

    // --- 1. INITIALISATION ET PERMISSIONS ---
    const initSystem = async () => {
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
            
            // GPS (Uniquement pour positionner la carte, pas pour la vitesse)
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

    // --- 2. CAPTEURS HAUTE FRÉQUENCE ---
    window.addEventListener('devicemotion', (e) => {
        if (!state.running) return;

        const ag = e.accelerationIncludingGravity;
        if (ag) {
            state.accelX = ag.x || 0;
            state.accelY = ag.y || 0;
            state.accelZ = ag.z || 0;

            // Calcul du Pitch pour compenser la pente
            // Si le téléphone pointe vers le bas, Pitch est négatif
            state.pitch = Math.atan2(-state.accelY, state.accelZ) * (180 / Math.PI);
            state.roll = Math.atan2(state.accelX, Math.sqrt(state.accelY**2 + state.accelZ**2)) * (180 / Math.PI);
        }
    });

    // --- 3. MOTEUR PHYSIQUE (NEWTON PURE) ---
    function updatePhysics(dt) {
        const mass = parseFloat($('mass-input')?.value) || 70;
        
        // A. COMPENSATION DE LA GRAVITÉ
        // On annule l'effet du poids du téléphone sur l'axe Y pour ne garder que le mouvement
        const pitchRad = state.pitch * (Math.PI / 180);
        const gravityCorrection = Math.sin(pitchRad) * PHYS.G_EARTH;
        
        // Accélération réelle (poussée ou freinage du wagon)
        let realA = state.accelY + gravityCorrection; 

        // B. SEUIL MICROSCOPIQUE (Anti-bruit)
        // On ignore seulement les micro-vibrations < 0.008 m/s²
        if (Math.abs(realA) < 0.008) {
            realA = 0; // ICI : L'élan est conservé car l'accélération devient nulle
        }

        // C. INTÉGRATION SIGNÉE (v = v + a*dt)
        // Si realA est négatif, la vitesse baisse (décélération)
        state.v += realA * dt;

        // D. SÉCURITÉ ARRÊT
        if (state.v < 0.0001) state.v = 0; 

        // E. CALCULS DES FORCES ET ÉNERGIE
        const kineticEnergy = 0.5 * mass * Math.pow(state.v, 2);
        const forceG = realA / PHYS.G_EARTH;
        const totalG_3D = Math.sqrt(state.accelX**2 + state.accelY**2 + state.accelZ**2) / PHYS.G_EARTH;

        // F. MISE À JOUR DISTANCE
        state.dist += state.v * dt;
        if (state.v > state.vMax) state.vMax = state.v;
        if (state.v > 0.01) state.moveTime += dt;

        return { realA, forceG, kineticEnergy, totalG_3D };
    }

    // --- 4. BOUCLE D'AFFICHAGE ---
    function physicsLoop() {
        if (!state.running) return;

        const now = performance.now();
        const dt = Math.min((now - state.lastT) / 1000, 0.1);
        state.lastT = now;

        const phys = updatePhysics(dt);

        // --- SYNCHRONISATION AVEC LE HTML ---
        
        // Vitesse & Distance
        if($('speed-main-display')) $('speed-main-display').textContent = (state.v * 3.6).toFixed(2) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = (state.v * 3.6).toFixed(1) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(4) + " m/s";
        if($('speed-max-session')) $('speed-max-session').textContent = (state.vMax * 3.6).toFixed(1) + " km/h";
        if($('total-distance')) $('total-distance').textContent = state.dist.toFixed(3) + " m";
        if($('elapsed-time')) $('elapsed-time').textContent = ((Date.now() - state.startTime)/1000).toFixed(2) + " s";
        if($('movement-time')) $('movement-time').textContent = state.moveTime.toFixed(2) + " s";

        // IMU & Forces
        if($('accel-x')) $('accel-x').textContent = state.accelX.toFixed(3);
        if($('accel-y')) $('accel-y').textContent = state.accelY.toFixed(3);
        if($('accel-z')) $('accel-z').textContent = state.accelZ.toFixed(3);
        if($('accel-long')) $('accel-long').textContent = phys.realA.toFixed(4);
        if($('force-g-long')) $('force-g-long').textContent = phys.forceG.toFixed(3) + " G";
        if($('kinetic-energy')) $('kinetic-energy').textContent = phys.kineticEnergy.toFixed(1) + " J";
        if($('pitch')) $('pitch').textContent = state.pitch.toFixed(1) + "°";
        if($('roll')) $('roll').textContent = state.roll.toFixed(1) + "°";

        // Niveau à bulle
        if($('bubble')) {
            const bx = Math.max(-45, Math.min(45, state.roll));
            const by = Math.max(-45, Math.min(45, state.pitch));
            $('bubble').style.transform = `translate(${bx}px, ${by}px)`;
        }

        // Relativité
        const beta = state.v / PHYS.C;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(16);
        if($('pct-speed-of-light')) $('pct-speed-of-light').textContent = (beta * 100).toExponential(4) + " %";

        // Environnement
        if($('gps-accuracy-display')) $('gps-accuracy-display').textContent = "OFF (Inertial Mode)";

        requestAnimationFrame(physicsLoop);
    }

    // --- 5. ÉVÉNEMENTS BOUTONS ---
    $('gps-pause-toggle').onclick = initSystem;
    
    $('reset-dist-btn').onclick = () => { state.dist = 0; };
    $('reset-max-btn').onclick = () => { state.vMax = 0; };
    $('reset-all-btn').onclick = () => {
        state.v = 0; state.dist = 0; state.vMax = 0; state.moveTime = 0;
        state.startTime = Date.now();
    };

    // Horloge temps réel
    setInterval(() => {
        const d = new Date();
        if($('local-time')) $('local-time').textContent = d.toLocaleTimeString();
        if($('utc-datetime')) $('utc-datetime').textContent = d.toUTCString();
    }, 1000);

})(window);
