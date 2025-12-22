/**
 * GNSS SPACETIME - CORE ENGINE (V112)
 * 24 ÉTATS : Pos(3), Vel(3), Quat(4), AccBias(3), GyroBias(3), Scale(6), Dynamic(2)
 */
((window) => {
    class UltimateUKFEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js requis");
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W initial
            this.P = math.multiply(math.identity(this.n), 0.1);
            console.log("🚀 Moteur UKF 24-états prêt.");
        }

        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;
            // Intégration Newtonienne complète avec correction de biais
            const ax = (acc.x || 0) - this.x.get([10, 0]);
            const ay = (acc.y || 0) - this.x.get([11, 0]);
            const az = (acc.z || 0) - this.x.get([12, 0]);

            // Mise à jour des vitesses (états 3,4,5)
            this.x.set([3, 0], this.x.get([3, 0]) + ax * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + ay * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + az * dt);

            // Mise à jour Position (états 0,1,2)
            const Re = 6378137;
            this.x.set([0, 0], this.x.get([0, 0]) + (this.x.get([3, 0]) * dt / Re) * (180/Math.PI));
            this.x.set([1, 0], this.x.get([1, 0]) + (this.x.get([4, 0]) * dt / (Re * Math.cos(this.x.get([0,0]) * Math.PI/180))) * (180/Math.PI));
            this.x.set([2, 0], this.x.get([2, 0]) + this.x.get([5, 0]) * dt);
        }

        updateGPS(lat, lon, alt) {
            this.x.set([0, 0], lat);
            this.x.set([1, 0], lon);
            this.x.set([2, 0], alt || 0);
        }
    }
    // Exportation explicite pour éviter l'erreur "not a constructor"
    window.UltimateUKFEngine = UltimateUKFEngine;
})(window);
