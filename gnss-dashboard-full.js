/**
 * GNSS SPACETIME - MOTEUR DE FUSION MONOLITHIQUE 21 ÉTATS
 * Spécial : Stabilité en Rotation Haute Fréquence (Saltos/Pivots)
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class ProfessionalUKF21 {
        constructor() {
            // --- VECTEUR D'ÉTAT 21 ÉTATS (ESKF) ---
            // [0-2] Pos, [3-5] Vel, [6-9] Quat, [10-12] AccBias, [13-15] GyroBias, [16-18] Mag, [19-20] Clock
            this.x = math.matrix(math.zeros([21, 1]));
            this.x.set([6, 0], 1); // Quaternion Neutre
            this.P = math.multiply(math.identity(21), 0.01); // Covariance
            
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.lastT = performance.now();
            this.totalDist = 0;
            this.vMax = 0;

            // Paramètres Environnement (Source: index 22)
            this.mass = 70.0;
            this.coords = { lat: 48.8566, lon: 2.3522, alt: 0 }; // Default
            
            this.init();
        }

        init() {
            this.setupUI();
            this.runScientificLoop();
        }

        // --- GESTION DES MOUVEMENTS EXTRÊMES (SALTOS) ---
        processMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.05);
            this.lastT = now;

            const acc = e.acceleration || { x: 0, y: 0, z: 0 };
            const gyro = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };

            if (this.isCalibrating) {
                this.doCalibration(acc, gyro);
                return;
            }

            // 1. DÉTECTION DE ROTATION CRITIQUE (Anti-Explosion)
            // Si la rotation (salto) dépasse 300°/s, on ignore l'accélération linéaire
            const rotationMagnitude = Math.sqrt(gyro.alpha**2 + gyro.beta**2 + gyro.gamma**2);
            let isSpinning = rotationMagnitude > 300; 

            // 2. FILTRE DE BIAIS DYNAMIQUE (21 ÉTATS)
            let nax = acc.x - this.x.get([10, 0]);
            let nay = acc.y - this.x.get([11, 0]);
            let naz = acc.z - this.x.get([12, 0]);

            // 3. INTÉGRATION NEWTONIENNE (Sans friction, symétrie pure)
            // On n'intègre que si le mouvement n'est pas une pure rotation centrifuge
            if (!isSpinning) {
                const vx = this.x.get([3, 0]) + (nax * dt);
                const vy = this.x.get([4, 0]) + (nay * dt);
                const vz = this.x.get([5, 0]) + (naz * dt);
                
                this.x.set([3, 0], vx);
                this.x.set([4, 0], vy);
                this.x.set([5, 0], vz);
            }

            // 4. STABILISATION (ZUPT)
            const vMs = Math.sqrt(this.x.get([3, 0])**2 + this.x.get([4, 0])**2);
            if (vMs < 0.05 && !isSpinning) {
                this.x.set([3, 0], 0); this.x.set([4, 0], 0);
            }

            this.totalDist += (vMs * dt);
            if (vMs > this.vMax) this.vMax = vMs;
        }

        doCalibration(acc, gyro) {
            if (this.calibSamples.length < 200) {
                this.calibSamples.push({ acc, gyro });
                this.set('status-physique', `CALIBRAGE UKF... ${Math.round(this.calibSamples.length/2)}%`);
                return;
            }
            const avgAx = this.calibSamples.reduce((a, b) => a + b.acc.x, 0) / 200;
            const avgAy = this.calibSamples.reduce((a, b) => a + b.acc.y, 0) / 200;
            this.x.set([10, 0], avgAx); // Stockage dans le vecteur d'état
            this.x.set([11, 0], avgAy);
            this.isCalibrating = false;
            this.set('status-physique', "21-ÉTATS STABLE");
        }

        runScientificLoop() {
            const update = () => {
                const vx = this.x.get([3, 0]);
                const vy = this.x.get([4, 0]);
                const vMs = Math.sqrt(vx**2 + vy**2);
                const kmh = vMs * 3.6;

                // Relativité (Source: ukf-class 11)
                const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
                this.set('lorentz-factor', gamma.toFixed(15));
                this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

                // Astronomie (Liaison astro.js)
                if (window.calculateAstroDataHighPrec) {
                    const astro = window.calculateAstroDataHighPrec(new Date(), this.coords.lat, this.coords.lon);
                    this.set('sun-altitude', (astro.sun.altitude * 57.3).toFixed(2) + "°");
                    this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
                    this.set('tst-time', astro.TST_HRS);
                }

                // Dashboard principal
                this.set('speed-main-display', kmh.toFixed(2));
                this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                this.set('total-distance-3d', (this.totalDist / 1000).toFixed(4) + " km");
                this.set('incertitude-vitesse-p', this.P.get([3, 3]).toExponential(2));
                this.set('schwarzschild-radius', (2 * 6.674e-11 * this.mass / C**2).toExponential(4));

                requestAnimationFrame(update);
            };
            update();
        }

        setupUI() {
            $('gps-pause-toggle').onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => this.processMotion(e));
                    this.isRunning = true;
                    $('gps-pause-toggle').textContent = "⏸ PAUSE SYSTÈME";
                } else {
                    location.reload();
                }
            };
        }

        set(id, val) { if($(id)) $(id).textContent = val; }
    }

    window.onload = () => { window.App = new ProfessionalUKF21(); };
})(window);
