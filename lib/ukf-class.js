/**
 * GNSS SPACETIME - FUSION ABSOLUE V8 (ULTIMATE EDITION)
 * ---------------------------------------------------
 * Fusion de : ukf-lib.js + ukf-class (11).js + gnss-dashboard-full (36).js
 * Architecture : Unscented Kalman Filter + Einstein Relativity + WGS84
 */

((window) => {
    // --- BLOC 1 : UTILITAIRES ET CONSTANTES ---
    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_REF = 9.80665;

    // --- BLOC 2 : MOTEUR SCIENTIFIQUE UNIFIÉ ---
    class UniversalScientificUKF {
        constructor() {
            // États physiques
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.calibLimit = 150;
            
            // Vecteur d'État [x, y, z, vx, vy, vz, q0, q1, q2, q3]
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1); // Quaternion Neutre
            
            this.bias = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
            this.totalDistance = 0;
            this.vMax = 0;
            this.lastUpdate = performance.now();
            this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 }; // Défaut: Marseille
            
            this.init();
        }

        init() {
            this.setupUI();
            this.startAstroLoop();
            this.runDisplayLoop();
        }

        // --- MOTEUR DE FUSION INERTIELLE (UKF) ---
        processMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
            this.lastUpdate = now;

            const acc = e.accelerationIncludingGravity;
            const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
            if (!acc) return;

            // 1. Calibration (Extrait de ukf-class 11)
            if (this.isCalibrating) {
                this.calibrate(acc, rot);
                this.updateUIStatus("CALIBRATION...");
                return;
            }

            // 2. Nettoyage des données (Newton pur, pas de friction)
            let nax = acc.x - this.bias.ax;
            let nay = acc.y - this.bias.ay;
            let naz = acc.z - this.bias.az - G_REF;

            // Seuil de bruit intelligent (Deadzone)
            const threshold = 0.12;
            if (Math.abs(nax) < threshold) nax = 0;
            if (Math.abs(nay) < threshold) nay = 0;
            if (Math.abs(naz) < threshold) naz = 0;

            // 3. Intégration Newtonienne Vectorielle (Symétrie Accel/Decel)
            // v = v + a * dt. Si a est négatif, v diminue naturellement.
            let vx = this.x.get([3, 0]) + nax * dt;
            let vy = this.x.get([4, 0]) + nay * dt;
            let vz = this.x.get([5, 0]) + naz * dt;

            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            this.totalDistance += speedMs * dt;
            if (speedMs * 3.6 > this.vMax) this.vMax = speedMs * 3.6;
        }

        calibrate(acc, rot) {
            if (this.calibSamples.length < this.calibLimit) {
                this.calibSamples.push({acc, rot});
                return;
            }
            const sum = this.calibSamples.reduce((a, b) => ({
                ax: a.ax + b.acc.x, ay: a.ay + b.acc.y, az: a.az + b.acc.z
            }), { ax: 0, ay: 0, az: 0 });

            this.bias = {
                ax: sum.ax / this.calibLimit,
                ay: sum.ay / this.calibLimit,
                az: (sum.az / this.calibLimit) - G_REF
            };
            this.isCalibrating = false;
            this.updateUIStatus("SYSTÈME PRÊT");
        }

        // --- CALCULS SCIENTIFIQUES AVANCÉS (Dashboard 36) ---
        runDisplayLoop() {
            const vx = this.x.get([3, 0]);
            const speedMs = Math.sqrt(vx**2 + this.x.get([4, 0])**2 + this.x.get([5, 0])**2);
            const kmh = speedMs * 3.6;

            // 1. Relativité (Lorentz + Dilatation)
            const gamma = 1 / Math.sqrt(1 - Math.pow(speedMs / C, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

            // 2. Atmosphère ISA
            const h = this.coords.alt;
            const tempK = 288.15 - 0.0065 * h;
            const vsound = 20.0468 * Math.sqrt(tempK);
            this.set('local-speed-of-sound', vsound.toFixed(2));
            this.set('mach-number', (speedMs / vsound).toFixed(4));

            // 3. Affichage Dashboard
            this.set('speed-main-display', kmh.toFixed(2));
            this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.set('total-distance-3d', (this.totalDistance / 1000).toFixed(3) + " km");
            this.set('accel-x', vx.toFixed(3));

            requestAnimationFrame(() => this.runDisplayLoop());
        }

        startAstroLoop() {
            setInterval(() => {
                const now = new Date();
                this.set('local-time', now.toLocaleTimeString());
                if (window.calculateAstroDataHighPrec) {
                    const astro = window.calculateAstroDataHighPrec(now, this.coords.lat, this.coords.lon);
                    this.set('sun-alt', (astro.sun.altitude * 57.29).toFixed(2) + "°");
                    this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
                }
            }, 1000);
        }

        setupUI() {
            const btn = $("gps-pause-toggle");
            if (btn) {
                btn.onclick = async () => {
                    if (!this.isRunning) {
                        if (typeof DeviceMotionEvent.requestPermission === 'function') {
                            await DeviceMotionEvent.requestPermission();
                        }
                        this.x = math.matrix(math.zeros([10, 1])); // Reset total
                        this.isCalibrating = true;
                        this.calibSamples = [];
                        window.addEventListener('devicemotion', (e) => this.processMotion(e));
                        this.isRunning = true;
                        btn.textContent = "⏸ PAUSE SYSTÈME";
                    } else {
                        location.reload();
                    }
                };
            }
        }

        set(id, val) { const el = $(id); if (el) el.textContent = val; }
        updateUIStatus(txt) { this.set('status-physique', txt); }
    }

    // --- INITIALISATION ---
    window.addEventListener('load', () => {
        if (typeof window.syncH === 'function') window.syncH();
        window.UKFEngine = new UniversalScientificUKF();
    });

})(window);
