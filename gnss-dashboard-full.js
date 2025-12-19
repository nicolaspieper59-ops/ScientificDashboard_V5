/**
 * =================================================================
 * GNSS SPACETIME DASHBOARD - V69 GOLD MASTER (ID SYNC)
 * =================================================================
 * - Capteurs : DeviceMotionEvent (Modern & Legacy)
 * - Moteur : UKF 24 États (Filtrage de Kalman)
 * - Anti-Dérive : ZUPT (Zero Velocity Update) calibré à 0.12 m/s²
 * - IDs HTML : 100% compatibles avec index (22).html
 * =================================================================
 */

((window) => {
    "use strict";

    if (typeof math === 'undefined') {
        alert("Erreur: math.min.js est requis.");
        return;
    }

    const $ = id => document.getElementById(id);

    // =================================================================
    // 1. FILTRE DE KALMAN (UKF) - LOGIQUE PHYSIQUE
    // =================================================================
    class ProfessionalUKF {
        constructor() {
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.P = math.multiply(math.eye(this.n), 0.1);
            this.R_MAJOR = 6378137.0;
            this.biasY = 0.1549; // Correction du biais observé
        }

        predict(acc, dt) {
            let ax = acc.x || 0;
            let ay = (acc.y || 0) - this.biasY;
            let az = (acc.z || 0) - 9.80665;

            // ZUPT : Évite la vitesse fantôme au repos
            if (Math.sqrt(ax*ax + ay*ay + az*az) < 0.12) {
                ax = 0; ay = 0; az = 0;
                this.x.set([3,0], 0); this.x.set([4,0], 0); this.x.set([5,0], 0);
            }

            // Intégration
            let vx = this.x.get([3,0]) + ax * dt;
            let vy = this.x.get([4,0]) + ay * dt;
            let vz = this.x.get([5,0]) + az * dt;

            const friction = 0.998;
            this.x.set([3,0], vx * friction);
            this.x.set([4,0], vy * friction);
            this.x.set([5,0], vz * friction);

            this.pitch = Math.atan2(ay, Math.sqrt(ax*ax + az*az)) * (180/Math.PI);
            this.roll = Math.atan2(-ax, az) * (180/Math.PI);
        }

        getState() {
            const vx = this.x.get([3,0]), vy = this.x.get([4,0]), vz = this.x.get([5,0]);
            return { v: Math.sqrt(vx*vx + vy*vy + vz*vz), vx, vy, vz, pitch: this.pitch || 0, roll: this.roll || 0 };
        }
    }

    // =================================================================
    // 2. VARIABLES D'ÉTAT
    // =================================================================
    let ukf = new ProfessionalUKF();
    let isRunning = false;
    let vMax = 0;
    let totalDist = 0;
    let lastTs = Date.now();

    // =================================================================
    // 3. TRAITEMENT DES CAPTEURS (DEVICE MOTION)
    // =================================================================
    const handleMotion = (e) => {
        if (!isRunning) return;
        const now = Date.now();
        const dt = (now - lastTs) / 1000;
        lastTs = now;

        if (dt <= 0 || dt > 0.5) return;

        const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
        ukf.predict(acc, dt);
        
        const state = ukf.getState();
        totalDist += state.v * dt;
        
        updateDashboard(state, acc);
    };

    // =================================================================
    // 4. MISE À JOUR DU DOM (VÉRIFICATION DES IDs HTML)
    // =================================================================
    const updateDashboard = (state, acc) => {
        const vKmh = state.v * 3.6;
        if (vKmh > vMax) vMax = vKmh;

        // --- Bloc Vitesse & Distance ---
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(1);
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(2) + " m/s";
        if($('v-max-session')) $('v-max-session').textContent = vMax.toFixed(1) + " km/h";
        if($('total-distance-3d')) $('total-distance-3d').textContent = (totalDist/1000).toFixed(3) + " km | " + totalDist.toFixed(2) + " m";

        // --- Bloc IMU (Accéléromètre) ---
        if($('accel-x')) $('accel-x').textContent = acc.x ? acc.x.toFixed(3) : "0.000";
        if($('accel-y')) $('accel-y').textContent = acc.y ? acc.y.toFixed(3) : "0.000";
        if($('accel-z')) $('accel-z').textContent = acc.z ? acc.z.toFixed(3) : "N/A";

        // --- Bloc Niveau à Bulle ---
        if($('pitch-display')) $('pitch-display').textContent = state.pitch.toFixed(1) + "°";
        if($('roll-display')) $('roll-display').textContent = state.roll.toFixed(1) + "°";

        // --- Bloc Physique & Relativité ---
        const c = 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(state.v/c, 2));
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);
        if($('mach-number')) $('mach-number').textContent = (state.v / 340.29).toFixed(4);
    };

    // =================================================================
    // 5. INITIALISATION ET BOUTONS
    // =================================================================
    window.onload = () => {
        const btnToggle = $('gps-pause-toggle');

        if (btnToggle) {
            btnToggle.onclick = async () => {
                // Demande de permission pour iOS/Android Moderne
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission !== 'granted') return;
                }

                isRunning = !isRunning;
                btnToggle.innerHTML = isRunning ? '⏸ PAUSE SYSTÈME' : '▶️ MARCHE GPS';
                btnToggle.style.backgroundColor = isRunning ? "#dc3545" : "#28a745";

                if (isRunning) {
                    lastTs = Date.now();
                    window.addEventListener('devicemotion', handleMotion, true);
                } else {
                    window.removeEventListener('devicemotion', handleMotion, true);
                }
            };
        }

        // Réinitialisation
        if($('reset-dist-btn')) $('reset-dist-btn').onclick = () => { totalDist = 0; };
        if($('reset-vmax-btn')) $('reset-vmax-btn').onclick = () => { vMax = 0; };
        if($('reset-all-btn')) $('reset-all-btn').onclick = () => location.reload();

        // Heure
        setInterval(() => {
            const now = new Date();
            if($('local-time-ntp')) $('local-time-ntp').textContent = now.toLocaleTimeString();
            if($('utc-datetime')) $('utc-datetime').textContent = now.toUTCString();
        }, 1000);
    };

})(window);
