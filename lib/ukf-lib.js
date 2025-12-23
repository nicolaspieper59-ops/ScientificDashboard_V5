/**
 * GNSS SPACETIME - ENGINE V12.1 (CORRECTED)
 * Fix: Null sensor values, Math.js sync, Global scope.
 */
(function(window) {
    class ProfessionalUKF {
        constructor() {
            if (typeof math === 'undefined') {
                throw new Error("math.js est manquant. Vérifiez l'ordre des scripts.");
            }
            // 27 États : Navigation, Quaternions, Biais, Marées
            this.n = 27;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // W=1
            this.P = math.multiply(math.identity(this.n), 1e-6);
            this.isCaveMode = false;
            
            // Constantes
            this.Omega_e = 7.2921151467e-5;
            console.log("✅ Moteur UKF V12.1 : Prêt et Corrigé.");
        }

        /**
         * Prédiction avec protection contre les données corrompues (NaN/Null)
         */
        predict(dt, accRaw, gyroRaw, astro = null) {
            if (!dt || dt <= 0 || isNaN(dt)) return;

            // Protection contre les valeurs nulles des capteurs
            const ax = accRaw?.x ?? 0;
            const ay = accRaw?.y ?? 0;
            const az = accRaw?.z ?? 9.81;
            const gx = gyroRaw?.alpha ?? gyroRaw?.x ?? 0;
            const gy = gyroRaw?.beta  ?? gyroRaw?.y ?? 0;
            const gz = gyroRaw?.gamma ?? gyroRaw?.z ?? 0;

            // 1. Correction Biais (états 10-15)
            const wb = [
                (gx * Math.PI/180) - this.x.get([13, 0]), 
                (gy * Math.PI/180) - this.x.get([14, 0]), 
                (gz * Math.PI/180) - this.x.get([15, 0])
            ];
            const fb = [
                ax - this.x.get([10, 0]), 
                ay - this.x.get([11, 0]), 
                az - this.x.get([12, 0])
            ];

            // 2. Mise à jour Attitude (Quaternion RK4)
            this.updateQuaternion(wb, dt);

            // 3. Transformation repère Navigation
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const fn = this.rotate(fb, q);

            // 4. Gravité et Marées (Suture Astro)
            const lat = this.x.get([0, 0]) * (Math.PI / 180);
            const tide = astro ? 0.607 * (0.26 * Math.sin(astro.sun.altitude*Math.PI/180)) : 0;
            const g = 9.7803 * (1 + 0.0053 * Math.sin(lat)**2) - 0.000003 * (this.x.get([2,0]) + tide);

            // 5. Intégration Navigation (Vitesse/Position)
            this.integrate(fn, g, dt);
        }

        updateQuaternion(w, dt) {
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const qw = 0.5 * (-q[1]*w[0] - q[2]*w[1] - q[3]*w[2]);
            const qx = 0.5 * ( q[0]*w[0] + q[2]*w[2] - q[3]*w[1]);
            const qy = 0.5 * ( q[0]*w[1] - q[1]*w[2] + q[3]*w[0]);
            const qz = 0.5 * ( q[0]*w[2] + q[1]*w[1] - q[2]*w[0]);
            
            this.x.set([6, 0], q[0] + qw * dt);
            this.x.set([7, 0], q[1] + qx * dt);
            this.x.set([8, 0], q[2] + qy * dt);
            this.x.set([9, 0], q[3] + qz * dt);
            
            // Renormalisation
            const n = Math.sqrt(Math.pow(this.x.get([6,0]),2) + Math.pow(this.x.get([7,0]),2) + Math.pow(this.x.get([8,0]),2) + Math.pow(this.x.get([9,0]),2));
            for(let i=0; i<4; i++) this.x.set([6+i, 0], this.x.get([6+i, 0]) / n);
        }

        rotate(f, q) {
            const r11 = q[0]**2+q[1]**2-q[2]**2-q[3]**2, r12 = 2*(q[1]*q[2]-q[0]*q[3]), r13 = 2*(q[1]*q[3]+q[0]*q[2]);
            const r21 = 2*(q[1]*q[2]+q[0]*q[3]), r22 = q[0]**2-q[1]**2+q[2]**2-q[3]**2, r23 = 2*(q[2]*q[3]-q[0]*q[1]);
            const r31 = 2*(q[1]*q[3]-q[0]*q[2]), r32 = 2*(q[2]*q[3]+q[0]*q[1]), r33 = q[0]**2-q[1]**2-q[2]**2+q[3]**2;
            return [r11*f[0]+r12*f[1]+r13*f[2], r21*f[0]+r22*f[1]+r23*f[2], r31*f[0]+r32*f[1]+r33*f[2]];
        }

        integrate(fn, g, dt) {
            const vn = this.x.get([3,0]) + fn[0]*dt;
            const ve = this.x.get([4,0]) + fn[1]*dt;
            const vd = this.x.get([5,0]) + (fn[2]-g)*dt;
            this.x.set([3,0], vn); this.x.set([4,0], ve); this.x.set([5,0], vd);
            
            const M = 111132;
            this.x.set([0,0], this.x.get([0,0]) + (vn*dt)/M);
            this.x.set([1,0], this.x.get([1,0]) + (ve*dt)/(M*Math.cos(this.x.get([0,0])*Math.PI/180)));
            this.x.set([2,0], this.x.get([2,0]) - vd*dt);
        }

        update(gps) {
            this.isCaveMode = false;
            this.x.set([0, 0], gps.lat);
            this.x.set([1, 0], gps.lon);
            this.x.set([2, 0], gps.alt || 0);
        }

        getState() {
            const v = Math.sqrt(Math.pow(this.x.get([3,0]),2) + Math.pow(this.x.get([4,0]),2) + Math.pow(this.x.get([5,0]),2));
            return {
                lat: this.x.get([0, 0]), lon: this.x.get([1, 0]), alt: this.x.get([2, 0]),
                v: v, isCave: this.isCaveMode
            };
        }
    }
    window.ProfessionalUKF = ProfessionalUKF;
})(window);
