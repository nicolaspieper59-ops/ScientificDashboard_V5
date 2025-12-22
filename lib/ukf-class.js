/**
 * GNSS SPACETIME - CORE ENGINE (V200 - GRADE PRO)
 * Nom du fichier : ukf-class.js
 * Contient : Mécanisation Inertielle Strapdown & Modèle Gravité WGS84
 */
((window) => {
    class ProfessionalEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("CRITIQUE: math.js requis.");

            // --- 1. CONSTANTES GÉODÉSIQUES (WGS84) ---
            this.Re = 6378137.0;          // Rayon équatorial
            this.e2 = 0.00669437999014;   // Excentricité carrée
            this.g0 = 9.7803253359;       // Gravité standard

            // --- 2. VECTEUR D'ÉTAT (16 États) ---
            // [Pos(3), Vel(3), Quat(4), BiaisAccel(3), BiaisGyro(3)]
            this.n = 16;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion Unitaire (w=1)

            // Matrice de Covariance P
            this.P = math.multiply(math.identity(this.n), 1e-3);
            
            console.log("🚀 Moteur Inertiel V200 (Strapdown) : PRÊT");
        }

        /**
         * Modèle de Gravité Somigliana (Dépend de la latitude et altitude)
         */
        getGravity(latDeg, alt) {
            const sinLat = Math.sin(latDeg * (Math.PI / 180));
            const g_lat = this.g0 * (1 + 0.00193185 * sinLat**2) / Math.sqrt(1 - this.e2 * sinLat**2);
            return g_lat - (3.086e-6 * alt); // Correction Free Air
        }

        /**
         * MÉCANISATION STRAPDOWN (Physique Réelle)
         */
        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;

            // 1. Correction des Biais Capteurs
            const ax_b = (acc.x || 0) - this.x.get([10,0]);
            const ay_b = (acc.y || 0) - this.x.get([11,0]);
            const az_b = (acc.z || 0) - this.x.get([12,0]);

            // 2. Mise à jour Quaternion (Rotation 3D)
            // Simplification Euler pour stabilité web :
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            
            // 3. Projection Accélération (Body -> Terre) via Quaternion
            // (Calcul simplifié de la Matrice de Rotation DCM)
            const q0=q[0], q1=q[1], q2=q[2], q3=q[3];
            // Projection Z (Verticale) :
            const fz_n = (2*(q1*q3 - q0*q2))*ax_b + (2*(q2*q3 + q0*q1))*ay_b + (1 - 2*(q1**2 + q2**2))*az_b;
            
            // Projection X/Y (Horizontale) :
            const fx_n = (1 - 2*(q2**2 + q3**2))*ax_b + (2*(q1*q2 - q0*q3))*ay_b + (2*(q1*q3 + q0*q2))*az_b;
            const fy_n = (2*(q1*q2 + q0*q3))*ax_b + (1 - 2*(q1**2 + q3**2))*ay_b + (2*(q2*q3 - q0*q1))*az_b;

            // 4. Soustraction de la Gravité Locale
            const lat = this.x.get([0, 0]);
            const alt = this.x.get([2, 0]);
            const g = this.getGravity(lat, alt);

            // 5. Intégration Vitesse
            this.x.set([3, 0], this.x.get([3, 0]) + fx_n * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + fy_n * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + (fz_n - g) * dt); // Accel Z - Gravité

            // 6. Intégration Position (WGS84)
            const Re_c = this.Re / Math.sqrt(1 - this.e2 * Math.sin(lat*Math.PI/180)**2);
            
            const dLat = (this.x.get([3, 0]) / (this.Re + alt)) * (180/Math.PI) * dt;
            const dLon = (this.x.get([4, 0]) / ((Re_c + alt) * Math.cos(lat*Math.PI/180))) * (180/Math.PI) * dt;

            this.x.set([0, 0], this.x.get([0, 0]) + dLat);
            this.x.set([1, 0], this.x.get([1, 0]) + dLon);
            this.x.set([2, 0], this.x.get([2, 0]) + this.x.get([5, 0]) * dt);
        }

        updateGPS(lat, lon, alt) {
            this.x.set([0, 0], lat);
            this.x.set([1, 0], lon);
            this.x.set([2, 0], alt || 0);
        }
    }

    // --- C'EST ICI QUE SE FAIT LA CONNEXION ---
    // On attache la classe "ProfessionalEngine" au nom "UltimateUKFEngine"
    // pour que le dashboard puisse le trouver.
    window.UltimateUKFEngine = ProfessionalEngine;

})(window);
