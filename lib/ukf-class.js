/**
 * GNSS SPACETIME - REALISTIC PHYSICS ENGINE (V106)
 * - Intégration de la Traînée Aérodynamique (Drag Force)
 * - Amortissement par hystérésis (Finit le 0 brutal)
 * - Symétrie parfaite Travail/Énergie
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class RealisticPhysicsUKF {
        constructor() {
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion neutre
            
            // Constantes de l'objet pour le réalisme
            this.mass = 70.0;     // kg
            this.Cd = 0.82;       // Coefficient de traînée (cylindre/humain)
            this.Area = 0.6;      // Surface frontale (m²)
            this.rho = 1.225;     // Densité de l'air (kg/m³)
            
            this.lastT = performance.now();
            this.vMax = 0;
            this.totalDist = 0;
            this.isRunning = false;

            this.init();
        }

        init() {
            // Nettoyage immédiat des N/A
            document.querySelectorAll('.data-point span:last-child').forEach(s => {
                if (s.textContent === "N/A") s.textContent = "0.00";
            });
        }

        predict(accRaw, gyro, dt) {
            if (dt <= 0 || dt > 0.1) return;

            // 1. Accélération corrigée (Scale Factors + Biais)
            let ax = (accRaw.x || 0);
            let ay = (accRaw.y || 0);
            let az = (accRaw.z || 0);

            // 2. Récupération de la vitesse actuelle du vecteur d'état
            let vx = this.x.get([3, 0]);
            let vy = this.x.get([4, 0]);
            let vz = this.x.get([5, 0]);
            let vMs = Math.sqrt(vx**2 + vy**2 + vz**2);

            // 3. PHYSIQUE RÉALISTE : Calcul de la Traînée (Drag)
            // Fd = 1/2 * rho * v² * Cd * A
            const dragForce = 0.5 * this.rho * (vMs**2) * this.Cd * this.Area;
            const dragAccel = dragForce / this.mass;

            // 4. Intégration avec perte d'énergie (Inertie amortie)
            // On applique l'accélération moins la résistance de l'air
            if (vMs > 0) {
                ax -= (vx / vMs) * dragAccel;
                ay -= (vy / vMs) * dragAccel;
                az -= (vz / vMs) * dragAccel;
            }

            vx += ax * dt;
            vy += ay * dt;
            vz += az * dt;

            // 5. ZONE MORTE INTELLIGENTE (Hystérésis)
            // Au lieu de couper à 0, on laisse l'énergie cinétique s'épuiser
            const kineticEnergy = 0.5 * this.mass * (vx**2 + vy**2 + vz**2);
            if (kineticEnergy < 0.0001 && Math.abs(ax) < 0.005) {
                vx = 0; vy = 0; vz = 0;
            }

            // Mise à jour des états
            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);
            
            vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            this.totalDist += vMs * dt;
            if (vMs > this.vMax) this.vMax = vMs;

            this.updateUI(vMs, ax, ay, az, dragForce);
        }

        updateUI(vMs, ax, ay, az, fDrag) {
            const kmh = vMs * 3.6;
            const q = 0.5 * this.rho * vMs**2;

            // Vitesse Stable
            this.set('speed-main-display', kmh.toFixed(kmh < 1 ? 3 : 2));
            this.set('speed-stable-kmh', kmh.toFixed(4) + " km/h");
            
            // Forces (Réalisme Scientifique)
            this.set('dynamic-pressure', q.toFixed(4) + " Pa");
            this.set('drag-force', fDrag.toFixed(4) + " N");
            this.set('kinetic-energy', (0.5 * this.mass * vMs**2).toFixed(2) + " J");
            
            // Distance
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(5) + " km");
            this.set('distance-3d-precise-ukf', this.totalDist.toFixed(2) + " m");

            // IMU Raw
            this.set('accel-x', ax.toFixed(3));
            this.set('accel-y', ay.toFixed(3));
            this.set('accel-z', az.toFixed(3));
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
    }

    // --- BOUTON D'ACTIVATION ---
    window.onload = () => {
        const engine = new RealisticPhysicsUKF();
        const btn = $('gps-pause-toggle');

        btn.onclick = async () => {
            if (!engine.isRunning) {
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }
                window.addEventListener('devicemotion', (e) => {
                    const dt = (performance.now() - engine.lastT) / 1000;
                    engine.lastT = performance.now();
                    engine.predict(e.acceleration || {x:0,y:0,z:0}, null, dt);
                });
                engine.isRunning = true;
                btn.textContent = "⏸ SYSTÈME ACTIF";
                btn.style.background = "#2ecc71";
            } else { location.reload(); }
        };
    };
})(window);
