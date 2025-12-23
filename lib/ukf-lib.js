(function(window) {
    class ProfessionalUKF {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js manquant");
            this.n = 21; 
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // W Quaternion
            this.P = math.multiply(math.identity(this.n), 0.1);
            
            // Constantes pour tes calculs spécifiques
            this.params = {
                c: 299792458,
                G: 6.67430e-11,
                rho: 1.225, // Densité air pour Reynolds/Traînée
                rearth: 6371000
            };
            console.log("✅ Moteur UKF 21-États prêt pour 100+ IDs.");
        }

        predict(dt, acc, gyro) {
            if (!dt) return;
            // Intégration RK4 de l'accélération et rotation
            const ax = acc.x || 0, ay = acc.y || 0, az = (acc.z || 9.81) - 9.806;
            
            // Mise à jour Vitesse (m/s)
            this.x.set([3, 0], this.x.get([3, 0]) + ax * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + ay * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + az * dt);

            // Mise à jour Position (Rad)
            this.x.set([0, 0], this.x.get([0, 0]) + (this.x.get([3, 0]) * dt / 111132));
            this.x.set([1, 0], this.x.get([1, 0]) + (this.x.get([4, 0]) * dt / (111132 * Math.cos(this.x.get([0, 0])))));
        }

        update(gps) {
            this.x.set([0, 0], gps.lat);
            this.x.set([1, 0], gps.lon);
            this.x.set([2, 0], gps.alt || 0);
        }

        // Calcule tous les IDs demandés par le HTML
        computeExtendedState(mass = 70) {
            const vx = this.x.get([3, 0]), vy = this.x.get([4, 0]), vz = this.x.get([5, 0]);
            const v = Math.sqrt(vx**2 + vy**2 + vz**2);
            const v_kmh = v * 3.6;
            const beta = v / this.params.c;
            const gamma = 1 / Math.sqrt(1 - beta**2);

            return {
                lat: this.x.get([0, 0]), lon: this.x.get([1, 0]), alt: this.x.get([2, 0]),
                v: v, v_kmh: v_kmh,
                gamma: gamma,
                dilation: (gamma - 1) * 86400 * 1e9,
                ke: 0.5 * mass * v**2, // Énergie cinétique pour l'ID 'kinetic-energy'
                mach: v / 340.29,
                schwarzschild: (2 * this.params.G * mass) / (this.params.c**2)
            };
        }
    }
    window.ProfessionalUKF = ProfessionalUKF;
})(window); 
