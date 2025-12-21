/**
 * GNSS SPACETIME - MASTER ENGINE (21 ÉTATS)
 * Fusion Totale : Chute Libre / Salto / Drone / Relativité
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class MasterUKF21 {
        constructor() {
            // ÉTAT [0-20] : Pos(3), Vel(3), Quat(4), AccBias(3), GyroBias(3), Mag(3), Misc(2)
            this.x = math.matrix(math.zeros([21, 1]));
            this.x.set([6, 0], 1); // Quat W à 1
            this.P = math.multiply(math.identity(21), 0.05); // Incertitude
            
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.lastT = performance.now();
            this.totalDist = 0;

            this.init();
        }

        init() {
            this.setupUI();
            this.startLoop();
        }

        // --- LOGIQUE AUTO-ADAPTATIVE (DRONE / SALTO / CHUTE) ---
        processInertial(e) {
            if (!this.isRunning) return;
            
            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.05);
            this.lastT = now;

            const acc = e.acceleration || {x:0, y:0, z:0};
            const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};

            if (this.isCalibrating) {
                this.calibrate(acc, gyro);
                return;
            }

            // A. Détection des modes
            const accMag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
            const rotMag = Math.sqrt(gyro.alpha**2 + gyro.beta**2 + gyro.gamma**2);
            
            let fx = acc.x, fy = acc.y, fz = acc.z;

            // B. Commutation automatique
            if (accMag < 1.5) { // MODE CHUTE LIBRE
                fz -= 9.80665; 
                this.updateStatus("CHUTE LIBRE");
            } else if (rotMag > 350) { // MODE SALTO / DRONE FPV
                fx *= 0.02; fy *= 0.02; fz *= 0.02; // Verrouillage centrifuge
                this.updateStatus("MODE ACRO / SALTO");
            } else { // MODE RIVIÈRE / NORMAL
                fx -= this.x.get([10, 0]); // Soustraction biais appris
                fy -= this.x.get([11, 0]);
                this.updateStatus("NAVIGATION STABLE");
            }

            // C. Intégration Newtonienne (Symétrie pure)
            this.x.set([3, 0], this.x.get([3, 0]) + (fx * dt));
            this.x.set([4, 0], this.x.get([4, 0]) + (fy * dt));
            this.x.set([5, 0], this.x.get([5, 0]) + (fz * dt));

            this.totalDist += Math.sqrt(fx**2 + fy**2) * dt;
        }

        calibrate(acc, gyro) {
            if (this.calibSamples.length < 150) {
                this.calibSamples.push(acc);
                this.updateStatus(`CALIBRATION... ${Math.round(this.calibSamples.length/1.5)}%`);
                return;
            }
            const avgX = this.calibSamples.reduce((a, b) => a + b.x, 0) / 150;
            const avgY = this.calibSamples.reduce((a, b) => a + b.y, 0) / 150;
            this.x.set([10, 0], avgX); 
            this.x.set([11, 0], avgY);
            this.isCalibrating = false;
        }

        startLoop() {
            const update = () => {
                const vx = this.x.get([3, 0]), vy = this.x.get([4, 0]), vz = this.x.get([5, 0]);
                const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
                const kmh = vMs * 3.6;

                // Affichage Relativité
                const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
                this.set('speed-main-display', kmh.toFixed(2));
                this.set('lorentz-factor', gamma.toFixed(15));
                this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

                // Astronomie (Liaison astro.js)
                if (window.calculateAstroDataHighPrec) {
                    const astro = window.calculateAstroDataHighPrec(new Date(), 43.2, 5.3);
                    this.set('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
                    this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
                }

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
            };
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
        updateStatus(t) { this.set('status-physique', t); }
    }

    window.onload = () => { window.App = new MasterUKF21(); };

})(window);
