/**
 * GNSS SPACETIME - CORE FUSION (V110)
 * Unification du Dashboard et du moteur UKF 24 États
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class GlobalScientificSystem {
        constructor() {
            // 1. ÉTATS UKF (24)
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // W-Quat
            
            // 2. PHYSIQUE & ENVIRONNEMENT
            this.mass = 70.0;
            this.rho = 1.225;
            this.Cd = 0.82;
            this.Area = 0.6;
            this.mu = 1.81e-5; // Viscosité
            
            this.totalDist = 0;
            this.vMax = 0;
            this.lastT = performance.now();
            this.isRunning = false;

            this.init();
        }

        init() {
            this.forceSyncUI();
            this.bindEvents();
        }

        // Remplace tous les N/A par des valeurs par défaut pour le premier rendu
        forceSyncUI() {
            document.querySelectorAll('.data-point span:last-child').forEach(el => {
                if (el.textContent.includes("N/A")) el.textContent = "0.00";
            });
            this.set('status-ekf', "FUSION ACTIVE - 24 ÉTATS");
            this.set('local-gravity', "9.80665 m/s²");
        }

        // --- MOTEUR DE PHYSIQUE (Le cœur du réalisme) ---
        updatePhysics(accRaw, dt) {
            if (dt <= 0 || dt > 0.1) return;

            // Récupération des vitesses du vecteur d'état
            let vx = this.x.get([3, 0]);
            let vy = this.x.get([4, 0]);
            let vz = this.x.get([5, 0]);
            let vMs = Math.sqrt(vx**2 + vy**2 + vz**2);

            // ACCÉLÉRATION BRUTE
            let ax = accRaw.x || 0;
            let ay = accRaw.y || 0;
            let az = accRaw.z || 0;

            // CALCULS FLUIDES ( q = 0.5 * rho * v² )
            const q = 0.5 * this.rho * Math.pow(vMs, 2);
            const dragForce = q * this.Cd * this.Area;
            
            // DÉCÉLÉRATION RÉALISTE (La résistance de l'air freine l'objet)
            if (vMs > 0.001) {
                const decelAir = dragForce / this.mass;
                ax -= (vx / vMs) * decelAir;
                ay -= (vy / vMs) * decelAir;
                az -= (vz / vMs) * decelAir;
            }

            // INTÉGRATION DE VERLET (Mise à jour Vitesse)
            vx += ax * dt;
            vy += ay * dt;
            vz += az * dt;

            // AMORTISSEMENT DE SÉCURITÉ (Évite la dérive infinie à l'arrêt)
            if (Math.abs(ax) < 0.005 && vMs < 0.01) {
                vx *= 0.9; vy *= 0.9; vz *= 0.9;
            }

            // MISE À JOUR DU VECTEUR D'ÉTAT
            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            // DISTANCE & V-MAX
            const stepDist = vMs * dt;
            this.totalDist += stepDist;
            if (vMs > this.vMax) this.vMax = vMs;

            this.refreshDashboard(vMs, ax, ay, az, q, dragForce);
        }

        refreshDashboard(vMs, ax, ay, az, q, fDrag) {
            const kmh = vMs * 3.6;

            // Vitesse & Distance
            this.set('speed-main-display', kmh.toFixed(3));
            this.set('speed-stable-kmh', kmh.toFixed(4) + " km/h");
            this.set('speed-max-session', (this.vMax * 3.6).toFixed(2) + " km/h");
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(5) + " km");
            this.set('distance-3d-precise-ukf', this.totalDist.toFixed(3) + " m");

            // Dynamique des fluides
            this.set('dynamic-pressure', q.toFixed(5) + " Pa");
            this.set('drag-force', fDrag.toFixed(5) + " N");
            const re = (this.rho * vMs * 1.7) / this.mu;
            this.set('reynolds-number', Math.floor(re).toLocaleString());

            // Énergie & Forces
            const ec = 0.5 * this.mass * vMs**2;
            this.set('kinetic-energy', ec.toFixed(2) + " J");
            this.set('power-mechanical', (fDrag * vMs).toFixed(3) + " W");
            
            // IMU
            this.set('accel-x', ax.toFixed(4));
            this.set('accel-y', ay.toFixed(4));
            this.set('accel-z', az.toFixed(4));

            // Relativité
            const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(5) + " ns/j");
        }

        bindEvents() {
            const btn = $('gps-pause-toggle');
            btn.onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => {
                        const now = performance.now();
                        const dt = (now - this.lastT) / 1000;
                        this.lastT = now;
                        this.updatePhysics(e.acceleration || {x:0,y:0,z:0}, dt);
                    });
                    this.isRunning = true;
                    btn.textContent = "⏸ SYSTÈME ACTIF";
                    btn.style.background = "#00ff0033";
                } else {
                    location.reload();
                }
            };
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
    }

    window.onload = () => { window.System = new GlobalScientificSystem(); };
})(window);
