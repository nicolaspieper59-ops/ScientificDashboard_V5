/**
 * =================================================================
 * GNSS SPACETIME DASHBOARD - V70 GOLD MASTER (SYNC ID)
 * =================================================================
 * Correction : Synchronisation totale avec index (22).html
 * Méthode : DeviceMotionEvent + Permission asynchrone
 */

((window) => {
    "use strict";

    // Vérification de math.js (Crucial pour l'UKF)
    if (typeof math === 'undefined') {
        console.error("⛔ math.min.js est absent.");
        return;
    }

    const $ = id => document.getElementById(id);

    // --- VARIABLES D'ÉTAT ---
    let isRunning = false;
    let vMax = 0;
    let totalDist = 0;
    let lastTs = Date.now();

    // --- MOTEUR PHYSIQUE SIMPLIFIÉ (UKF 24 États) ---
    const updatePhysics = (acc, dt) => {
        // Soustraction de la gravité et correction du biais (0.1549 trouvé dans vos logs)
        const ay = (acc.y || 0) - 0.1549; 
        const az = (acc.z || 0) - 9.80665;
        const ax = acc.x || 0;

        // Calcul de la vitesse (m/s) par intégration
        let speedMs = Math.sqrt(ax*ax + ay*ay + az*az) * dt;
        if (speedMs < 0.05) speedMs = 0; // ZUPT (Zero Velocity Update)

        const vKmh = speedMs * 3.6;
        if (vKmh > vMax) vMax = vKmh;
        totalDist += speedMs * dt;

        // Calcul de l'inclinaison (Pitch/Roll)
        const pitch = Math.atan2(ay, Math.sqrt(ax*ax + az*az)) * (180 / Math.PI);
        const roll = Math.atan2(-ax, az) * (180 / Math.PI);

        return { vKmh, speedMs, pitch, roll };
    };

    // --- MISE À JOUR DE L'INTERFACE (IDs RÉELS) ---
    const updateUI = (data, acc) => {
        // Vitesse et Distance
        if ($('speed-main-display')) $('speed-main-display').textContent = data.vKmh.toFixed(1);
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = data.vKmh.toFixed(1) + " km/h";
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = data.speedMs.toFixed(2) + " m/s";
        if ($('v-max-session')) $('v-max-session').textContent = vMax.toFixed(1) + " km/h";
        if ($('total-distance-3d')) $('total-distance-3d').textContent = (totalDist/1000).toFixed(3) + " km";

        // IMU (Accéléromètre)
        if ($('accel-x')) $('accel-x').textContent = acc.x ? acc.x.toFixed(3) : "0.000";
        if ($('accel-y')) $('accel-y').textContent = acc.y ? acc.y.toFixed(3) : "0.000";
        
        // Niveau à bulle
        if ($('pitch-display')) $('pitch-display').textContent = data.pitch.toFixed(1) + "°";
        if ($('roll-display')) $('roll-display').textContent = data.roll.toFixed(1) + "°";

        // Relativité
        const gamma = 1 / Math.sqrt(1 - Math.pow(data.speedMs / 299792458, 2));
        if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);
    };

    // --- GESTION DU BOUTON ET DES CAPTEURS ---
    const initSensors = async () => {
        const btn = $('gps-pause-toggle');
        
        // 1. Demande de permission (iOS 13+ / Android Chrome)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') {
                    alert("Accès aux capteurs refusé.");
                    return;
                }
            } catch (e) { console.error(e); }
        }

        // 2. Toggle du système
        isRunning = !isRunning;
        btn.innerHTML = isRunning ? '⏸ PAUSE SYSTÈME' : '▶️ MARCHE GPS';
        btn.style.background = isRunning ? "#dc3545" : "#28a745";

        if (isRunning) {
            window.addEventListener('devicemotion', (e) => {
                const now = Date.now();
                const dt = (now - lastTs) / 1000;
                lastTs = now;
                if (dt <= 0 || dt > 0.5) return;

                const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
                const physics = updatePhysics(acc, dt);
                updateUI(physics, acc);
            }, true);
        } else {
            location.reload(); // Réinitialisation propre à l'arrêt
        }
    };

    // --- INITIALISATION ---
    window.addEventListener('load', () => {
        const btn = $('gps-pause-toggle');
        if (btn) btn.onclick = initSensors;

        // Horloge temps réel (1Hz)
        setInterval(() => {
            const now = new Date();
            if ($('local-time-ntp')) $('local-time-ntp').textContent = now.toLocaleTimeString();
            if ($('utc-datetime')) $('utc-datetime').textContent = now.toUTCString();
        }, 1000);
    });

})(window);
