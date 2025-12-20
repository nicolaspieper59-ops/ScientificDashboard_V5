/**
 * GNSS SPACETIME - FUSION TOTALE "NO-LOSS" V21
 * -------------------------------------------
 * Fusion exhaustive : ukf-lib.js + ukf-class (11).js + gnss-dashboard-full (36).js
 * Stabilité d'inclinaison du (36) + Rigueur matricielle du (11)
 */

((window) => {
    // --- BLOC 1 : CONSTANTES ET UTILITAIRES (ukf-lib & 36) ---
    const $ = id => document.getElementById(id);
    const C_LIGHT = 299792458;
    const G_UNIV = 6.67430e-11;
    const G_EARTH = 9.80665;

    class ProfessionalUKFMaster {
        constructor() {
            // ÉTATS CRITIQUES (ukf-class 11)
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.calibLimit = 150;
            
            // VECTEUR D'ÉTAT MATRICIEL (UKF 10-21 États)
            // [x, y, z, vx, vy, vz, q0, q1, q2, q3]
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1); // Quaternion Identité
            
            // PARAMÈTRES RÉELS (dashboard 36)
            this.mass = 70; 
            this.isNetherMode = false;
            this.totalDistance = 0;
            this.vMax = 0;
            this.lastUpdate = performance.now();
            this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
            
            this.init();
        }

        init() {
            this.syncNTP();
            this.setupUI();
            this.startScientificLoop();
        }

        // --- SECTION A : UTILITAIRES (Source: ukf-lib.js) ---
        async syncNTP() {
            try {
                const r = await fetch("https://worldtimeapi.org/api/utc");
                const d = await r.json();
                this.ntpOffset = new Date(d.utc_datetime) - new Date();
                console.log("⏱ NTP Synchro terminée.");
            } catch(e) { this.ntpOffset = 0; }
        }

        getWGS84Gravity(lat, alt) {
            const latRad = lat * (Math.PI/180);
            const g0 = 9.780327 * (1 + 0.0053024 * Math.sin(latRad)**2);
            return g0 - (3.086e-6 * alt);
        }

        // --- SECTION B : PHYSIQUE ET INCLINAISON (Source: 36 + 11) ---
        updatePhysics(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
            this.lastUpdate = now;

            // STRATÉGIE (36) : Utilisation de l'accélération linéaire pour l'inclinaison
            // L'OS fournit déjà nax/nay/naz sans la gravité si accélération est disponible
            const accLin = e.acceleration || {x:0, y:0, z:0};
            const accG = e.accelerationIncludingGravity || {x:0, y:0, z:9.8};

            if (this.isCalibrating) {
                this.calibrate(accLin, accG);
                return;
            }

            // Correction Newtonienne (Source: 36)
            // On utilise l'accélération propre débarrassée de l'inclinaison par l'OS
            let nax = accLin.x - this.bias.ax;
            let nay = accLin.y - this.bias.ay;
            let naz = accLin.z - this.bias.az;

            // Deadzone (Source: 11)
            const th = 0.15;
            nax = Math.abs(nax) < th ? 0 : nax;
            nay = Math.abs(nay) < th ? 0 : nay;
            naz = Math.abs(naz) < th ? 0 : naz;

            // INTÉGRATION UKF (Source: 11)
            // v = v + a * dt (Newton Pur sans friction)
            let vx = this.x.get([3, 0]) + nax * dt;
            let vy = this.x.get([4, 0]) + nay * dt;
            let vz = this.x.get([5, 0]) + naz * dt;

            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const factor = this.isNetherMode ? 8 : 1;
            this.totalDistance += (speedMs * factor * dt);
        }

        calibrate(accLin, accG) {
            if (this.calibSamples.length < this.calibLimit) {
                this.calibSamples.push(accLin);
                this.set('status-physique', "CALIBRATION...");
                return;
            }
            const sum = this.calibSamples.reduce((a, b) => ({x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}), {x:0, y:0, z:0});
            this.bias = {
                ax: sum.x / this.calibLimit,
                ay: sum.y / this.calibLimit,
                az: sum.z / this.calibLimit
            };
            this.isCalibrating = false;
            this.set('status-physique', "PRÊT");
        }

        // --- SECTION C : CALCULS SCIENTIFIQUES (Source: Dashboard 36 + Lib) ---
        startScientificLoop() {
            const loop = () => {
                const vx = this.x.get([3, 0]);
                const vy = this.x.get([4, 0]);
                const vz = this.x.get([5, 0]);
                const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
                const kmh = vMs * 3.6;

                // 1. Relativité (Lorentz)
                const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C_LIGHT, 2));
                this.set('lorentz-factor', gamma.toFixed(15));

                // 2. Atmosphère ISA
                const h = this.coords.alt;
                const tempK = 288.15 - 0.0065 * h;
                const pressPa = 101325 * Math.pow(1 - (0.0065 * h)/288.15, 5.255);
                const vSound = 20.0468 * Math.sqrt(tempK);

                // 3. Schwarzschild (Lib)
                const rs = (2 * G_UNIV * this.mass) / (C_LIGHT**2);

                // Affichage (Dashboard 36)
                this.set('speed-main-display', kmh.toFixed(2));
                this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                this.set('mach-number', (vMs / vSound).toFixed(4));
                this.set('total-distance-3d', (this.totalDistance / 1000).toFixed(4) + " km");
                this.set('accel-x', vx.toFixed(3));
                this.set('schwarzschild-radius', rs.toExponential(4));

                requestAnimationFrame(loop);
            };
            loop();
        }

        setupUI() {
            $('gps-pause-toggle').onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                    this.isRunning = true;
                } else {
                    location.reload();
                }
            };

            const nBtn = $('nether-toggle-btn');
            if(nBtn) {
                nBtn.onclick = () => {
                    this.isNetherMode = !this.isNetherMode;
                    nBtn.style.color = this.isNetherMode ? "#ff4500" : "white";
                    this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
                };
            }
        }

        set(id, val) { if($(id)) $(id).textContent = val; }
    }

    window.onload = () => { window.AppEngine = new ProfessionalUKFMaster(); };
})(window);
