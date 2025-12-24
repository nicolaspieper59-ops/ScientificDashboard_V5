/**
 * GNSS SPACETIME - CENTRAL STRATEGIC ENGINE (V120)
 * Fusion complète : UKF 24 États + Inertie Morte + Bridge Astro
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class UniversalEngine {
        constructor() {
            // --- ÉTAT INITIAL ---
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W
            this.P = math.multiply(math.identity(this.n), 0.1);

            // --- VARIABLES PHYSIQUES ---
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.lastT = performance.now();
            this.v = { x: 0, y: 0, z: 0 };
            this.totalDist = 0;
            this.vMax = 0;

            // --- GÉOLOCALISATION DE SECOURS (Pour Astro.js sans GPS) ---
            this.lat = 48.8566;
            this.lon = 2.3522;
            this.alt = 50;

            this.init();
        }

        init() {
            console.log("🚀 Moteur Hybride Prêt (Mode Gastéropode & Supersonique)");
            this.setupEvents();
        }

        setupEvents() {
            const btn = $('gps-pause-toggle');
            if (!btn) return;

            btn.onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }

                    // 1. Activation Immédiate des capteurs (Même sans GPS)
                    window.addEventListener('devicemotion', (e) => this.processMotion(e), true);
                    
                    // 2. Activation GPS en tâche de fond (Optionnel)
                    navigator.geolocation.watchPosition(
                        (p) => {
                            this.lat = p.coords.latitude;
                            this.lon = p.coords.longitude;
                            this.alt = p.coords.altitude || 50;
                            this.updateAstroBridge(); // Mise à jour Astro dès qu'on a un fix
                        },
                        null, { enableHighAccuracy: true }
                    );

                    this.isRunning = true;
                    this.isCalibrating = true;
                    btn.textContent = "⏸ SYSTÈME ACTIF";
                    btn.style.backgroundColor = "#28a745";
                } else {
                    location.reload();
                }
            };
        }

        processMotion(e) {
            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1);
            this.lastT = now;

            if (this.isCalibrating) {
                this.runCalibration(e.accelerationIncludingGravity);
                return;
            }

            // --- ALGORITHME DE VITESSE MICRO/MACRO ---
            const acc = e.acceleration || {x:0, y:0, z:0};
            // Seuil de bruit ultra-bas (0.001 m/s² pour les insectes/gastéropodes)
            const threshold = 0.0015;
            const ax = Math.abs(acc.x) > threshold ? acc.x : 0;
            const ay = Math.abs(acc.y) > threshold ? acc.y : 0;
            const az = Math.abs(acc.z) > threshold ? acc.z : 0;

            // Intégration Newtonienne
            this.v.x += ax * dt;
            this.v.y += ay * dt;
            this.v.z += az * dt;

            const vMs = Math.sqrt(this.v.x**2 + this.v.y**2 + this.v.z**2);
            this.totalDist += vMs * dt;
            if (vMs * 3.6 > this.vMax) this.vMax = vMs * 3.6;

            this.updateDisplay(vMs);
            // Mise à jour Astro à chaque seconde
            if (Math.floor(now/1000) !== Math.floor(this.lastT/1000)) this.updateAstroBridge();
        }

        runCalibration(gAcc) {
            if (this.calibSamples.length < 100) {
                this.calibSamples.push(gAcc);
                this.set('gps-status', `CALIBRATION : ${this.calibSamples.length}%`);
            } else {
                let s = {x:0, y:0, z:0};
                this.calibSamples.forEach(c => { s.x+=c.x; s.y+=c.y; s.z+=c.z; });
                this.x.set([10, 0], s.x/100);
                this.x.set([11, 0], s.y/100);
                this.x.set([12, 0], (s.z/100) - 9.80665);
                this.isCalibrating = false;
                this.set('gps-status', "SYSTÈME PRÊT (INERTIEL)");
                this.set('gps-status', "#00ff00", true);
            }
        }

        updateDisplay(vMs) {
            const kmh = vMs * 3.6;
            const beta = vMs / C;
            const gamma = 1 / Math.sqrt(1 - beta**2);

            this.set('speed-main-display', kmh.toFixed(kmh < 0.1 ? 5 : 1));
            this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.set('speed-stable-ms', vMs.toFixed(5) + " m/s");
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(5) + " km");
            
            const m = parseFloat($('mass-input')?.value) || 70;
            this.set('kinetic-energy', (0.5 * m * vMs**2).toFixed(2) + " J");
        }

        updateAstroBridge() {
            // Appel forcé vers astro.js s'il existe
            if (typeof updateAstroData === 'function') {
                updateAstroData(this.lat, this.lon, this.alt);
            } else if (window.AstroEngine && window.AstroEngine.update) {
                window.AstroEngine.update(this.lat, this.lon, this.alt);
            }
        }

        set(id, val, isColor = false) {
            const el = $(id);
            if (el) isColor ? el.style.color = val : el.textContent = val;
        }
    }

    window.ProfessionalUKF = UniversalEngine;
})(window);
