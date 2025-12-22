/**
 * GNSS SPACETIME - MOTEUR UKF 24 ÉTATS (V115)
 * États : [Pos(3), Vel(3), Quat(4), AccBias(3), GyroBias(3), Scale(6), Dyn(2)]
 */
((window) => {
    class UltimateUKFEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js requis");
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // W Quaternion
            this.P = math.multiply(math.identity(this.n), 0.1);
            
            // Initialisation des facteurs d'échelle à 1.0
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0);
            
            this.lastT = performance.now();
            console.log("🚀 Moteur UKF 24-états : INITIALISÉ");
        }

        /**
         * Prédiction Physique (IMU)
         */
        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;

            // Correction des biais IMU (états 10-15)
            const ax = ((acc.x || 0) - this.x.get([10, 0])) * this.x.get([16, 0]);
            const ay = ((acc.y || 0) - this.x.get([11, 0])) * this.x.get([17, 0]);
            const az = ((acc.z || 0) - this.x.get([12, 0])) * this.x.get([18, 0]);

            // Intégration Vitesse
            this.x.set([3, 0], this.x.get([3, 0]) + ax * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + ay * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + az * dt);

            // Intégration Position (Modèle Terre Plate locale pour stabilité Dashboard)
            const Re = 6378137;
            const dLat = (this.x.get([3, 0]) * dt) / Re;
            const dLon = (this.x.get([4, 0]) * dt) / (Re * Math.cos(this.x.get([0, 0]) * Math.PI/180));

            this.x.set([0, 0], this.x.get([0, 0]) + dLat * (180/Math.PI));
            this.x.set([1, 0], this.x.get([1, 0]) + dLon * (180/Math.PI));
            this.x.set([2, 0], this.x.get([2, 0]) + this.x.get([5, 0]) * dt);
        }

        /**
         * Correction GPS
         */
        updateGPS(lat, lon, alt) {
            this.x.set([0, 0], lat);
            this.x.set([1, 0], lon);
            this.x.set([2, 0], alt || 0);
        }
    }
    window.UltimateUKFEngine = UltimateUKFEngine;
})(window);
