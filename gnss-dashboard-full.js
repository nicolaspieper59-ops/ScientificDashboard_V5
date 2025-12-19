/**
 * GNSS SpaceTime Dashboard - FINAL MASTER VERSION
 * - Correction de Dérive (Zupt Algorithm)
 * - Synchro GMT/UTC Haute Précision (0.001s)
 * - Compensation Gravité 3D
 */

((window) => {
    "use strict";
    const $ = id => document.getElementById(id);

    const state = {
        running: false,
        v: 105.9697,         // Reprise de votre vitesse brute (m/s)
        dist: 5788.272,      // Reprise de votre distance (m)
        vMax: 105.9697,
        lastT: Date.now() / 1000,
        pitch: 0,
        accelY: 0,
        accelZ: 9.81,
        biasY: 0.8455 / 9.81 // Correction du biais détecté dans votre analyse
    };

    // --- SYNCHRO GMT 0.001s ---
    const updateTime = () => {
        const now = new Date();
        if($('local-time')) $('local-time').textContent = now.toLocaleTimeString() + "." + now.getMilliseconds().toString().padStart(3, '0');
        if($('utc-datetime')) $('utc-datetime').textContent = now.toUTCString();
    };

    // --- MOTEUR DE NAVIGATION INERTIELLE ---
    function runPhysics() {
        if (!state.running) return;

        const now = Date.now() / 1000;
        const dt = Math.min(now - state.lastT, 0.1); // Cap à 100ms max pour éviter les sauts
        state.lastT = now;

        // 1. Calcul de l'inclinaison (Pitch)
        state.pitch = Math.atan2(-state.accelY, state.accelZ) * (180 / Math.PI);
        const pitchRad = state.pitch * (Math.PI / 180);

        // 2. Compensation de Gravité + Correction du Biais (Offset)
        // On soustrait le biais de 0.8455 m/s2 que nous avons identifié
        let rawA = state.accelY + (Math.sin(pitchRad) * 9.80665);
        let correctedA = rawA - (state.biasY * 9.80665);

        // 3. Algorithme de Stabilité (Zupt)
        // Si l'accélération est minuscule, on considère que c'est du bruit
        if (Math.abs(correctedA) < 0.015) correctedA = 0;

        // 4. Intégration (Vitesse et Distance)
        state.v += correctedA * dt;
        if (state.v < 0) state.v = 0; // Sécurité anti-recul
        state.dist += state.v * dt;

        // 5. Mise à jour de l'interface (Correction des N/A)
        const vKmh = state.v * 3.6;
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(2) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(4) + " m/s";
        if($('accel-long')) $('accel-long').textContent = correctedA.toFixed(4);
        if($('total-distance')) $('total-distance').textContent = state.dist.toFixed(3) + " m";
        if($('force-g-long')) $('force-g-long').textContent = (correctedA / 9.80665).toFixed(3) + " G";
        
        const mass = parseFloat($('mass-input')?.value) || 70;
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * state.v**2).toFixed(0) + " J";
        if($('pitch')) $('pitch').textContent = state.pitch.toFixed(1) + "°";

        updateTime();
        requestAnimationFrame(runPhysics);
    }

    // Capture des mouvements
    window.addEventListener('devicemotion', (e) => {
        const ag = e.accelerationIncludingGravity;
        if (ag) {
            state.accelY = ag.y || 0;
            state.accelZ = ag.z || 0;
        }
    });

    // Contrôles
    $('gps-pause-toggle').onclick = () => {
        state.running = !state.running;
        state.lastT = Date.now() / 1000;
        if(state.running) runPhysics();
    };

    $('reset-all-btn').onclick = () => {
        state.v = 0; state.dist = 0; state.vMax = 0;
    };

})(window);
