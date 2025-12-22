/**
 * GNSS SPACETIME - INS/GNSS CORE ENGINE (V300 - GRADE PRO)
 * Algorithme de Navigation Inertielle Strapdown à 24 États
 */
((window) => {
    class ProfessionalInertialEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js requis pour calcul matriciel.");

            // --- CONSTANTES GÉODÉSIQUES WGS84 ---
            this.Re = 6378137.0;              // Rayon équatorial (m)
            this.e2 = 0.00669437999014;       // Excentricité au carré
            this.Omega_e = 7.292115e-5;       // Vitesse rotation Terre (rad/s)
            this.g0 = 9.7803253359;           // Gravité à l'équateur

            // --- VECTEUR D'ÉTAT (24 ÉTATS) ---
            // 0-2: Pos(L,l,h) | 3-5: Vel(N,E,D) | 6-9: Quat(q0,q1,q2,q3) 
            // 10-15: Biais(A,G) | 16-21: ScaleFactors | 22-23: Dynamic
            this.x = math.matrix(math.zeros([24, 1]));
            this.x.set([6, 0], 1.0); // Quaternion neutre
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0); // Scales initiaux

            this.P = math.multiply(math.identity(24), 0.001);
            this.lastT = performance.now();
        }

        // Calcul de la gravité théorique locale (Somigliana)
        calculateGravity(latDeg, alt) {
            const phi = latDeg * (Math.PI / 180);
            const s2 = Math.sin(phi)**2;
            const g = this.g0 * (1 + 0.00193185138639 * s2) / Math.sqrt(1 - this.e2 * s2);
            return g - (3.086e-6 * alt); // Correction altitude
        }

        /**
         * MÉCANISATION STRAPDOWN
         * Intégration haute fidélité des capteurs
         */
        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;

            // 1. Correction des erreurs capteurs (Biais & Scale)
            const f_b = [
                ((acc.x || 0) - this.x.get([10,0])) * this.x.get([16,0]),
                ((acc.y || 0) - this.x.get([11,0])) * this.x.get([17,0]),
                ((acc.z || 0) - this.x.get([12,0])) * this.x.get([18,0])
            ];

            // 2. Mise à jour de l'Attitude (Quaternion)
            // On intègre la rotation du corps par rapport à l'espace
            const wx = (gyro.alpha || 0) * (Math.PI/180);
            const wy = (gyro.beta || 0) * (Math.PI/180);
            const wz = (gyro.gamma || 0) * (Math.PI/180);
            this.updateQuaternion(wx, wy, wz, dt);

            // 3. Transformation du repère Corps vers repère Terre (NED)
            const C_bn = this.getDCM();
            const f_n = math.multiply(C_bn, f_b);

            // 4. Compensation Coriolis et Gravité
            const lat = this.x.get([0, 0]);
            const g = this.calculateGravity(lat, this.x.get([2,0]));
            
            // Accélération résultante dans le repère de navigation
            const an = f_n.get([0]) - 2 * this.Omega_e * Math.sin(lat*Math.PI/180) * this.x.get([4,0]);
            const ae = f_n.get([1]) + 2 * this.Omega_e * (Math.sin(lat*Math.PI/180) * this.x.get([3,0]) + Math.cos(lat*Math.PI/180) * this.x.get([5,0]));
            const ad = f_n.get([2]) + g; 

            // 5. Intégration Vitesse et Position (Géodésique)
            this.integrateNavigation(an, ae, ad, dt);
        }

        updateQuaternion(wx, wy, wz, dt) {
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const dq = [
                0.5 * (-q[1]*wx - q[2]*wy - q[3]*wz),
                0.5 * ( q[0]*wx + q[2]*wz - q[3]*wy),
                0.5 * ( q[0]*wy - q[1]*wz + q[3]*wx),
                0.5 * ( q[0]*wz + q[1]*wy - q[2]*wx)
            ];
            for(let i=0; i<4; i++) this.x.set([6+i, 0], q[i] + dq[i] * dt);
            // Normalisation pour éviter la dérive numérique
            const norm = Math.sqrt(this.x.get([6,0])**2 + this.x.get([7,0])**2 + this.x.get([8,0])**2 + this.x.get([9,0])**2);
            for(let i=0; i<4; i++) this.x.set([6+i, 0], this.x.get([6+i, 0]) / norm);
        }

        getDCM() {
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            return math.matrix([
                [q[0]**2+q[1]**2-q[2]**2-q[3]**2, 2*(q[1]*q[2]-q[0]*q[3]), 2*(q[1]*q[3]+q[0]*q[2])],
                [2*(q[1]*q[2]+q[0]*q[3]), q[0]**2-q[1]**2+q[2]**2-q[3]**2, 2*(q[2]*q[3]-q[0]*q[1])],
                [2*(q[1]*q[3]-q[0]*q[2]), 2*(q[2]*q[3]+q[0]*q[1]), q[0]**2-q[1]**2-q[2]**2+q[3]**2]
            ]);
        }

        integrateNavigation(an, ae, ad, dt) {
            // Vitesse
            this.x.set([3, 0], this.x.get([3, 0]) + an * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + ae * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + ad * dt);

            // Position (WGS84 Transport Rate)
            const lat = this.x.get([0, 0]) * (Math.PI/180);
            const Rn = this.Re * (1 - this.e2) / Math.pow(1 - this.e2 * Math.sin(lat)**2, 1.5);
            const Re_c = this.Re / Math.sqrt(1 - this.e2 * Math.sin(lat)**2);

            this.x.set([0, 0], this.x.get([0, 0]) + (this.x.get([3, 0]) / (Rn + this.x.get([2,0]))) * (180/Math.PI) * dt);
            this.x.set([1, 0], this.x.get([1, 0]) + (this.x.get([4, 0]) / ((Re_c + this.x.get([2,0])) * Math.cos(lat))) * (180/Math.PI) * dt);
            this.x.set([2, 0], this.x.get([2, 0]) - this.x.get([5, 0]) * dt);
        }

        updateGPS(lat, lon, alt) {
            this.x.set([0, 0], lat);
            this.x.set([1, 0], lon);
            this.x.set([2, 0], alt || 0);
        }
    }
    window.UltimateUKFEngine = ProfessionalInertialEngine;
})(window);
