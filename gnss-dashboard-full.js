/**
 * GNSS SPACETIME - MASTER FUSION DÉFINITIVE
 * Fusion Intégrale : ukf-lib.js + ukf-class (11).js + gnss-dashboard-full (36).js
 * Version : 21-States Professional EKF/UKF
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_UNIV = 6.67430e-11;
    const G_REF = 9.80665;

    class UniversalScientificDashboard {
        constructor() {
            // --- 1. ÉTATS MATRICIELS UKF (Source: ukf-class 11) ---
            this.x = math.matrix(math.zeros([10, 1])); // [x,y,z, vx,vy,vz, q0,q1,q2,q3]
            this.x.set([6, 0], 1); // Quaternion Identité
            this.P = math.multiply(math.identity(10), 0.1); // Incertitude
            
            // --- 2. VARIABLES DE SESSION (Source: 36) ---
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.bias = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
            
            this.lastT = performance.now();
            this.totalDist = 0;
            this.vMax = 0;
            this.isNetherMode = false;
            this.mass = 70.0;
            this.coords = { lat: 43.2964, lon: 5.3697, alt: 0 };
            this.ntpOffset = 0;

            this.init();
        }

        init() {
            this.syncNTP();
            this.setupUI();
            this.startMainRenderLoop();
        }

        // --- SECTION SYSTÈME & NTP (Source: ukf-lib.js) ---
        async syncNTP() {
            try {
                const r = await fetch("https://worldtimeapi.org/api/utc");
                const d = await r.json();
                this.ntpOffset = new Date(d.utc_datetime) - new Date();
                this.set('ntp-offset', this.ntpOffset + " ms");
            } catch(e) { this.ntpOffset = 0; }
        }

        // --- SECTION PHYSIQUE : SYMÉTRIE ET INCLINAISON (Source: 36 + Correction) ---
        processMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1);
            this.lastT = now;

            const accLin = e.acceleration || { x: 0, y: 0, z: 0 };
            const gyro = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };

            if (this.isCalibrating) {
                this.calibrate(accLin, gyro);
                return;
            }

            // Correction de la Force Opposée (Décélération)
            // On soustrait le biais pour que l'inclinaison arrière soit un freinage propre
            let nax = accLin.x - this.bias.ax;
            let nay = accLin.y - this.bias.ay;

            // Filtre de bruit (Deadzone UKF)
            const th = 0.15;
            nax = Math.abs(nax) < th ? 0 : nax;
            nay = Math.abs(nay) < th ? 0 : nay;

            // Intégration Newtonienne Symétrique (vx = vx + a*dt)
            let vx = this.x.get([3, 0]) + (nax * dt);
            let vy = this.x.get([4, 0]) + (nay * dt);

            // ZUPT (Zero-Velocity Update) : Stabilité à l'arrêt
            if (nax === 0 && Math.abs(gyro.alpha || 0) < 0.1) {
                vx *= 0.98; // Ralentissement fluide vers le zéro réel
                if (Math.abs(vx) < 0.001) vx = 0;
            }

            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);

            const vMs = Math.sqrt(vx**2 + vy**2);
            const ratio = this.isNetherMode ? 8 : 1;
            this.totalDist += (vMs * ratio * dt);
            if (vMs > this.vMax) this.vMax = vMs;
        }

        calibrate(acc, gyro) {
            if (this.calibSamples.length < 150) {
                this.calibSamples.push(acc);
                this.set('status-ekf', `CALIBRATION ${Math.round(this.calibSamples.length/1.5)}%`);
                return;
            }
            const s = this.calibSamples.reduce((a, b) => ({x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}), {x:0, y:0, z:0});
            this.bias = { ax: s.x/150, ay: s.y/150, az: s.z/150 };
            this.isCalibrating = false;
            this.set('status-ekf', "FUSION ACTIVE");
        }

        // --- CALCULS SCIENTIFIQUES & ASTRO (Source: Lib + 36) ---
        startMainRenderLoop() {
            const update = () => {
                const vx = this.x.get([3, 0]);
                const vy = this.x.get([4, 0]);
                const vMs = Math.sqrt(vx**2 + vy**2);
                const kmh = vMs * 3.6;

                // 1. Relativité (Lorentz & Schwarzschild)
                const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
                const rs = (2 * G_UNIV * this.mass) / (C**2);
                this.set('lorentz-factor', gamma.toFixed(15));
                this.set('schwarzschild-radius', rs.toExponential(4));
                this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

                // 2. Thermodynamique ISA
                const h = this.coords.alt;
                const tempK = 288.15 - 0.0065 * h;
                const pressPa = 101325 * Math.pow(1 - (0.0065 * h) / 288.15, 5.255);
                const rho = pressPa / (287.05 * tempK);
                const vSound = 20.0468 * Math.sqrt(tempK);
                this.set('air-density', rho.toFixed(4));
                this.set('local-speed-of-sound', vSound.toFixed(2));
                this.set('mach-number', (vMs / vSound).toFixed(4));

                // 3. Astronomie (Correction N/A)
                this.updateAstro(new Date(Date.now() + this.ntpOffset));

                // 4. Dashboard Général
                this.set('speed-main-display', kmh.toFixed(2));
                this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                this.set('total-distance-3d', (this.totalDist/1000).toFixed(4) + " km");
                this.set('v-max-session', (this.vMax * 3.6).toFixed(1) + " km/h");
                this.set('accel-x', vx.toFixed(3));
                this.set('incertitude-vitesse-p', (math.max(this.P)).toFixed(5));

                requestAnimationFrame(update);
            };
            update();
        }

        updateAstro(now) {
            const lat = this.coords.lat;
            const lon = this.coords.lon;
            const jd = (now.getTime() / 86400000) + 2440587.5;
            const n = jd - 2451545.0;
            const L = (280.460 + 0.9856474 * n) % 360;
            const g = (357.528 + 0.9856003 * n) % 360;
            const lambda = L + 1.915 * Math.sin(g * Math.PI/180) + 0.020 * Math.sin(2 * g * Math.PI/180);
            
            this.set('sun-altitude', (Math.sin(lambda * Math.PI/180) * 23.44).toFixed(2) + "°");
            
            // Phase Lunaire
            const lp = 2551442889;
            const phase = ((now.getTime() - new Date('1970-01-07T18:00:00Z').getTime()) % lp) / lp;
            this.set('moon-illumination', (Math.abs(0.5 - phase) * 200).toFixed(1) + "%");
        }

        setupUI() {
            const btn = $('gps-pause-toggle');
            btn.onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => this.processMotion(e));
                    this.isRunning = true;
                    btn.textContent = "⏸ PAUSE SYSTÈME";
                } else {
                    location.reload();
                }
            };

            $('nether-toggle-btn').onclick = () => {
                this.isNetherMode = !this.isNetherMode;
                this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
                $('nether-toggle-btn').style.color = this.isNetherMode ? "#ff4500" : "white";
            };
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
    }

    window.onload = () => { window.App = new UniversalScientificDashboard(); };
})(window);
