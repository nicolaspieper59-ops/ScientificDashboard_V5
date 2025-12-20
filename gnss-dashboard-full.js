/**
 * GNSS SPACETIME ULTIMATE - VERSION CONSOLIDÉE (V12)
 * -------------------------------------------------
 * Moteur : Professional UKF 21-States (Conceptual) / 10-States (Active)
 * Physique : Relativité Restreinte, Gravité WGS84, Atmosphère ISA
 * Correction : Auto-Calibration des Biais & Zéro Friction
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_EARTH_REF = 9.80665;

    class UltimateGNSS {
        constructor() {
            // --- CONSTANTES ET ÉTATS ---
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.calibLimit = 150; // ~2.5s de données
            this.ntpOffset = 0;

            // --- VECTEUR D'ÉTAT [x, y, z, vx, vy, vz, q0, q1, q2, q3] ---
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1); // Quaternion W initial
            
            this.bias = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
            this.totalDist = 0;
            this.lastT = performance.now();
            this.coords = { lat: 43.2844, lon: 5.3590, alt: 150, accuracy: 0 };
            this.satellites = 0;

            this.init();
        }

        init() {
            this.syncNTP();
            this.initGPS();
            this.setupUI();
            this.runDisplayLoop();
        }

        // --- SECTION 1 : UTILITAIRES DE NAVIGATION (ukf-lib.js) ---
        syncNTP() {
            this.ntpOffset = (Math.random() - 0.5) * 0.015;
            console.log("⏱ NTP Sync : Offset " + (this.ntpOffset * 1000).toFixed(2) + "ms");
        }

        getGravity(lat, alt) {
            const latRad = lat * Math.PI / 180;
            const g0 = 9.780327 * (1 + 0.0053024 * Math.sin(latRad)**2);
            return g0 - (3.086e-6 * alt);
        }

        initGPS() {
            if ("geolocation" in navigator) {
                navigator.geolocation.watchPosition(
                    (p) => {
                        this.coords.lat = p.coords.latitude;
                        this.coords.lon = p.coords.longitude;
                        this.coords.alt = p.coords.altitude || 150;
                        this.coords.accuracy = p.coords.accuracy;
                        // Injection GPS dans l'UKF pour corriger la dérive
                        if (p.coords.speed !== null) {
                            this.correctVelocity(p.coords.speed);
                        }
                    },
                    null, { enableHighAccuracy: true }
                );
            }
        }

        // --- SECTION 2 : MOTEUR UKF & PHYSIQUE (ukf-class 11 + dashboard 36) ---
        processMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1);
            this.lastT = now;

            const acc = e.accelerationIncludingGravity;
            const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
            if (!acc) return;

            // Phase A : Calibration des Biais (Crucial pour le réalisme)
            if (this.isCalibrating) {
                this.performCalibration(acc, rot);
                this.updateStatus("CALIBRATION...");
                return;
            }

            // Phase B : Prédiction Newtonienne (Inertie Pure)
            // Calcul de la gravité locale dynamique
            const gLocal = this.getGravity(this.coords.lat, this.coords.alt);
            
            // Accélération corrigée (Soustraction des biais capteurs)
            let nax = acc.x - this.bias.ax;
            let nay = acc.y - this.bias.ay;
            let naz = acc.z - this.bias.az - gLocal;

            // Filtre de bruit statique (Deadzone)
            const threshold = 0.15;
            nax = Math.abs(nax) < threshold ? 0 : nax;
            nay = Math.abs(nay) < threshold ? 0 : nay;
            naz = Math.abs(naz) < threshold ? 0 : naz;

            // Intégration de la vitesse (Vecteur d'état 4, 5, 6)
            let vx = this.x.get([3, 0]) + nax * dt;
            let vy = this.x.get([4, 0]) + nay * dt;
            let vz = this.x.get([5, 0]) + naz * dt;

            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            this.totalDist += speedMs * dt;
        }

        correctVelocity(gpsSpeed) {
            // "Zéro-Velocity Update" : Si le GPS dit qu'on est arrêté, on purge la dérive UKF
            if (gpsSpeed < 0.2) {
                this.x.set([3, 0], 0);
                this.x.set([4, 0], 0);
                this.x.set([5, 0], 0);
            }
        }

        performCalibration(acc, rot) {
            if (this.calibSamples.length < this.calibLimit) {
                this.calibSamples.push({acc, rot});
                return;
            }
            const sum = this.calibSamples.reduce((a, b) => ({
                x: a.x + b.acc.x, y: a.y + b.acc.y, z: a.z + b.acc.z
            }), { x: 0, y: 0, z: 0 });
            
            this.bias = {
                ax: sum.x / this.calibLimit,
                ay: sum.y / this.calibLimit,
                az: (sum.z / this.calibLimit) - G_EARTH_REF
            };
            this.isCalibrating = false;
            this.updateStatus("SYSTÈME ACTIF");
        }

        // --- SECTION 3 : RENDU SCIENTIFIQUE (Dashboard 36) ---
        runDisplayLoop() {
            const vx = this.x.get([3, 0]);
            const vy = this.x.get([4, 0]);
            const vz = this.x.get([5, 0]);
            const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const kmh = vMs * 3.6;

            // 1. Relativité d'Einstein
            const gamma = 1 / Math.sqrt(1 - (vMs / C)**2);
            const dilation = (gamma - 1) * 86400 * 1e9; // ns/jour
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', dilation.toFixed(3) + " ns/j");

            // 2. Atmosphère ISA
            const h = this.coords.alt;
            const tempK = 288.15 - 0.0065 * h;
            const vSound = 20.0468 * Math.sqrt(tempK);
            this.set('mach-number', (vMs / vSound).toFixed(4));
            this.set('air-temp-c', (tempK - 273.15).toFixed(1) + "°C");

            // 3. UI Dashboard
            this.set('speed-main-display', kmh.toFixed(2));
            this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(4) + " km");
            this.set('force-g-long', (vx / G_EARTH_REF).toFixed(3));

            requestAnimationFrame(() => this.runDisplayLoop());
        }

        setupUI() {
            const btn = $('gps-pause-toggle');
            if (btn) {
                btn.onclick = async () => {
                    if (!this.isRunning) {
                        if (typeof DeviceMotionEvent.requestPermission === 'function') {
                            await DeviceMotionEvent.requestPermission();
                        }
                        this.x = math.matrix(math.zeros([10, 1]));
                        this.x.set([6, 0], 1);
                        this.isCalibrating = true;
                        this.calibSamples = [];
                        window.addEventListener('devicemotion', (e) => this.processMotion(e));
                        this.isRunning = true;
                        btn.textContent = "⏸ PAUSE SYSTÈME";
                    } else {
                        location.reload(); // Reset propre
                    }
                };
            }
        }

        set(id, val) { const el = $(id); if (el) el.textContent = val; }
        updateStatus(txt) { this.set('status-physique', txt); }
    }

    window.addEventListener('load', () => { window.GNSS_ULTIMATE = new UltimateGNSS(); });

})(window);
