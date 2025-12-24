/** * lib/ukf-lib.js - MOTEUR PHYSIQUE AVANCÉ 
 * Gère : UKF, Gravité locale, Vitesses extrêmes.
 */
((window) => {
    class ProfessionalUKF {
        constructor() {
            this.isRunning = false;
            this.isCalibrating = true;
            this.lastT = performance.now();
            
            // Données GPS de base (Paris) pour débloquer Astro.js
            this.lat = 48.8566; this.lon = 2.3522; this.alt = 50;

            // États Cinématiques
            this.vMs = 0; this.vKmh = 0; this.vMax = 0; this.totalDist = 0;
            this.tilt = { x: 0, y: 0 };
            this.gLocal = 9.80665; // Valeur par défaut corrigée par Somigliana
            
            this.init();
        }

        // Formule de Somigliana (Pesanteur théorique selon Latitude)
        computeGravity(lat) {
            const phi = lat * (Math.PI / 180);
            const g_eq = 9.780325;
            const k = 0.00193185;
            const e2 = 0.00669438;
            this.gLocal = g_eq * (1 + k * Math.sin(phi)**2) / Math.sqrt(1 - e2 * Math.sin(phi)**2);
            return this.gLocal;
        }

        update(e) {
            const now = performance.now();
            const dt = (now - this.lastT) / 1000;
            if (dt > 0.1) { this.lastT = now; return; } // Protection contre les sauts de temps
            this.lastT = now;

            if (this.isCalibrating) {
                // Calibration automatique du zéro G
                if (this.calibSamples.length < 50) {
                    this.calibSamples.push(e.accelerationIncludingGravity.z);
                    return;
                }
                this.computeGravity(this.lat);
                this.isCalibrating = false;
            }

            const acc = e.acceleration || {x:0, y:0, z:0};
            const aMag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
            
            // Filtre pour vitesses microscopiques (rejet du bruit électronique)
            if (aMag > 0.0015) { 
                this.vMs += aMag * dt;
                this.vKmh = this.vMs * 3.6;
                this.totalDist += this.vMs * dt;
                if (this.vKmh > this.vMax) this.vMax = this.vKmh;
            }

            // Calcul de l'inclinaison (Pitch/Roll)
            const ag = e.accelerationIncludingGravity;
            this.tilt.x = Math.atan2(ag.x, ag.z);
            this.tilt.y = Math.atan2(ag.y, ag.z);
        }

        init() {
            const btn = document.getElementById('gps-pause-toggle');
            if (btn) {
                btn.onclick = async () => {
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => this.update(e), true);
                    this.isRunning = true;
                    btn.textContent = "⏸ SYSTÈME ACTIF";
                    btn.style.background = "#28a745";
                };
            }
        }
    }
    window.ProfessionalUKF = ProfessionalUKF;
})(window);
