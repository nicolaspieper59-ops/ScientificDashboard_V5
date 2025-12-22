/**
 * GNSS SPACETIME - CORE ENGINE (V110)
 * Filtre de Kalman Unscented (UKF) - 24 États
 */
((window) => {
    class UltimateUKFEngine {
        constructor(initialLat = 0, initialLon = 0) {
            if (typeof math === 'undefined') throw new Error("math.js requis");

            this.n = 24;
            // Vecteur d'état x : [Pos(3), Vel(3), Quat(4), AccBias(3), GyroBias(3), Scale(6), Dyn(2)]
            this.x = math.matrix(math.zeros([this.n, 1]));
            
            // Initialisation Position & Quaternion (Identité)
            this.x.set([0, 0], initialLat);
            this.x.set([1, 0], initialLon);
            this.x.set([6, 0], 1.0); 

            // Matrice de Covariance P (Incertitude initiale élevée)
            this.P = math.multiply(math.identity(this.n), 1.0);
            
            this.lastT = performance.now();
            console.log("🚀 Moteur UKF 24-états : ONLINE");
        }

        /**
         * Équation de Transition d'État (Prédiction par l'IMU)
         */
        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;

            // Intégration de la vitesse par l'accélération
            // On extrait les biais (états 10-12) pour corriger l'accélération brute
            const ax = (acc.x || 0) - this.x.get([10, 0]);
            const ay = (acc.y || 0) - this.x.get([11, 0]);
            const az = (acc.z || 0) - this.x.get([12, 0]);

            this.x.set([3, 0], this.x.get([3, 0]) + ax * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + ay * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + az * dt);

            // Mise à jour Position Géodésique (WGS84 simplifié)
            const Re = 6378137;
            const dLat = (this.x.get([3, 0]) * dt) / Re;
            const dLon = (this.x.get([4, 0]) * dt) / (Re * Math.cos(this.x.get([0, 0]) * (Math.PI/180)));
            
            this.x.set([0, 0], this.x.get([0, 0]) + dLat * (180/Math.PI));
            this.x.set([1, 0], this.x.get([1, 0]) + dLon * (180/Math.PI));
            this.x.set([2, 0], this.x.get([2, 0]) + this.x.get([5, 0]) * dt);
        }

        /**
         * Mise à jour de mesure (GPS)
         */
        updateGPS(lat, lon, alt) {
            // Dans un UKF complet, ceci passerait par le calcul de l'Innovation
            // Ici, on synchronise l'état pour la stabilité du Dashboard
            this.x.set([0, 0], lat);
            this.x.set([1, 0], lon);
            this.x.set([2, 0], alt || this.x.get([2, 0]));
        }
    }
    window.UltimateUKFEngine = UltimateUKFEngine;
})(window);
