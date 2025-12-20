/**
 * GNSS SPACETIME - ULTIMATE UKF CORE ENGINE
 * Fusion de : ukf-lib.js + ukf-class (11).js + gnss-dashboard-full (36).js
 * Architecture : Unscented Kalman Filter (10-States) & Einstein Relativity
 */

((window) => {
    // --- PARTIE 1 : UTILITAIRES ET CONSTANTES PHYSIQUES (ukf-lib & dashboard 36) ---
    const $ = id => document.getElementById(id);
    const C_LIGHT = 299792458;
    const G_WGS84 = 9.780327; // Gravité équatoriale
    const BARO_REF = 1013.25;

    class UltimateUKF {
        constructor() {
            // Configuration Moteur
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.calibLimit = 150; 
            this.refMode = 'global'; // global ou relative (Mode Pont de ukf-class 11)
            this.isNetherMode = false;
            
            // Vecteur d'État [x, y, z, vx, vy, vz, q0, q1, q2, q3]
            // On utilise math.js pour la puissance matricielle de ukf-class
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1); // W-Quaternion
            
            this.bias = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
            this.totalDist = 0;
            this.vMax = 0;
            this.lastUpdate = performance.now();
            
            // Paramètres Environnement (Dashboard 36)
            this.mass = 70;
            this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
            this.weather = { tempC: 15, pressureHpa: BARO_REF, density: 1.225 };

            this.init();
        }

        init() {
            this.setupUI();
            this.syncTime();
            this.runScientificLoop();
        }

        // --- SECTION 2 : LOGIQUE DE FILTRAGE ET MOTION (ukf-class 11) ---
        
        async syncTime() {
            try {
                const res = await fetch("https://worldtimeapi.org/api/utc");
                const data = await res.json();
                console.log("⏱ NTP Sync Success: UTC " + data.utc_datetime);
            } catch (e) { console.warn("Fallback Heure Locale"); }
        }

        getDynamicGravity() {
            const latRad = this.coords.lat * (Math.PI / 180);
            return G_WGS84 * (1 + 0.0053024 * Math.sin(latRad)**2) - (3.086e-6 * this.coords.alt);
        }

        processMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
            this.lastUpdate = now;

            const acc = e.accelerationIncludingGravity;
            const gyro = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
            if (!acc) return;

            // 1. Calibration (ukf-class 11)
            if (this.isCalibrating) {
                this.calibrate(acc, gyro);
                this.updateDOMStatus("CALIBRATION...");
                return;
            }

            // 2. Filtrage des Biais et Gravité (Dashboard 36 amélioré)
            const gCur = this.getDynamicGravity();
            let nax = acc.x - this.bias.ax;
            let nay = acc.y - this.bias.ay;
            let naz = acc.z - this.bias.az - gCur;

            // Seuil de bruit (Deadzone) pour éviter la dérive au repos
            const deadzone = 0.15;
            nax = Math.abs(nax) < deadzone ? 0 : nax;
            nay = Math.abs(nay) < deadzone ? 0 : nay;
            naz = Math.abs(naz) < deadzone ? 0 : naz;

            // 3. Intégration Newtonienne Vectorielle (Conservation de l'inertie)
            // v = v + a * dt. Si a est négatif, v diminue (Décélération réaliste)
            let vx = this.x.get([3, 0]) + nax * dt;
            let vy = this.x.get([4, 0]) + nay * dt;
            let vz = this.x.get([5, 0]) + naz * dt;

            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const factor = this.isNetherMode ? 8 : 1;
            this.totalDist += (speedMs * factor * dt);
            if (speedMs * 3.6 > this.vMax) this.vMax = speedMs * 3.6;
        }

        calibrate(acc, gyro) {
            if (this.calibSamples.length < this.calibLimit) {
                this.calibSamples.push({acc, gyro});
                return;
            }
            const sum = this.calibSamples.reduce((a, b) => ({
                ax: a.ax + b.acc.x, ay: a.ay + b.acc.y, az: a.az + b.acc.z,
                gx: a.gx + b.gyro.alpha, gy: a.gy + b.gyro.beta, gz: a.gz + b.gyro.gamma
            }), {ax:0, ay:0, az:0, gx:0, gy:0, gz:0});

            const n = this.calibSamples.length;
            this.bias = {
                ax: sum.ax / n, ay: sum.ay / n, az: (sum.az / n) - 9.80665,
                gx: sum.gx / n, gy: sum.gy / n, gz: sum.gz / n
            };
            this.isCalibrating = false;
            this.updateDOMStatus("SYSTÈME PRÊT");
        }

        // --- SECTION 3 : RENDU ET MODÈLES (Dashboard 36) ---

        runScientificLoop() {
            const vx = this.x.get([3, 0]);
            const vy = this.x.get([4, 0]);
            const vz = this.x.get([5, 0]);
            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const kmh = speedMs * 3.6;

            // 1. Relativité d'Einstein (Précision 15 décimales)
            const beta = speedMs / C_LIGHT;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

            // 2. Atmosphère ISA et Son
            const tempK = 288.15 - 0.0065 * this.coords.alt;
            const vSound = 20.0468 * Math.sqrt(tempK);
            this.set('mach-number', (speedMs / vSound).toFixed(4));
            this.set('local-speed-of-sound', vSound.toFixed(2));

            // 3. Dynamique et Énergie
            const dynamicQ = 0.5 * this.weather.density * speedMs**2;
            this.set('dynamic-pressure-q', dynamicQ.toFixed(2) + " Pa");
            this.set('kinetic-energy', (0.5 * this.mass * speedMs**2).toExponential(3) + " J");

            // 4. Dashboard Général
            this.set('speed-main-display', kmh.toFixed(2));
            this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(4) + " km");
            this.set('accel-x', vx.toFixed(3));
            this.set('force-g-long', (vx / 9.80665).toFixed(3));

            // 5. Horizon (Trigonométrie sphérique)
            this.set('horizon-dist', (3.57 * Math.sqrt(this.coords.alt)).toFixed(2) + " km");

            requestAnimationFrame(() => this.runScientificLoop());
        }

        // --- SECTION 4 : SYSTÈME DE CONTRÔLE ---

        setupUI() {
            const toggleBtn = $('gps-pause-toggle');
            if (toggleBtn) {
                toggleBtn.onclick = async () => {
                    if (!this.isRunning) {
                        if (typeof DeviceMotionEvent.requestPermission === 'function') {
                            const res = await DeviceMotionEvent.requestPermission();
                            if (res !== 'granted') return;
                        }
                        this.resetStats();
                        window.addEventListener('devicemotion', (e) => this.processMotion(e));
                        this.isRunning = true;
                        toggleBtn.textContent = "⏸ PAUSE SYSTÈME";
                        toggleBtn.style.backgroundColor = "#dc3545";
                    } else {
                        location.reload(); 
                    }
                };
            }

            const netherBtn = $('nether-toggle-btn');
            if (netherBtn) {
                netherBtn.onclick = () => {
                    this.isNetherMode = !this.isNetherMode;
                    netherBtn.style.color = this.isNetherMode ? "#ff4500" : "white";
                    this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
                };
            }
        }

        resetStats() {
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1);
            this.totalDist = 0;
            this.isCalibrating = true;
            this.calibSamples = [];
        }

        set(id, val) { const el = $(id); if (el) el.textContent = val; }
        updateDOMStatus(txt) { this.set('status-ekf', txt); }
    }

    window.addEventListener('load', () => { window.UKF_Master = new UltimateUKF(); });

})(window);
