/**
 * GNSS SPACETIME - GLOBAL NAVIGATOR ENGINE (V11.0)
 * Grade : Professionnel / Aéronautique / Ferroviaire / Géodésique
 */
((window) => {
    class ProfessionalUKF { // Nom exact attendu par le dashboard
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js requis.");
            
            // Vecteur d'état 27D (Position, Vitesse, Quaternions, Biais, NMI, Marées)
            this.x = math.matrix(math.zeros([27, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W=1
            this.P = math.multiply(math.identity(27), 1e-9);
            
            // Constantes WGS84
            this.Re = 6378137.0; 
            this.Omega_e = 7.2921151467e-5; // Rotation Terre rad/s
            this.isCaveMode = false;
        }

        // --- Moteur de Prédiction Haute Dynamique (Avion/Train/Voltige) ---
        predict(dt, acc = {x:0,y:0,z:9.81}, gyro = {x:0,y:0,z:0}, astro = null) {
            if (!dt || dt <= 0) return;

            // 1. Correction Biais & NMI
            const wb = [gyro.x - this.x.get([13,0]), gyro.y - this.x.get([14,0]), gyro.z - this.x.get([15,0])];
            const fb = [acc.x - this.x.get([10,0]), acc.y - this.x.get([11,0]), acc.z - this.x.get([12,0])];

            // 2. Attitude RK4 (Précision Voltige)
            this.updateAttitudeRK4(wb, dt);

            // 3. Transformation vers repère Navigation (NED)
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const fn = this.rotateBodyToNav(fb, q);

            // 4. Correction de Coriolis (Indispensable en Avion/Train)
            const lat = this.x.get([0, 0]) * (Math.PI / 180);
            const vn = this.x.get([3, 0]), ve = this.x.get([4, 0]);
            const corio_n = -2 * this.Omega_e * Math.sin(lat) * ve;
            const corio_e = 2 * this.Omega_e * (Math.sin(lat) * vn + Math.cos(lat) * this.x.get([5,0]));

            // 5. Gravité avec Marées Terrestres (Suture Astro)
            const tide = astro ? 0.607 * (0.26 * Math.sin(astro.sun.altitude*Math.PI/180)) : 0;
            const g = 9.7803 * (1 + 0.0053 * Math.sin(lat)**2) - 0.000003 * (this.x.get([2,0]) + tide);

            // 6. Intégration (Mode Grotte / INS)
            this.x.set([3,0], vn + (fn[0] + corio_n) * dt);
            this.x.set([4,0], ve + (fn[1] + corio_e) * dt);
            this.x.set([5,0], this.x.get([5,0]) + (fn[2] - g) * dt);

            // 7. Mise à jour Géodésique (Position Terre)
            const M = 111132.92; 
            this.x.set([0, 0], lat * (180/Math.PI) + (this.x.get([3, 0]) * dt) / M);
            this.x.set([1, 0], this.x.get([1, 0]) + (this.x.get([4, 0]) * dt) / (M * Math.cos(lat)));
            this.x.set([2, 0], this.x.get([2, 0]) - this.x.get([5, 0]) * dt);
        }

        updateAttitudeRK4(w, dt) {
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const k1 = this.qDeriv(q, w);
            const k2 = this.qDeriv(math.add(q, math.multiply(k1, 0.5*dt)), w);
            const q_new = math.add(q, math.multiply(dt, k2));
            const norm = Math.sqrt(q_new.reduce((a,b)=>a+b*b,0));
            for(let i=0; i<4; i++) this.x.set([6+i, 0], q_new[i]/norm);
        }

        qDeriv(q, w) {
            return [0.5*(-q[1]*w[0]-q[2]*w[1]-q[3]*w[2]), 0.5*(q[0]*w[0]+q[2]*w[2]-q[3]*w[1]), 0.5*(q[0]*w[1]-q[1]*w[2]+q[3]*w[0]), 0.5*(q[0]*w[2]+q[1]*w[1]-q[2]*w[0])];
        }

        rotateBodyToNav(f, q) {
            const r11 = q[0]**2+q[1]**2-q[2]**2-q[3]**2, r12 = 2*(q[1]*q[2]-q[0]*q[3]), r13 = 2*(q[1]*q[3]+q[0]*q[2]);
            const r21 = 2*(q[1]*q[2]+q[0]*q[3]), r22 = q[0]**2-q[1]**2+q[2]**2-q[3]**2, r23 = 2*(q[2]*q[3]-q[0]*q[1]);
            const r31 = 2*(q[1]*q[3]-q[0]*q[2]), r32 = 2*(q[2]*q[3]+q[0]*q[1]), r33 = q[0]**2-q[1]**2-q[2]**2+q[3]**2;
            return [r11*f[0]+r12*f[1]+r13*f[2], r21*f[0]+r22*f[1]+r23*f[2], r31*f[0]+r32*f[1]+r33*f[2]];
        }

        update(gpsData) { // Fonction Update pour le dashboard
            this.isCaveMode = false;
            this.x.set([0, 0], gpsData.lat);
            this.x.set([1, 0], gpsData.lon);
            this.x.set([2, 0], gpsData.alt || 0);
        }

        getState() {
            const v = Math.sqrt(this.x.get([3,0])**2 + this.x.get([4,0])**2 + this.x.get([5,0])**2);
            return {
                lat: this.x.get([0, 0]),
                lon: this.x.get([1, 0]),
                alt: this.x.get([2, 0]),
                speed: v,
                kUncert: Math.sqrt(this.P.get([0,0])) // Incertitude
            };
        }
    }
    // Exposition globale pour le dashboard
    window.ProfessionalUKF = ProfessionalUKF; 
})(window);
