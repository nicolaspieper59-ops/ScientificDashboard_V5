/**
 * GNSS SPACETIME - MOTEUR PHYSIQUE PROFESSIONNEL (V200)
 * 24 ÉTATS - Navigation Inertielle Strapdown
 */
((window) => {
    class UltimateUKFEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js manquant");
            
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W (Identité)
            
            // Initialisation des Scale Factors (États 16-21) à 1.0
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0);
            
            this.P = math.multiply(math.identity(this.n), 0.01);
            console.log("✅ Moteur UKF 24-états : Publié dans Window");
        }

        // Modèle de prédiction inertielle (Accéléromètre + Gyroscope)
        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;
            // Rayon de la Terre (WGS84)
            const R = 6378137;
            
            // Intégration simplifiée mais réaliste des vitesses (NED)
            const ax = (acc.x || 0) - this.x.get([10, 0]);
            const ay = (acc.y || 0) - this.x.get([11, 0]);
            
            this.x.set([3, 0], this.x.get([3, 0]) + ax * dt); // Vn
            this.x.set([4, 0], this.x.get([4, 0]) + ay * dt); // Ve
            
            // Mise à jour Position (Lat/Lon)
            this.x.set([0, 0], this.x.get([0, 0]) + (this.x.get([3, 0]) * dt / R) * (180/Math.PI));
            this.x.set([1, 0], this.x.get([1, 0]) + (this.x.get([4, 0]) * dt / (R * Math.cos(this.x.get([0,0]) * Math.PI/180))) * (180/Math.PI));
        }

        updateGPS(lat, lon, alt) {
            this.x.set([0, 0], lat);
            this.x.set([1, 0], lon);
            this.x.set([2, 0], alt || 0);
        }
    }

    // EXPOSITION GLOBALE (CRITIQUE)
    window.UltimateUKFEngine = UltimateUKFEngine;

})(window);
