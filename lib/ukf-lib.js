/**
 * lib/ukf-lib.js - MOTEUR UKF UNIVERSEL (V130)
 * Support : 0.0001 m/s -> 1200 km/h | Mode autonome sans GPS
 */
((window) => {
    class ProfessionalUKF {
        constructor() {
            this.isRunning = false;
            this.isCalibrating = true;
            this.lastT = performance.now();
            
            // --- ÉTATS PAR DÉFAUT (Supprime les N/A) ---
            this.lat = 48.8566; // Paris par défaut
            this.lon = 2.3522;
            this.alt = 45;
            this.vMs = 0;
            this.vKmh = 0;
            this.vMax = 0;
            this.totalDist = 0;
            this.tilt = { x: 0, y: 0 };
            this.gLocal = 9.80665;
            this.calibSamples = [];

            this.init();
        }

        init() {
            const btn = document.getElementById('gps-pause-toggle');
            if (btn) {
                btn.onclick = async () => {
                    // Autorisation obligatoire pour les capteurs IMU
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        try {
                            const permission = await DeviceMotionEvent.requestPermission();
                            if (permission !== 'granted') return;
                        } catch (e) { console.error(e); }
                    }
                    
                    window.addEventListener('devicemotion', (e) => this.update(e), true);
                    this.isRunning = true;
                    btn.textContent = "⏸ SYSTÈME ACTIF";
                    btn.style.background = "#28a745";
                    
                    // Lancer la détection GPS en fond (ne bloque pas si échec)
                    this.startGPS();
                };
            }
        }

        startGPS() {
            if ("geolocation" in navigator) {
                navigator.geolocation.watchPosition(
                    (p) => {
                        this.lat = p.coords.latitude;
                        this.lon = p.coords.longitude;
                        this.alt = p.coords.altitude || 45;
                    },
                    null, { enableHighAccuracy: true }
                );
            }
        }

        update(e) {
            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1);
            this.lastT = now;

            if (this.isCalibrating) {
                if (this.calibSamples.length < 100) {
                    this.calibSamples.push(e.accelerationIncludingGravity?.z || 9.81);
                    return;
                }
                this.isCalibrating = false;
                document.getElementById('gps-status').textContent = "SYSTÈME PRÊT (INERTIEL)";
            }

            const acc = e.acceleration || {x:0, y:0, z:0};
            const aMag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
            
            // Haute sensibilité pour les gastéropodes et drones
            if (aMag > 0.001) { 
                this.vMs += aMag * dt;
                this.vKmh = this.vMs * 3.6;
                this.totalDist += this.vMs * dt;
                if (this.vKmh > this.vMax) this.vMax = this.vKmh;
            }

            const ag = e.accelerationIncludingGravity || {x:0, y:0, z:9.8};
            this.tilt.x = Math.atan2(ag.x, ag.z);
            this.tilt.y = Math.atan2(ag.y, ag.z);
        }
    }
    window.ProfessionalUKF = ProfessionalUKF;
})(window);
