/**
 * GNSS SPACETIME - PROFESSIONAL MASTER ORCHESTRATOR (V16.0)
 * Suture Scientifique : UKF (21/24 États) ↔ VSOP2013 ↔ Astro V2
 */

((window) => {
    const $ = id => document.getElementById(id);

    class GNSSMaster {
        constructor() {
            // Constantes Fondamentales (CODATA 2018)
            this.C = 299792458;
            this.G = 6.67430e-11;
            this.HBAR = 1.0545718e-34;
            this.KB = 1.380649e-23;
            this.mass = 70.0; // kg

            this.isRunning = false;
            this.lastUpdate = performance.now();
            
            this.init();
        }

        init() {
            console.log("🚀 Lancement de l'Orchestrateur Professionnel...");
            this.setupMap();
            this.injectRelativisticInvariants();
            this.startMainLoop();
        }

        // --- 1. INTERFACE CARTE (SANS DÉBORDEMENT) ---
        setupMap() {
            const container = $('map-container');
            if (typeof L !== 'undefined' && container) {
                // Stabilisation du container pour éviter le décalage des colonnes
                container.style.height = "350px"; 
                container.innerHTML = '<div id="map" style="height: 100%; width: 100%;"></div>';
                
                this.map = L.map('map').setView([48.8584, 2.2945], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
                this.marker = L.marker([48.8584, 2.2945]).addTo(this.map);
                
                // Forcer le recalcul des dimensions après injection
                setTimeout(() => this.map.invalidateSize(), 200);
            }
        }

        // --- 2. PHYSIQUE THÉORIQUE (VALEURS DÉTERMINISTES) ---
        injectRelativisticInvariants() {
            // Ces valeurs ne dépendent que de la masse, pas des capteurs
            const Rs = (2 * this.G * this.mass) / Math.pow(this.C, 2);
            const E0 = this.mass * Math.pow(this.C, 2);
            
            // Entropie de Bekenstein-Hawking (Modèle Pro)
            const area = 4 * Math.PI * Math.pow(Rs, 2);
            const entropy = (this.KB * Math.pow(this.C, 3) * area) / (4 * this.G * this.HBAR);

            this.set('schwarzschild-radius', Rs.toExponential(6) + " m");
            this.set('rest-mass-energy', E0.toExponential(6) + " J");
            this.set('entropy-hawking', entropy.toExponential(4) + " J/K");
            this.set('gravitational-constant', this.G.toExponential(5));
        }

        // --- 3. BOUCLE DE SYNCHRONISATION (SUTURE DES N/A) ---
        startMainLoop() {
            const loop = () => {
                const now = performance.now();
                
                // 1. Accès au Filtre UKF (via window.AppUKF défini dans ukf-lib.js)
                if (window.AppUKF && window.AppUKF.x) {
                    this.isRunning = true;
                    this.processUKFData(window.AppUKF);
                }

                // 2. Mise à jour temporelle constante
                this.updateTimeFields();
                
                requestAnimationFrame(loop);
            };
            loop();
        }

        processUKFData(ukf) {
            // Extraction de la vitesse scalaire du vecteur d'état
            // On suppose que l'UKF fournit v_ms (norme des états 3,4,5)
            const v = ukf.v_ms || 0;
            
            // Relativité Restreinte
            this.updateRelativity(v);
            
            // Dynamique des Fluides
            this.updateFluidDynamics(v);

            // Suture Astro (Uniquement si Lat/Lon sont valides)
            if (ukf.lat && ukf.lon) {
                this.syncAstro(ukf.lat, ukf.lon);
            }
        }

        syncAstro(lat, lon) {
            // Appel de la fonction computeAstroAll issue de astro.js
            if (typeof window.computeAstroAll === 'function') {
                const date = new Date();
                const astro = window.computeAstroAll(date, lat, lon);
                
                // On lève les N/A car le modèle a des coordonnées valides
                this.set('sun-alt', astro.sun.altitude.toFixed(4) + "°");
                this.set('sun-azimuth', astro.sun.azimuth.toFixed(4) + "°");
                this.set('moon-phase-name', astro.moon.illumination.phase_name);
                this.set('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
                this.set('noon-solar-utc', astro.NOON_SOLAR_UTC);
            }
        }

        updateRelativity(v) {
            const beta = v / this.C;
            const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));

            this.set('lorentz-factor', gamma.toFixed(18));
            this.set('energy-relativiste', (gamma * this.mass * Math.pow(this.C, 2)).toExponential(6) + " J");
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(6) + " ns/j");
        }

        updateFluidDynamics(v) {
            const rho = 1.225; // Masse volumique (ISA)
            this.set('dynamic-pressure', (0.5 * rho * v**2).toFixed(4) + " Pa");
            this.set('mach-number', (v / 340.29).toFixed(6));
        }

        updateTimeFields() {
            const d = new Date();
            this.set('local-time', d.toLocaleTimeString());
            this.set('utc-datetime', d.toISOString().replace('T', ' ').substring(0, 19) + " UTC");
        }

        // --- UTILITAIRE DE MISE À JOUR DOM ---
        set(id, val) {
            const el = $(id);
            if (el && val !== undefined && val !== "NaN") {
                el.textContent = val;
                // Feedback visuel de mise à jour (Optionnel)
                el.style.color = "#00ffcc";
            }
        }
    }

    // Instanciation au chargement
    window.addEventListener('load', () => {
        window.MasterSystem = new GNSSMaster();
    });

})(window);
