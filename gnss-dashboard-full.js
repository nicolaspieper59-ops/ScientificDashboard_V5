/**
 * GNSS SPACETIME - ORCHESTRATEUR SUPRÊME (V100 PRO)
 * Synchronisation : 0.001s | Précision : Scientifique
 */

(function(window) {
    const $ = id => document.getElementById(id);

    class MasterSystem {
        constructor() {
            this.C = 299792458;
            this.G = 6.67430e-11;
            this.mass = 70.0;
            this.isRunning = false;
            this.startTime = null;
            this.engine = null; 

            this.init();
        }

        init() {
            console.log("💎 Système Spacetime : Activation du Pilote...");
            this.setupMap();
            this.injectConstants();
            this.bindControls();
            this.startSyncLoop();
        }

        injectConstants() {
            const Rs = (2 * this.G * this.mass) / Math.pow(this.C, 2);
            const E0 = this.mass * Math.pow(this.C, 2);
            this.set('schwarzschild-radius', Rs.toExponential(8) + " m");
            this.set('rest-mass-energy', E0.toExponential(8) + " J");
            this.set('vitesse-la-lumiere-c', this.C + " m/s");
            this.set('gravitational-constant', this.G.toExponential(5));
        }

        bindControls() {
            const btn = $('gps-pause-toggle');
            if (!btn) return;
            btn.onclick = async () => {
                if (!this.isRunning) {
                    if (typeof UltimateUKFEngine !== 'undefined') {
                        this.engine = new UltimateUKFEngine();
                        window.AppUKF = this.engine;
                        await this.engine.setupUI(); // Active GPS & IMU
                        this.isRunning = true;
                        this.startTime = Date.now();
                        btn.innerHTML = "🛑 ARRÊT GPS";
                        btn.style.background = "#dc3545";
                        console.log("📡 Moteur UKF 24 États Verrouillé.");
                    }
                } else {
                    location.reload();
                }
            };
        }

        startSyncLoop() {
            const run = () => {
                const now = new Date();
                
                // Synchronisation GMT 0.001s
                const ms = now.getMilliseconds().toString().padStart(3, '0');
                this.set('local-time', now.toLocaleTimeString() + "." + ms);
                this.set('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 23));

                if (this.isRunning && this.engine) {
                    this.syncData(now);
                }
                requestAnimationFrame(run);
            };
            run();
        }

        syncData(now) {
            // Extraction depuis le vecteur d'état UKF (x)
            const lat = this.engine.x.get([0, 0]);
            const lon = this.engine.x.get([1, 0]);
            const vx = this.engine.x.get([3, 0]);
            const vy = this.engine.x.get([4, 0]);
            const vz = this.engine.x.get([5, 0]);
            const v_ms = Math.sqrt(vx**2 + vy**2 + vz**2);

            if (lat !== 0) {
                this.set('lat-ukf', lat.toFixed(7));
                this.set('lon-ukf', lon.toFixed(7));
                this.set('alt-ukf', (this.engine.x.get([2, 0])).toFixed(2) + " m");
                
                if (this.map) this.map.panTo([lat, lon]);

                // Suture Astro (astro.js + ephem.js)
                if (typeof computeAstroAll === 'function') {
                    const astro = computeAstroAll(now, lat, lon);
                    this.updateAstro(astro);
                }
            }

            // Physique & Relativité
            this.updateRelativity(v_ms);
            
            // Debug Filtre (Extraire de la matrice de covariance P)
            if (this.engine.P) {
                const p_uncert = Math.sqrt(this.engine.P.get([3, 3]));
                this.set('speed-uncertainty', p_uncert.toFixed(4) + " m/s");
                this.set('ekf-status', "FUSION ACTIVE");
            }
        }

        updateAstro(astro) {
            this.set('sun-alt', astro.sun.altitude.toFixed(4) + "°");
            this.set('moon-phase-name', astro.moon.illumination.phase_name);
            this.set('moon-distance', (astro.moon.distance / 1000).toFixed(0) + " km");
            
            // Force de Marée Lunaire (Newtonienne différentielle)
            const dM = astro.moon.distance || 384400000;
            const force = (this.G * 7.342e22 * this.mass * 6371000) / Math.pow(dM, 3);
            this.set('lunar-tide-force', force.toExponential(6) + " N");
        }

        updateRelativity(v) {
            const beta = v / this.C;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            this.set('lorentz-factor', gamma.toFixed(14));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
            this.set('mach-number', (v / 340.29).toFixed(5));
            this.set('dynamic-pressure', (0.5 * 1.225 * v**2).toFixed(4) + " Pa");
        }

        setupMap() {
            if (typeof L !== 'undefined' && $('map-container')) {
                this.map = L.map('map-container').setView([48.85, 2.35], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
                setTimeout(() => this.map.invalidateSize(), 500);
            }
        }

        set(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }
    }

    window.addEventListener('load', () => { window.Master = new MasterSystem(); });
})(window);
