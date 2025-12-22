/**
 * GNSS SPACETIME - ORCHESTRATEUR SUPRÊME (V101 PRO)
 * Synchronisation : Offset local haute fidélité (0.001s)
 * Autonomie : Totale (Pas de dépendance serveur NTP en continu)
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

            // GESTION DE L'OFFSET (Pour éviter les appels serveurs)
            this.timeOffset = 0; 
            
            this.init();
        }

        init() {
            console.log("💎 Système Spacetime : Activation du Pilote (Mode Offset Local)...");
            this.setupMap();
            this.injectConstants();
            this.bindControls();
            
            // Calcul initial de l'offset si une source externe est dispo (optionnel)
            // Sinon, l'offset reste à 0 et on utilise l'horloge système haute précision
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
                    try {
                        // Déblocage des permissions IMU (Standard Pro)
                        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                            await DeviceMotionEvent.requestPermission();
                        }

                        if (typeof UltimateUKFEngine !== 'undefined') {
                            this.engine = new UltimateUKFEngine();
                            window.AppUKF = this.engine;
                            
                            // Démarrage du moteur UKF
                            this.engine.isRunning = true;
                            if (this.engine.setupUI) this.engine.setupUI(); 
                            
                            this.isRunning = true;
                            this.startTime = performance.now(); // Utilisation de performance.now pour l'offset
                            btn.innerHTML = "🛑 ARRÊT GPS";
                            btn.style.background = "#dc3545";
                            btn.style.boxShadow = "0 0 20px rgba(220, 53, 69, 0.6)";
                            console.log("📡 Moteur UKF & GNSS Verrouillés.");
                        }
                    } catch (e) {
                        console.error("Erreur de démarrage:", e);
                    }
                } else {
                    location.reload(); 
                }
            };
        }

        startSyncLoop() {
            const run = () => {
                // Utilisation de l'heure système + offset pour simuler un temps atomique stable
                const now = new Date(Date.now() + this.timeOffset);
                
                // Formatage 0.001s (Précision milliseconde)
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
            // Extraction des états filtrés du moteur UKF (24 états)
            const lat = this.engine.x.get([0, 0]);
            const lon = this.engine.x.get([1, 0]);
            const vx = this.engine.x.get([3, 0]);
            const vy = this.engine.x.get([4, 0]);
            const v_ms = Math.sqrt(vx**2 + vy**2);

            // Suture Position -> Astro
            if (lat !== 0 && lon !== 0) {
                this.set('lat-ukf', lat.toFixed(7));
                this.set('lon-ukf', lon.toFixed(7));
                
                // Appel du moteur Astro.js avec le temps "offseté"
                if (typeof computeAstroAll === 'function') {
                    const astro = computeAstroAll(now, lat, lon);
                    this.updateAstroUI(astro);
                }
            }

            // Mise à jour Relativité & Mach
            this.updatePhysics(v_ms);

            // Temps de session précis
            const elapsed = (performance.now() - this.startTime) / 1000;
            this.set('session-duration', elapsed.toFixed(3) + " s");
        }

        updateAstroUI(astro) {
            this.set('sun-alt', astro.sun.altitude.toFixed(4) + "°");
            this.set('moon-phase-name', astro.moon.illumination.phase_name);
            this.set('moon-distance', (astro.moon.distance / 1000).toFixed(0) + " km");
            
            // Calcul marée lunaire (Newtonien)
            const dM = astro.moon.distance || 384400000;
            const tideForce = (this.G * 7.342e22 * this.mass * 6371000) / Math.pow(dM, 3);
            this.set('lunar-tide-force', tideForce.toExponential(6) + " N");
        }

        updatePhysics(v) {
            const beta = v / this.C;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            this.set('lorentz-factor', gamma.toFixed(14));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
            this.set('mach-number', (v / 340.29).toFixed(5));
            this.set('dynamic-pressure', (0.5 * 1.225 * v**2).toFixed(4) + " Pa");
        }

        setupMap() {
            if (typeof L !== 'undefined' && $('map-container')) {
                this.map = L.map('map-container').setView([43.2965, 5.3698], 15);
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
