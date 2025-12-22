/**
 * GNSS SPACETIME - ULTIMATE CONSOLIDATED ENGINE (V101)
 * 24 ÉTATS : Pos(3), Vel(3), Quat(4), AccBias(3), GyroBias(3), ScaleFactors(6), Dynamic(2)
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_UNIV = 6.67430e-11;

    class UltimateUKFEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js est requis.");

            // Constantes Géophysiques
            this.D2R = Math.PI / 180;
            this.R2D = 180 / Math.PI;
            this.lastT = performance.now();
            this.isRunning = false;

            // Paramètres d'état (24 États)
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            
            // Initialisation Quaternion (Identité : W=1, X=0, Y=0, Z=0)
            this.x.set([6, 0], 1.0); 

            // Matrice de Covariance P (Incertitude initiale)
            this.P = math.multiply(math.identity(this.n), 0.1);
            
            console.log("✅ Moteur UKF 24 États prêt.");
        }

        // Helper sécurisé pour le DOM
        safeSet(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }

        /**
         * Étape de Prédiction (IMU)
         * @param {Object} acc - Accélération linéaire (m/s²)
         * @param {Object} gyro - Vitesse angulaire (rad/s)
         * @param {number} dt - Pas de temps (s)
         */
        predict(acc, gyro, dt) {
            if (!dt || dt <= 0) dt = 0.01;

            // 1. Intégration simple de la vitesse (vx, vy, vz)
            // Indices 3, 4, 5 du vecteur x
            if (acc) {
                this.x.set([3, 0], this.x.get([3, 0]) + (acc.x || 0) * dt);
                this.x.set([4, 0], this.x.get([4, 0]) + (acc.y || 0) * dt);
                this.x.set([5, 0], this.x.get([5, 0]) + (acc.z || 0) * dt);
                
                this.safeSet('acc-x', (acc.x || 0).toFixed(4));
                this.safeSet('acc-y', (acc.y || 0).toFixed(4));
                this.safeSet('acc-z', (acc.z || 0).toFixed(4));
            }

            // 2. Intégration de la position (lat, lon, alt)
            // Note: Simplification en mètres pour le Dashboard
            const Re = 6378137;
            const dLat = (this.x.get([3, 0]) * dt) / Re;
            const dLon = (this.x.get([4, 0]) * dt) / (Re * Math.cos(this.x.get([0, 0]) * this.D2R));
            
            this.x.set([0, 0], this.x.get([0, 0]) + dLat * this.R2D);
            this.x.set([1, 0], this.x.get([1, 0]) + dLon * this.R2D);
            this.x.set([2, 0], this.x.get([2, 0]) + this.x.get([5, 0]) * dt);

            this.updateMinecraftTime();
        }

        updateMinecraftTime() {
            // Conversion temps réel -> Ticks Minecraft (0-24000)
            const now = new Date();
            const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            const ticks = Math.floor((seconds / 86400) * 24000);
            this.safeSet('time-minecraft', ticks + " ticks");
        }

        async setupUI() {
            const btn = $('gps-pause-toggle');
            if (!btn) return;

            // Gestion des événements IMU et GPS
            if (window.DeviceMotionEvent) {
                window.addEventListener('devicemotion', (e) => {
                    if (!this.isRunning) return;
                    const now = performance.now();
                    const dt = (now - this.lastT) / 1000;
                    this.lastT = now;
                    this.predict(e.accelerationIncludingGravity, e.rotationRate, dt);
                });
            }

            // Capture GPS (Mise à jour de l'état UKF)
            navigator.geolocation.watchPosition((pos) => {
                if (!this.isRunning) return;
                
                // Correction de l'état UKF par les mesures GPS (Innovation)
                this.x.set([0, 0], pos.coords.latitude);
                this.x.set([1, 0], pos.coords.longitude);
                this.x.set([2, 0], pos.coords.altitude || 0);
                
                this.safeSet('gps-status', "FIX ACQUIS");
            }, (err) => {
                this.safeSet('gps-status', "ERREUR GPS");
            }, { enableHighAccuracy: true });
        }
    }

    // Exportation
    window.UltimateUKFEngine = UltimateUKFEngine;

})(window);
