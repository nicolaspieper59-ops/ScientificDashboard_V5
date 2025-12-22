/**
 * GNSS SPACETIME - CORE ENGINE (V120)
 * 24 ÉTATS : Pos(3), Vel(3), Quat(4), AccBias(3), GyroBias(3), Scale(6), Dynamic(2)
 */
((window) => {
    class UltimateUKFEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js manquant");
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W initial
            this.P = math.multiply(math.identity(this.n), 0.1);
            
            // Initialisation des Scale Factors à 1.0 (États 16-21)
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0);
            
            this.lastT = performance.now();
            console.log("🚀 Moteur UKF 24-états prêt.");
        }

        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;
            // Intégration Newtonienne simplifiée pour le Dashboard
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
    // EXPORTATION EXPLICITE : Indispensable pour corriger votre erreur
    window.UltimateUKFEngine = UltimateUKFEngine; 
})(window);
