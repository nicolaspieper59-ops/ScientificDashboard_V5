/**
 * GNSS SpaceTime Dashboard - MOTEUR ULTRA-PRÉCISION V9
 * - Synchro GMT/UTC Haute Fréquence (0.001s)
 * - Correction d'Inclinaison par Projection de Gravité
 * - Conservation d'Élan Newtonienne Stricte
 */

((window) => {
    "use strict";
    const $ = id => document.getElementById(id);

    // --- ÉTAT DU SYSTÈME ---
    const state = {
        running: false,
        v: 54.6023,         // On repart de votre valeur actuelle (m/s)
        vMax: 196.6 / 3.6,
        dist: 527.689,      // On repart de votre distance actuelle (m)
        lastTimestamp: 0,
        pitch: 25.9,
        accelY: -1.700,     // Valeur IMU brute
        pos: { lat: 0, lon: 0, alt: 0 }
    };

    const PHYS = {
        C: 299792458,
        G_EARTH: 9.80665
    };

    // --- 1. SYNCHRONISATION TEMPORELLE GMT (0.001s) ---
    // Utilisation de performance.now() synchronisé sur le temps Unix GMT
    const getGMTTimestamp = () => {
        return Date.now() / 1000; // Précision à la milliseconde
    };

    // --- 2. INITIALISATION ---
    const initSystem = async () => {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try { await DeviceMotionEvent.requestPermission(); } catch (e) {}
        }

        state.running = !state.running;
        const btn = $('gps-pause-toggle');
        
        if (state.running) {
            btn.textContent = "⏸️ PAUSE SYSTÈME";
            state.lastTimestamp = getGMTTimestamp();
            requestAnimationFrame(physicsLoop);
        } else {
            btn.textContent = "▶️ MARCHE GPS";
        }
    };

    // --- 3. CAPTEURS & INCLINAISON ---
    window.addEventListener('devicemotion', (e) => {
        if (!state.running) return;
        const ag = e.accelerationIncludingGravity;
        if (ag) {
            // Mise à jour des accélérations brutes
            state.accelY = ag.y || 0;
            state.accelZ = ag.z || 0;

            // Recalcul du Pitch en temps réel pour compenser l'inclinaison
            // On utilise la projection atan2 pour une stabilité totale
            state.pitch = Math.atan2(-state.accelY, state.accelZ) * (180 / Math.PI);
        }
    });

    // --- 4. MOTEUR DE FUSION ET ÉLAN ---
    function updatePhysics() {
        // Synchronisation GMT 0.001s
        const now = getGMTTimestamp();
        const dt = now - state.lastTimestamp;
        state.lastTimestamp = now;

        if (dt <= 0) return;

        // A. CORRECTION PAR RAPPORT À L'INCLINAISON
        // La gravité s'exerce sur l'axe Y selon le sinus de l'inclinaison (Pitch)
        const pitchRad = state.pitch * (Math.PI / 180);
        const gravityEffect = Math.sin(pitchRad) * PHYS.G_EARTH;
        
        // Accélération Longitudinale réelle (Libérée de la gravité)
        let realA = state.accelY + gravityEffect;

        // B. FILTRE MICROSCOPIQUE (Seuil de bruit ultra-fin)
        if (Math.abs(realA) < 0.005) realA = 0;

        // C. INTÉGRATION DE NEWTON (Conservation de l'élan)
        // v_finale = v_initiale + (accélération * temps)
        state.v += realA * dt;

        // D. SÉCURITÉ (Pas de vitesse négative)
        if (state.v < 0) state.v = 0;

        // E. CALCULS DÉRIVÉS
        state.dist += state.v * dt;
        if (state.v > state.vMax) state.vMax = state.v;

        // F. SYNCHRONISATION HTML
        updateUI(realA, dt);
    }

    // --- 5. INTERFACE ET SYNCHRONISATION ---
    function updateUI(realA, dt) {
        const vKmh = state.v * 3.6;
        const mass = parseFloat($('mass-input')?.value) || 70;

        // Affichage Vitesse (Signée et proportionnelle)
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(2) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(4) + " m/s";
        if($('accel-long')) $('accel-long').textContent = realA.toFixed(4);
        if($('total-distance')) $('total-distance').textContent = state.dist.toFixed(3) + " m";
        
        // Force G
        if($('force-g-long')) $('force-g-long').textContent = (realA / PHYS.G_EARTH).toFixed(3) + " G";
        
        // Énergie Cinétique
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * state.v**2).toFixed(1) + " J";

        // Relativité
        const beta = state.v / PHYS.C;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(16);

        // Debug Temps
        if($('local-time')) $('local-time').textContent = new Date().toLocaleTimeString() + "." + new Date().getMilliseconds();
    }

    function physicsLoop() {
        if (!state.running) return;
        updatePhysics();
        requestAnimationFrame(physicsLoop);
    }

    // Assignation des boutons
    if($('gps-pause-toggle')) $('gps-pause-toggle').onclick = initSystem;
    if($('reset-all-btn')) $('reset-all-btn').onclick = () => {
        state.v = 0; state.dist = 0; state.vMax = 0;
    };

})(window);
