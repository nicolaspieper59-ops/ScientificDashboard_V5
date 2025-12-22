/**
 * GNSS SPACETIME - ORCHESTRATEUR FINAL PRO
 * Liaison entre UltimateUKFEngine, Astro.js et le Dashboard.
 */

(function(window) {
    const $ = id => document.getElementById(id);

    class MasterController {
        constructor() {
            // Constantes Physiques
            this.C = 299792458;
            this.G = 6.67430e-11;
            this.mass = 70.0; // kg
            
            this.engine = null; // Instance de UltimateUKFEngine
            this.init();
        }

        init() {
            console.log("🛠️ Initialisation du Master Controller...");
            
            // 1. Initialiser le moteur UKF de ukf-class (13).js
            if (typeof UltimateUKFEngine !== 'undefined') {
                this.engine = new UltimateUKFEngine();
                window.AppUKF = this.engine; // Exposition globale pour debug
            } else {
                console.error("⛔ Erreur: UltimateUKFEngine non trouvé !");
            }

            // 2. Configurer la Carte
            this.setupMap();

            // 3. Activer les calculs invariants (Rayon Rs, E0)
            this.injectFixedPhysics();

            // 4. Lancer la boucle de mise à jour synchronisée
            this.startSyncLoop();
        }

        setupMap() {
            if (typeof L !== 'undefined' && $('map-container')) {
                this.map = L.map('map-container').setView([48.85, 2.35], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
                this.marker = L.marker([48.85, 2.35]).addTo(this.map);
                setTimeout(() => this.map.invalidateSize(), 500);
            }
        }

        injectFixedPhysics() {
            // Calculs qui ne dépendent pas du GPS
            const Rs = (2 * this.G * this.mass) / (this.C ** 2);
            const E0 = this.mass * (this.C ** 2);
            this.set('schwarzschild-radius', Rs.toExponential(8) + " m");
            this.set('rest-mass-energy', E0.toExponential(8) + " J");
            this.set('gravitational-constant', this.G.toExponential(5));
        }

        startSyncLoop() {
            const update = () => {
                // A. Temps et Session
                const now = new Date();
                this.set('local-time', now.toLocaleTimeString());
                this.set('utc-datetime', now.toISOString().replace('T',' ').substring(0,19));

                if (this.engine && this.engine.isRunning) {
                    // B. Extraire les données de l'UKF (24 états)
                    // x[0]=lat, x[1]=lon, x[3,4,5]=vx,vy,vz
                    const lat = this.engine.x.get([0, 0]);
                    const lon = this.engine.x.get([1, 0]);
                    const vx = this.engine.x.get([3, 0]);
                    const vy = this.engine.x.get([4, 0]);
                    const vz = this.engine.x.get([5, 0]);
                    const v_stable = Math.sqrt(vx**2 + vy**2 + vz**2);

                    // C. Mise à jour Interface Position
                    if (lat !== 0) {
                        this.set('lat-ukf', lat.toFixed(7));
                        this.set('lon-ukf', lon.toFixed(7));
                        this.updateMap(lat, lon);

                        // D. SUTURE ASTRO (Liaison avec astro.js)
                        if (typeof computeAstroAll === 'function') {
                            const astro = computeAstroAll(now, lat, lon);
                            this.updateAstroUI(astro);
                        }
                    }

                    // E. Mise à jour Physique Dynamique
                    this.updateDynamicPhysics(v_stable);
                }

                requestAnimationFrame(update);
            };
            update();
        }

        updateAstroUI(astro) {
            // Suppression des N/A Astro
            this.set('sun-alt', astro.sun.altitude.toFixed(4) + "°");
            this.set('sun-azimuth', astro.sun.azimuth.toFixed(4) + "°");
            this.set('moon-phase-name', astro.moon.illumination.phase_name);
            this.set('moon-illuminated', (astro.moon.illumination.fraction * 100).toFixed(1) + "%");
            this.set('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
            
            // Calcul de la Force de Marée Lunaire (Suture Ephem)
            const distM = astro.moon.distance || 384400000;
            const tideForce = (this.G * 7.342e22 * this.mass * 6371000) / Math.pow(distM, 3);
            this.set('lunar-tide-force', tideForce.toExponential(6) + " N");
            this.set('moon-distance', (distM / 1000).toFixed(0) + " km");
        }

        updateDynamicPhysics(v) {
            // Mach
            const mach = v / 340.29;
            this.set('mach-number', mach.toFixed(5));

            // Relativité
            const beta = v / this.C;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");

            // Pression Dynamique
            const q = 0.5 * 1.225 * (v ** 2);
            this.set('dynamic-pressure', q.toFixed(4) + " Pa");
        }

        updateMap(lat, lon) {
            if (this.marker) this.marker.setLatLng([lat, lon]);
        }

        set(id, val) {
            const el = $(id);
            if (el) {
                el.textContent = val;
                if (val !== "N/A") el.style.color = "#00ffcc";
            }
        }
    }

    // Lancement automatique
    window.addEventListener('load', () => {
        window.Master = new MasterController();
    });

})(window);
