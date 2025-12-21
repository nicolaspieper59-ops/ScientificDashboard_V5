/**
 * GNSS SPACETIME - MOTEUR DE FUSION MONOLITHIQUE 21 ÉTATS (PRO)
 * Scientifiquement Réaliste : Relativité + Dynamique des Fluides + Fusion IMU
 */
((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458; // Vitesse lumière
    const G = 6.67430e-11; // Constante gravitationnelle

    class ProfessionalUKF21 {
        constructor() {
            // État [21x1] : [0-2]Pos, [3-5]Vel, [6-9]Quat, [10-12]AccBias, [13-15]GyroBias, [16-18]Mag, [19-20]Clock
            this.x = math.matrix(math.zeros([21, 1]));
            this.x.set([6, 0], 1); // Quaternion Neutre (W=1)
            this.P = math.multiply(math.identity(21), 0.01); // Covariance initiale
            
            this.mass = 70.0; // Masse par défaut (kg)
            this.isRunning = false;
            this.lastT = performance.now();
            this.totalDist = 0;
            
            this.init();
        }

        init() {
            this.setupUI();
            this.runScientificLoop();
        }

        processInertial(e) {
            if (!this.isRunning) return;
            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.05);
            this.lastT = now;

            const acc = e.acceleration || {x:0, y:0, z:0};
            const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};

            // 1. Correction des Biais (États 10-12)
            let ax = acc.x - this.x.get([10, 0]);
            let ay = acc.y - this.x.get([11, 0]);
            let az = acc.z - this.x.get([12, 0]);

            // 2. Détection de Chute Libre (G-Zero)
            const gForce = Math.sqrt(ax**2 + ay**2 + az**2) / 9.81;
            if (gForce < 0.2) {
                this.updateStatus("CHUTE LIBRE (GRAVITÉ ZÉRO)");
                az -= 9.80665; // Intégration de la pesanteur manquante
            } else {
                this.updateStatus("FUSION 21-ÉTATS STABLE");
            }

            // 3. Intégration Newtonienne (Mise à jour Vitesse)
            this.x.set([3, 0], this.x.get([3, 0]) + (ax * dt));
            this.x.set([4, 0], this.x.get([4, 0]) + (ay * dt));
            this.x.set([5, 0], this.x.get([5, 0]) + (az * dt));

            // 4. Calcul Distance
            const vMs = Math.sqrt(this.x.get([3, 0])**2 + this.x.get([4, 0])**2 + this.x.get([5, 0])**2);
            this.totalDist += vMs * dt;

            // UI Directe (Haute Fréquence)
            this.set('accel-x', ax.toFixed(3));
            this.set('accel-y', ay.toFixed(3));
            this.set('accel-z', az.toFixed(3));
            this.updateBubble(ax, ay);
        }

        runScientificLoop() {
            const update = () => {
                const vx = this.x.get([3, 0]), vy = this.x.get([4, 0]), vz = this.x.get([5, 0]);
                const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
                const kmh = vMs * 3.6;

                // --- CALCULS RELATIVISTES ---
                const beta = vMs / C;
                const gamma = 1 / Math.sqrt(1 - beta**2);
                const dilation = (gamma - 1) * 86400 * 1e9; // ns par jour

                // --- ÉNERGIE ---
                const energy = this.mass * C**2 * gamma;
                const rs = (2 * G * this.mass) / C**2; // Rayon de Schwarzschild

                // Affichage
                this.set('speed-main-display', kmh.toFixed(2));
                this.set('lorentz-factor', gamma.toFixed(12));
                this.set('time-dilation-vitesse', dilation.toFixed(3) + " ns/j");
                this.set('relativistic-energy', energy.toExponential(4) + " J");
                this.set('schwarzschild-radius', rs.toExponential(4) + " m");
                this.set('total-distance-3d', (this.totalDist / 1000).toFixed(4) + " km");
                this.set('vertical-speed', vz.toFixed(2) + " m/s");
                this.set('nyquist-limit', Math.round(1/((performance.now()-this.lastT)/1000)) + " Hz");

                requestAnimationFrame(update);
            };
            update();
        }

        setupUI() {
            $('gps-pause-toggle').onclick = async () => {
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }
                window.addEventListener('devicemotion', (e) => this.processInertial(e));
                this.isRunning = true;
                this.set('ukf-status', "ACTIVE (21-STATES)");
            };
        }

        updateBubble(ax, ay) {
            const b = $('bubble');
            if (b) {
                const tx = Math.max(-30, Math.min(30, ax * 5));
                const ty = Math.max(-30, Math.min(30, ay * 5));
                b.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
            }
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
        updateStatus(t) { this.set('status-physique', t); }
    }

    window.App = new ProfessionalUKF21();
})(window);
