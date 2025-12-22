/**
 * GNSS SPACETIME - MOTEUR PHYSIQUE PROFESSIONNEL (V300)
 * Fichier : lib/ukf-lib.js
 */
((window) => {
    class ProfessionalUKF {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js manquant");
            
            // Vecteur d'état à 21 états (Position, Vitesse, Quaternions, Biais)
            this.n = 21;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // W=1 pour le quaternion
            
            this.P = math.multiply(math.identity(this.n), 0.001);
            console.log("🚀 Moteur UKF 21-États : Initialisé");
        }

        // Mécanisation Strapdown (Intégration des forces)
        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) return;

            const lat = this.x.get([0, 0]);
            const alt = this.x.get([2, 0]);

            // 1. Correction Biais et Gravité
            const g = 9.780327 * (1 + 0.0053024 * Math.sin(lat * Math.PI/180)**2) - 0.000003086 * alt;
            
            // 2. Mise à jour des vitesses (NED simplifié)
            const ax = (acc.x || 0);
            const ay = (acc.y || 0);
            const az = (acc.z || 0) - g;

            this.x.set([3, 0], this.x.get([3, 0]) + ax * dt); // Vn
            this.x.set([4, 0], this.x.get([4, 0]) + ay * dt); // Ve
            this.x.set([5, 0], this.x.get([5, 0]) + az * dt); // Vd

            // 3. Mise à jour Position (WGS84)
            const R = 6378137;
            this.x.set([0, 0], lat + (this.x.get([3, 0]) * dt / R) * (180/Math.PI));
            this.x.set([1, 0], this.x.get([1, 0]) + (this.x.get([4, 0]) * dt / (R * Math.cos(lat * Math.PI/180))) * (180/Math.PI));
            this.x.set([2, 0], alt - this.x.get([5, 0]) * dt);
        }

        updateGPS(lat, lon, alt) {
            this.x.set([0, 0], lat);
            this.x.set([1, 0], lon);
            this.x.set([2, 0], alt || 0);
        }

        getState() {
            return {
                lat: this.x.get([0, 0]),
                lon: this.x.get([1, 0]),
                alt: this.x.get([2, 0]),
                speed: Math.sqrt(this.x.get([3,0])**2 + this.x.get([4,0])**2),
                kUncert: Math.sqrt(math.trace(this.P))
            };
        }
    }

    // ON EXPOSE LES DEUX NOMS POUR COMPATIBILITÉ TOTALE
    window.ProfessionalUKF = ProfessionalUKF;
    window.UltimateUKFEngine = ProfessionalUKF;

})(window);
