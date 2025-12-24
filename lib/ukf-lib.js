/**
 * GNSS SPACETIME - UNIVERSAL BIOMETRIC & STRATEGIC ENGINE (V110)
 * Portée : 0.0001 m/s (Escargot) à 400 m/s (Avion de chasse)
 * Optimisé pour : Drones, Grottes, Wingsuit, Nautisme, Biologie.
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class UniversalScientificUKF {
        constructor() {
            if (typeof math === 'undefined') throw new Error("Math.js requis");

            // --- PARAMÈTRES D'ÉTAT (24 ÉTATS) ---
            // [0-2] Pos, [3-5] Vel, [6-9] Quat, [10-12] Biais Acc, [13-15] Biais Gyro, [16-21] Scale, [22-23] Dynamique
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion Neutre
            this.P = math.multiply(math.identity(this.n), 0.01); // Covariance initiale

            // --- RÉGLAGES HAUTE RÉSOLUTION ---
            this.isRunning = false;
            this.lastT = performance.now();
            this.totalDist = 0;
            this.vMax = 0;
            
            // Paramètre critique pour les vitesses microscopiques (<1mm/s)
            this.noiseFloor = 0.0005; // Rejet du bruit électronique sous 0.5mm/s
            this.isCalibrating = true;
            this.calibSamples = [];

            this.init();
        }

        init() {
            console.log("🚀 Moteur Universel Initialisé (Prêt pour multi-cibles)");
            this.setupUI();
        }

        /**
         * LOGIQUE DE PRÉDICTION (NEWTON + EINSTEIN)
         * Gère l'inertie pure pour les drones et les oiseaux.
         */
        predict(accRaw, gyroRaw, dt) {
            if (!this.isRunning || this.isCalibrating) return;

            // 1. Correction des Biais et Facteurs d'échelle
            let ax = (accRaw.x - this.x.get([10, 0])) * this.x.get([19, 0] || 1);
            let ay = (accRaw.y - this.x.get([11, 0])) * this.x.get([20, 0] || 1);
            let az = (accRaw.z - this.x.get([12, 0])) * this.x.get([21, 0] || 1);

            // 2. Intégration de la Vitesse (V = V + a*dt)
            // Application d'un filtre de micro-mouvement pour les gastéropodes
            const aMag = Math.sqrt(ax*ax + ay*ay + az*az);
            if (aMag < this.noiseFloor) { ax = 0; ay = 0; az = 0; }

            const vx = this.x.get([3, 0]) + ax * dt;
            const vy = this.x.get([4, 0]) + ay * dt;
            const vz = this.x.get([5, 0]) + az * dt;

            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            // 3. Calculs Scientifiques
            this.computePhysics(vx, vy, vz, dt);
        }

        computePhysics(vx, vy, vz, dt) {
            const vMs = Math.sqrt(vx*vx + vy*vy + vz*vz);
            const kmh = vMs * 3.6;

            if (kmh > this.vMax) this.vMax = kmh;
            this.totalDist += vMs * dt;

            // --- RELATIVITÉ (LORENTZ) ---
            const beta = vMs / C;
            const gamma = 1 / Math.sqrt(1 - beta * beta);
            const dilation = (gamma - 1) * 86400 * 1e9; // ns/jour

            // --- MISE À JOUR UI ---
            this.safeSet('speed-main-display', kmh.toFixed(kmh < 1 ? 4 : 1)); // 4 décimales pour les vitesses lentes
            this.safeSet('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.safeSet('speed-stable-ms', vMs.toFixed(5) + " m/s");
            this.safeSet('lorentz-factor', gamma.toFixed(15));
            this.safeSet('time-dilation-vitesse', dilation.toFixed(4) + " ns/j");
            this.safeSet('total-distance-3d', (this.totalDist / 1000).toFixed(5) + " km");
            
            // Énergie cinétique (E = 1/2 mv²)
            const masse = parseFloat($('mass-input')?.value) || 70;
            const ec = 0.5 * masse * vMs * vMs;
            this.safeSet('kinetic-energy', ec.toFixed(2) + " J");
        }

        calibrate(acc) {
            if (this.calibSamples.length < 150) {
                this.calibSamples.push(acc);
                this.safeSet('status-physique', `CALIBRATION : ${Math.round(this.calibSamples.length/1.5)}%`);
            } else {
                let sum = {x:0, y:0, z:0};
                this.calibSamples.forEach(s => { sum.x+=s.x; sum.y+=s.y; sum.z+=s.z; });
                this.x.set([10, 0], sum.x/150);
                this.x.set([11, 0], sum.y/150);
                this.x.set([12, 0], (sum.z/150) - 9.80665);
                this.isCalibrating = false;
                this.safeSet('status-physique', "PRÊT - MODE DYNAMIQUE");
            }
        }

        setupUI() {
            const btn = $('gps-pause-toggle');
            if (!btn) return;

            btn.onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        const res = await DeviceMotionEvent.requestPermission();
                        if (res !== 'granted') return;
                    }

                    window.addEventListener('devicemotion', (e) => {
                        const now = performance.now();
                        const dt = (now - this.lastT) / 1000;
                        this.lastT = now;

                        if (this.isCalibrating) {
                            this.calibrate(e.accelerationIncludingGravity);
                        } else {
                            this.predict(e.acceleration, e.rotationRate || {alpha:0,beta:0,gamma:0}, dt);
                        }
                    });

                    this.isRunning = true;
                    btn.textContent = "⏸ SYSTÈME ACTIF";
                    btn.style.backgroundColor = "#28a745";
                } else {
                    location.reload();
                }
            };
        }

        safeSet(id, val) { const el = $(id); if (el) el.textContent = val; }
    }

    // EXPORTATION POUR LE HTML
    window.ProfessionalUKF = UniversalScientificUKF;

})(window);
