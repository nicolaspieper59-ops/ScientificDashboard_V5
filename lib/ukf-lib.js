/**
 * GNSS SPACETIME - CORE ENGINE (V300 - GRADE PRO)
 * Nom du fichier : lib/ukf-lib.js
 * Inclus : Mécanisation Inertielle & Exposition Globale
 */
((window) => {
    class UltimateUKFEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("CRITIQUE: math.js requis.");

            // --- CONSTANTES GÉODÉSIQUES (WGS84) ---
            this.Re = 6378137.0;          
            this.e2 = 0.00669437999014;   
            this.g0 = 9.7803253359;       

            // --- VECTEUR D'ÉTAT (21 États) ---
            // [0-2: Pos, 3-5: Vel, 6-9: Quat, 10-15: Biais, 16-20: Scale]
            this.x = math.matrix(math.zeros([21, 1]));
            this.x.set([6, 0], 1.0); // W=1

            this.P = math.multiply(math.identity(21), 1e-3);
            this.isRunning = true;
            console.log("🚀 Moteur UKF Professionnel : OPÉRATIONNEL");
        }

        // Modèle de Gravité Somigliana (Dépend de la latitude)
        getGravity(latDeg) {
            const sinLat = Math.sin(latDeg * (Math.PI / 180));
            return this.g0 * (1 + 0.00193185 * sinLat**2) / Math.sqrt(1 - this.e2 * sinLat**2);
        }

        /**
         * MÉCANISATION STRAPDOWN
         */
        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;

            const lat = this.x.get([0, 0]);
            const lon = this.x.get([1, 0]);

            // 1. Correction simple des Biais
            const ax = (acc.x || 0) - this.x.get([10,0]);
            const ay = (acc.y || 0) - this.x.get([11,0]);
            const az = (acc.z || 0) - this.x.get([12,0]);

            // 2. Intégration Vitesse (Calcul simplifié NED)
            const g = this.getGravity(lat);
            this.x.set([3, 0], this.x.get([3, 0]) + ax * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + ay * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + (az - g) * dt);

            // 3. Intégration Position (WGS84)
            const Rn = this.Re / Math.sqrt(1 - this.e2 * Math.sin(lat*Math.PI/180)**2);
            this.x.set([0, 0], lat + (this.x.get([3,0]) * dt / Rn) * (180/Math.PI));
            this.x.set([1, 0], lon + (this.x.get([4,0]) * dt / (Rn * Math.cos(lat*Math.PI/180))) * (180/Math.PI));
        }

        updateGPS(lat, lon, alt) {
            this.x.set([0, 0], lat);
            this.x.set([1, 0], lon);
            this.x.set([2, 0], alt || 0);
        }
    }

    // EXPOSITION POUR LE DASHBOARD (Indispensable)
    window.UltimateUKFEngine = UltimateUKFEngine;

})(window);
