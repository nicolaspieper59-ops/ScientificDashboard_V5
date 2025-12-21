/**
 * GNSS SPACETIME - ULTIMATE CONSOLIDATED ENGINE (V100)
 * Synthèse totale des versions 4 à 66.
 * 24 ÉTATS : Pos(3), Vel(3), Quat(4), AccBias(3), GyroBias(3), ScaleFactors(6), Dynamic(2)
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_UNIV = 6.67430e-11;

    class UltimateUKFEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js est requis pour les opérations matricielles.");

            // --- CONSTANTES GÉOPHYSIQUES & PHYSIQUES ---
            this.D2R = Math.PI / 180;
            this.R2D = 180 / Math.PI;
            this.Omega_E = 7.292115e-5; // Rotation Terre
            this.R_MAJOR = 6378137.0;
            this.FLATTENING = 1 / 298.257223563;
            this.E_SQUARED = 2 * this.FLATTENING - this.FLATTENING**2;

            // --- PARAMÈTRES D'ÉTAT (24 États pour couvrir V60+) ---
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W
            
            // Initialisation des Scale Factors à 1.0 (États 16-21)
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0);

            // Matrice de Covariance P (Incertitude)
            this.P = math.multiply(math.identity(this.n), 0.01);
            
            // --- VARIABLES DE SESSION ---
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.lastT = performance.now();
            this.totalDist = 0;
            this.vMax = 0;
            this.mass = 70.0;
            this.airResistance = 0.00005; // Friction résiduelle (V66)

            this.init();
        }

        init() {
            this.setupUI();
            this.startMainLoop();
        }

        // --- MOTEUR DE PHYSIQUE (PRÉDICTION) ---
        predict(accRaw, gyroRaw, dt) {
            if (dt <= 0 || dt > 0.1) return;

            // 1. Extraction et Correction (Biais + Scale Factors)
            const ba = [this.x.get([10,0]), this.x.get([11,0]), this.x.get([12,0])];
            const sa = [this.x.get([19,0]), this.x.get([20,0]), this.x.get([21,0])];
            
            let ax = (accRaw.x * sa[0]) - ba[0];
            let ay = (accRaw.y * sa[1]) - ba[1];
            let az = (accRaw.z * sa[2]) - ba[2];

            // 2. Rotation vers le référentiel Monde (Quaternions)
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const accWorld = this.rotateVector(q, [ax, ay, az]);

            // 3. Compensation Coriolis (V60+)
            const lat = this.x.get([0,0]) * this.D2R;
            const corX = 2 * this.Omega_E * Math.sin(lat) * this.x.get([4,0]);
            const corY = -2 * this.Omega_E * Math.sin(lat) * this.x.get([3,0]);
            
            // 4. Intégration de la Vitesse (Newton + Traînée)
            let vx = this.x.get([3,0]) + (accWorld[0] + corX) * dt;
            let vy = this.x.get([4,0]) + (accWorld[1] + corY) * dt;
            let vz = this.x.get([5,0]) + (accWorld[2]) * dt;

            // Application de la traînée aérodynamique (V66)
            const speed = Math.sqrt(vx**2 + vy**2 + vz**2);
            const decay = 1 - (this.airResistance * speed * dt);
            vx *= decay; vy *= decay; vz *= decay;

            // 5. Mise à jour Position & Distance
            this.x.set([0, 0], this.x.get([0,0]) + vx * dt);
            this.x.set([1, 0], this.x.get([1,0]) + vy * dt);
            this.x.set([2, 0], this.x.get([2,0]) + vz * dt);
            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            this.totalDist += speed * dt;
            if (speed > this.vMax) this.vMax = speed;

            // 6. Intégration des Quaternions (Gyro)
            this.integrateQuaternions(gyroRaw, dt);
        }

        // --- CALCULS RELATIVISTES ---
        updateRelativity(v) {
            const gamma = 1 / Math.sqrt(1 - Math.pow(v/C, 2));
            const energy = gamma * this.mass * C**2;
            const rs = (2 * G_UNIV * this.mass) / C**2;

            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");
            this.set('relativistic-energy', energy.toExponential(4) + " J");
            this.set('schwarzschild-radius', rs.toExponential(6) + " m");
        }

        // --- SYSTÈME DE RENDU ---
        startMainLoop() {
            const update = () => {
                if (this.isRunning) {
                    const vx = this.x.get([3,0]);
                    const vy = this.x.get([4,0]);
                    const vz = this.x.get([5,0]);
                    const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
                    const kmh = vMs * 3.6;

                    // Dashboards
                    this.set('speed-main-display', kmh.toFixed(2));
                    this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                    this.set('total-distance-3d', (this.totalDist / 1000).toFixed(5) + " km");
                    
                    // États UKF
                    this.set('incertitude-vitesse-p', Math.sqrt(this.P.get([3,3])).toExponential(2));
                    this.set('lat-ukf', this.x.get([0,0]).toFixed(7));
                    this.set('lon-ukf', this.x.get([1,0]).toFixed(7));

                    this.updateRelativity(vMs);
                    this.updateMinecraftTime();
                }
                requestAnimationFrame(update);
            };
            update();
        }

        // --- UTILITAIRES MATHÉMATIQUES (QUATERNIONS) ---
        rotateVector(q, v) {
            const [w, x, y, z] = q;
            const [vx, vy, vz] = v;
            return [
                vx*(w*w+x*x-y*y-z*z) + vy*2*(x*y-w*z) + vz*2*(x*z+w*y),
                vx*2*(x*y+w*z) + vy*(w*w-x*x+y*y-z*z) + vz*2*(y*z-w*x),
                vx*2*(x*z-w*y) + vy*2*(y*z+x*w) + vz*(w*w-x*x-y*y+z*z)
            ];
        }

        integrateQuaternions(g, dt) {
            let q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const wx = g.x || 0; const wy = g.y || 0; const wz = g.z || 0;
            const dq = [
                0.5 * (-q[1]*wx - q[2]*wy - q[3]*wz),
                0.5 * ( q[0]*wx + q[2]*wz - q[3]*wy),
                0.5 * ( q[0]*wy - q[1]*wz + q[3]*wx),
                0.5 * ( q[0]*wz + q[1]*wy - q[2]*wx)
            ];
            for(let i=0; i<4; i++) this.x.set([6+i, 0], q[i] + dq[i] * dt);
            // Normalisation (V8)
            const norm = Math.sqrt(this.x.get([6,0])**2 + this.x.get([7,0])**2 + this.x.get([8,0])**2 + this.x.get([9,0])**2);
            for(let i=0; i<4; i++) this.x.set([6+i, 0], this.x.get([6+i, 0]) / norm);
        }

        updateMinecraftTime() {
            const ticks = Math.floor(((Date.now() % 86400000) / 3600000) * 1000);
            this.set('time-minecraft', ticks);
        }

        setupUI() {
            $('gps-pause-toggle').onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        const res = await DeviceMotionEvent.requestPermission();
                        if (res !== 'granted') return;
                    }
                    window.addEventListener('devicemotion', (e) => {
                        const dt = (performance.now() - this.lastT) / 1000;
                        this.lastT = performance.now();
                        this.predict(e.acceleration, e.rotationRate || {x:0,y:0,z:0}, dt);
                    });
                    this.isRunning = true;
                    $('gps-pause-toggle').textContent = "⏸ PAUSE SYSTÈME";
                } else { location.reload(); }
            };
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
    }

    window.onload = () => { window.UKF = new UltimateUKFEngine(); };
})(window);
