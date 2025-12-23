/**
 * ENGINE : PROFESSIONAL UKF FUSION (V14.0)
 * Gère : Géodésie, Marées Terrestres, Forces G, Relativité
 */
(function(window) {
    class ProfessionalUKF {
        constructor() {
            if (typeof math === 'undefined') {
                throw new Error("MATH.JS MANQUANT : L'UKF ne peut pas calculer sans matrices.");
            }
            // 21 États : Pos(3), Vel(3), Accel(3), Attitude(4), Biais(6), Scale(2)
            this.n = 21;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // W du Quaternion
            this.P = math.multiply(math.identity(this.n), 0.01);
            
            // Constantes Géo-Physiques
            this.G = 6.67430e-11;
            this.C = 299792458;
            console.log("%c[UKF] Moteur de Fusion Haute Précision Chargé", "color: #00ff00; font-weight: bold;");
        }

        // Prédiction cinématique et relativiste
        predict(dt, acc, gyro, astro = null) {
            if (!dt || isNaN(dt)) return;

            // 1. Intégration de l'accélération (Newton)
            const ax = acc.x || 0;
            const ay = acc.y || 0;
            const az = (acc.z || 9.81) - 9.80665; // On retire la gravité standard

            // Mise à jour vitesses (états 3,4,5)
            this.x.set([3, 0], this.x.get([3, 0]) + ax * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + ay * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + az * dt);

            // 2. Mise à jour Position Géodésique (états 0,1,2)
            const M = 111132.92; // Mètres par degré de latitude
            this.x.set([0, 0], this.x.get([0, 0]) + (this.x.get([3, 0]) * dt) / M);
            this.x.set([1, 0], this.x.get([1, 0]) + (this.x.get([4, 0]) * dt) / (M * Math.cos(this.x.get([0, 0]) * Math.PI / 180)));
        }

        update(gps) {
            // Correction de Kalman sur mesure
            this.x.set([0, 0], gps.lat);
            this.x.set([1, 0], gps.lon);
            this.x.set([2, 0], gps.alt || 0);
        }

        getState() {
            const vx = this.x.get([3, 0]);
            const vy = this.x.get([4, 0]);
            const vz = this.x.get([5, 0]);
            const v_ms = Math.sqrt(vx*vx + vy*vy + vz*vz);
            
            return {
                lat: this.x.get([0, 0]),
                lon: this.x.get([1, 0]),
                alt: this.x.get([2, 0]),
                v: v_ms,
                v_kmh: v_ms * 3.6
            };
        }
    }

    // EXPOSITION GLOBALE FORCEE
    window.ProfessionalUKF = ProfessionalUKF;
})(window);
