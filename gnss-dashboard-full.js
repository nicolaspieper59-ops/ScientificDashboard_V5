/**
 * GNSS SPACETIME - DASHBOARD FULL ORCHESTRATOR (V21.0)
 * Le fichier central qui commande UKF, Astro et la Physique.
 */

((window) => {
    const $ = id => document.getElementById(id);

    class SpacetimeOrchestrator {
        constructor() {
            // CONSTANTES PHYSIQUES (CODATA 2018)
            this.C = 299792458;
            this.G = 6.67430e-11;
            this.HBAR = 1.0545718e-34;
            this.KB = 1.380649e-23;
            this.mass = 70.0; // Masse par défaut (kg)

            this.init();
        }

        init() {
            console.log("🚀 GNSS Dashboard Full : Système Master Activé");
            this.setupMap();
            this.injectConstants(); // Remplit Rs, E0, G immédiatement
            this.startProcessingLoop();
        }

        // --- 1. STABILISATION DE L'INTERFACE ---
        setupMap() {
            if (typeof L !== 'undefined' && $('map-container')) {
                // Fix pour le débordement CSS
                $('map-container').style.overflow = "hidden";
                this.map = L.map('map-container').setView([48.8584, 2.2945], 16);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
                this.marker = L.marker([48.8584, 2.2945]).addTo(this.map);
                setTimeout(() => this.map.invalidateSize(), 500);
            }
        }

        // --- 2. PHYSIQUE DÉTERMINISTE (Élimine les N/A statiques) ---
        injectConstants() {
            const Rs = (2 * this.G * this.mass) / Math.pow(this.C, 2);
            const E0 = this.mass * Math.pow(this.C, 2);
            const area = 4 * Math.PI * Math.pow(Rs, 2);
            const entropy = (this.KB * Math.pow(this.C, 3) * area) / (4 * this.G * this.HBAR);

            this.set('schwarzschild-radius', Rs.toExponential(8) + " m");
            this.set('rest-mass-energy', E0.toExponential(8) + " J");
            this.set('entropy-hawking', entropy.toExponential(4) + " J/K");
            this.set('vitesse-la-lumiere-c', this.C + " m/s");
            this.set('gravitational-constant', this.G.toExponential(5));
        }

        // --- 3. BOUCLE DE CALCUL UKF + ASTRO + MARÉES ---
        startProcessingLoop() {
            const run = () => {
                // On vérifie si ukf-lib.js a créé l'objet global AppUKF
                if (window.AppUKF && window.AppUKF.x) {
                    const ukf = window.AppUKF;
                    const v = ukf.v_ms || 0;
                    
                    this.updateRelativity(v);
                    this.updateFluids(v);

                    if (ukf.lat && ukf.lon) {
                        this.updateAstroComplex(ukf.lat, ukf.lon);
                        this.updateMapPos(ukf.lat, ukf.lon);
                    }
                }
                this.updateClocks();
                requestAnimationFrame(run);
            };
            run();
        }

        updateAstroComplex(lat, lon) {
            if (typeof window.computeAstroAll === 'function') {
                const astro = window.computeAstroAll(new Date(), lat, lon);

                // Suture des N/A Astro
                this.set('sun-alt', astro.sun.altitude.toFixed(5) + "°");
                this.set('sun-azimuth', astro.sun.azimuth.toFixed(5) + "°");
                this.set('moon-phase-name', astro.moon.illumination.phase_name);
                this.set('equation-of-time', astro.EOT_MIN.toFixed(3) + " min");

                // --- FORCE DE MARÉE LUNAIRE ---
                const distLune = astro.moon.distance || 384400000;
                const forceMaree = (this.G * 7.342e22 * this.mass * 6371000) / Math.pow(distLune, 3);
                this.set('lunar-tide-force', forceMaree.toExponential(6) + " N");
            }
        }

        updateRelativity(v) {
            const beta = v / this.C;
            const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
            this.set('lorentz-factor', gamma.toFixed(18));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(6) + " ns/j");
        }

        updateFluids(v) {
            this.set('dynamic-pressure', (0.5 * 1.225 * v**2).toFixed(6) + " Pa");
            this.set('mach-number', (v / 340.29).toFixed(6));
        }

        updateClocks() {
            const d = new Date();
            this.set('local-time', d.toLocaleTimeString());
            this.set('utc-datetime', d.toISOString().replace('T', ' ').substring(0, 19) + " UTC");
        }

        updateMapPos(lat, lon) {
            if (this.map && this.marker) {
                this.marker.setLatLng([lat, lon]);
            }
        }

        set(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }
    }

    // Lancement du Master
    window.addEventListener('load', () => {
        window.FullEngine = new SpacetimeOrchestrator();
    });

})(window);
