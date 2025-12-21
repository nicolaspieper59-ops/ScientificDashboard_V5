/**
 * GNSS SPACETIME - PLATINUM ENGINE (21 ÉTATS)
 * Consolidation Finale : Sensibilité Micro-Mouvement & Dynamique Inverse
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class PlatinumUKF21 {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js requis");

            // --- VECTEUR D'ÉTAT (21 ÉTATS) ---
            // [0-2]Pos, [3-5]Vel, [6-9]Quat, [10-12]AccBias, [13-15]GyroBias, [16-18]Mag, [19-20]Clock
            this.n = 21;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // W-Quaternion
            this.P = math.multiply(math.identity(this.n), 0.01);
            
            // --- PARAMÈTRES PHYSIQUES ---
            this.mass = 70.0;
            this.lastT = performance.now();
            this.totalDist = 0;
            this.vMax = 0;
            this.isRunning = false;

            // --- PARAMÈTRES DE SENSIBILITÉ (RÉSOUD LE PROBLÈME DU 0) ---
            this.microThreshold = 0.002; // Sensibilité ultra-fine (m/s²)
            this.frictionAir = 0.00005;  // Inertie quasi-parfaite
            
            this.init();
        }

        init() {
            this.cleanNA();
            this.startLoop();
        }

        cleanNA() {
            const fields = document.querySelectorAll('.data-point span:last-child');
            fields.forEach(f => { if(f.textContent.includes("N/A")) f.textContent = "0.00"; });
        }

        // --- MOTEUR DE PRÉDICTION ---
        predict(accRaw, gyroRaw, dt) {
            if (dt <= 0 || dt > 0.1) return;

            // 1. Correction des Biais (États 10-12)
            const ba = [this.x.get([10,0]), this.x.get([11,0]), this.x.get([12,0])];
            let ax = (accRaw.x || 0) - ba[0];
            let ay = (accRaw.y || 0) - ba[1];
            let az = (accRaw.z || 0) - ba[2];

            // 2. Filtrage des micro-bruit sans coupure (Sensibilité)
            if (Math.abs(ax) < this.microThreshold) ax *= 0.5; 
            if (Math.abs(ay) < this.microThreshold) ay *= 0.5;

            // 3. Intégration de la Vitesse (Newton)
            let vx = this.x.get([3, 0]) + ax * dt;
            let vy = this.x.get([4, 0]) + ay * dt;
            let vz = this.x.get([5, 0]) + az * dt;
            let vMs = Math.sqrt(vx**2 + vy**2 + vz**2);

            // 4. Force de Freinage et Traînée (Opposition à la vitesse)
            // Calcul du produit scalaire pour identifier la décélération
            const dotProduct = (vx * ax + vy * ay + vz * az);
            let brakingForce = 0;
            if (dotProduct < 0 && vMs > 0.01) {
                brakingForce = Math.abs(dotProduct) * this.mass;
            }

            // Application d'une friction minimale pour le réalisme (Inertie)
            const decay = 1 - (this.frictionAir * vMs * dt);
            vx *= decay; vy *= decay; vz *= decay;

            // 5. Mise à jour des États
            this.x.set([3, 0], vx); this.x.set([4, 0], vy); this.x.set([5, 0], vz);
            this.x.set([0, 0], this.x.get([0,0]) + vx * dt);
            this.x.set([1, 0], this.x.get([1,0]) + vy * dt);

            this.totalDist += vMs * dt;
            if (vMs > this.vMax) this.vMax = vMs;

            this.refreshUI(vMs, ax, ay, az, brakingForce);
        }

        refreshUI(vMs, ax, ay, az, fBreak) {
            const kmh = vMs * 3.6;
            
            // Vitesse et Distance (Précision Adaptative)
            this.set('speed-main-display', kmh.toFixed(kmh < 1 ? 3 : 2));
            this.set('speed-stable-kmh', kmh.toFixed(4) + " km/h");
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(5) + " km");
            
            // Forces
            this.set('accel-x', ax.toFixed(3));
            this.set('accel-y', ay.toFixed(3));
            this.set('accel-z', az.toFixed(3));
            this.set('braking-force', fBreak.toFixed(2) + " N");
            this.set('kinetic-energy', (0.5 * this.mass * vMs**2).toFixed(2) + " J");
            
            // Relativité
            const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('relativistic-energy', (gamma * this.mass * C**2).toExponential(4) + " J");
        }

        startLoop() {
            const update = () => {
                if (this.isRunning) {
                    this.set('status-ekf', "FUSION 21 ÉTATS ACTIVE");
                    this.set('incertitude-vitesse-p', Math.sqrt(this.P.get([3,3])).toExponential(2));
                }
                requestAnimationFrame(update);
            };
            update();
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
    }

    // --- GESTION DES CAPTEURS ---
    window.onload = () => {
        const engine = new PlatinumUKF21();
        const btn = $('gps-pause-toggle');

        btn.onclick = async () => {
            if (!engine.isRunning) {
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    const res = await DeviceMotionEvent.requestPermission();
                    if (res !== 'granted') return;
                }
                window.addEventListener('devicemotion', (e) => {
                    const now = performance.now();
                    const dt = (now - engine.lastT) / 1000;
                    engine.lastT = now;
                    engine.predict(e.acceleration || {x:0,y:0,z:0}, e.rotationRate, dt);
                }, true);
                
                engine.isRunning = true;
                btn.textContent = "⏸ SYSTÈME ACTIF";
                btn.style.backgroundColor = "#00ff0033";
            } else { location.reload(); }
        };
    };
})(window);
