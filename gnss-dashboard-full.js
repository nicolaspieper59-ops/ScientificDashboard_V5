/**
 * GNSS SPACETIME - ORCHESTRATEUR FINAL V106
 * Inclus : Synchronisation Offset 1ms, Physique Relativiste, et Suture UKF-Astro
 */

(function(window) {
    const $ = id => document.getElementById(id);

    class MasterSystem {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.mass = 70.0; // Masse par défaut
            this.C = 299792458;
            this.G = 6.67430e-11;
            
            this.init();
        }

        init() {
            console.log("💎 Lancement du Master System...");
            
            // 1. Injection immédiate des constantes (Pour enlever les N/A au démarrage)
            this.injectConstants();

            // 2. Initialisation de la carte
            if (typeof L !== 'undefined' && $('map-container')) {
                this.map = L.map('map-container').setView([43.29, 5.37], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
            }

            // 3. Liaison du bouton MARCHE/ARRÊT
            const btn = $('gps-pause-toggle');
            if (btn) {
                btn.onclick = async () => this.handleToggle();
            }

            // 4. Boucle de synchronisation 0.001s
            this.startLoop();
        }

        // Système "Safe Set" pour éviter les crashs si l'ID HTML manque
        safeSet(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }

        injectConstants() {
            const Rs = (2 * this.G * this.mass) / Math.pow(this.C, 2);
            const E0 = this.mass * Math.pow(this.C, 2);
            this.safeSet('schwarzschild-radius', Rs.toExponential(8) + " m");
            this.safeSet('rest-mass-energy', E0.toExponential(8) + " J");
            this.safeSet('vitesse-la-lumiere-c', this.C + " m/s");
        }

        async handleToggle() {
            const btn = $('gps-pause-toggle');
            if (!this.isRunning) {
                // Demande de permission capteurs (iOS/Chrome)
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }

                if (typeof UltimateUKFEngine !== 'undefined') {
                    this.engine = new UltimateUKFEngine();
                    window.AppUKF = this.engine;
                    this.engine.isRunning = true;
                    if (this.engine.setupUI) this.engine.setupUI();
                    
                    this.isRunning = true;
                    btn.innerHTML = "🛑 ARRÊT GPS";
                    btn.style.background = "#dc3545";
                    this.safeSet('master-mode', "MODE DYNAMIQUE ACTIF");
                }
            } else {
                location.reload(); // Reset propre
            }
        }

        startLoop() {
            const run = () => {
                const now = new Date();
                const ms = now.getMilliseconds().toString().padStart(3, '0');
                
                // Heure Locale & UTC haute précision
                this.safeSet('local-time', now.toLocaleTimeString() + "." + ms);
                this.safeSet('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 23));

                if (this.isRunning && this.engine) {
                    this.updateData(now);
                }
                requestAnimationFrame(run);
            };
            run();
        }

        updateData(now) {
            try {
                // Extraction depuis le moteur UKF (Fichier ukf-class 13)
                const lat = this.engine.x.get([0, 0]);
                const lon = this.engine.x.get([1, 0]);
                const vx = this.engine.x.get([3, 0]);
                const vy = this.engine.x.get([4, 0]);
                const v = Math.sqrt(vx**2 + vy**2);

                if (lat !== 0) {
                    this.safeSet('lat-ukf', lat.toFixed(7));
                    this.safeSet('lon-ukf', lon.toFixed(7));
                    this.safeSet('gps-status', "FIX GPS OK");

                    // Suture avec astro.js (Astronomie Réelle)
                    if (typeof computeAstroAll === 'function') {
                        const astro = computeAstroAll(now, lat, lon);
                        this.safeSet('sun-alt', astro.sun.altitude.toFixed(4) + "°");
                        this.safeSet('moon-phase-name', astro.moon.illumination.phase_name);
                        this.safeSet('moon-distance', (astro.moon.distance / 1000).toLocaleString() + " km");
                    }
                }

                // Physique Relativiste
                const beta = v / this.C;
                const gamma = 1 / Math.sqrt(1 - beta**2);
                this.safeSet('mach-number', (v / 340.29).toFixed(5));
                this.safeSet('lorentz-factor', gamma.toFixed(14));

            } catch (err) {
                console.warn("Attente des données UKF...");
            }
        }
    }

    window.addEventListener('load', () => { window.Master = new MasterSystem(); });
})(window);
