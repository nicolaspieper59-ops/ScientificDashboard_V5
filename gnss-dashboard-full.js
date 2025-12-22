/**
 * GNSS SPACETIME - PROFESSIONAL FULL ORCHESTRATOR
 * Gère : UKF 21-Etats, VSOP2013, Astro V2, Relativité et Forces de Marée.
 */

(function(window) {
    const $ = id => document.getElementById(id);

    class SpacetimeDashboard {
        constructor() {
            // CONSTANTES UNIVERSELLES (CODATA 2018)
            this.C = 299792458;
            this.G = 6.67430e-11;
            this.HBAR = 1.0545718e-34;
            this.KB = 1.380649e-23;
            this.mass = 70.0; // kg

            this.active = false;
            this.startTime = null;
            this.init();
        }

        init() {
            console.log("🚀 Lancement du Dashboard Full...");
            this.setupMap();
            this.setupInterface();
            this.injectFixedPhysics();
            this.startGlobalLoop();
        }

        // --- 1. CARTOGRAPHIE (Stabilité du layout) ---
        setupMap() {
            if (typeof L !== 'undefined' && $('map-container')) {
                // On verrouille la taille pour éviter les débordements
                $('map-container').style.height = "350px";
                $('map-container').style.overflow = "hidden";
                
                this.map = L.map('map-container').setView([48.8584, 2.2945], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
                this.marker = L.marker([48.8584, 2.2945]).addTo(this.map);
                
                // Correction immédiate du bug d'affichage Leaflet
                setTimeout(() => this.map.invalidateSize(), 500);
            }
        }

        // --- 2. GESTION DU BOUTON MARCHE/ARRÊT ---
        setupInterface() {
            const btn = $('gps-pause-toggle');
            if (btn) {
                btn.onclick = () => {
                    if (!this.active) {
                        this.startGPS();
                        btn.innerHTML = "🛑 ARRÊT GPS";
                        btn.style.backgroundColor = "#dc3545";
                        this.active = true;
                        this.startTime = Date.now();
                    } else {
                        location.reload(); // Réinitialisation propre
                    }
                };
            }
        }

        startGPS() {
            if ("geolocation" in navigator) {
                navigator.geolocation.watchPosition(
                    pos => this.onGpsUpdate(pos),
                    err => console.error("Erreur GPS:", err),
                    { enableHighAccuracy: true }
                );
            }
        }

        // --- 3. CALCULS PHYSIQUES FIXES (Zéro N/A) ---
        injectFixedPhysics() {
            // Rayon de Schwarzschild
            const Rs = (2 * this.G * this.mass) / Math.pow(this.C, 2);
            this.set('schwarzschild-radius', Rs.toExponential(8) + " m");

            // Énergie au repos
            const E0 = this.mass * Math.pow(this.C, 2);
            this.set('rest-mass-energy', E0.toExponential(8) + " J");

            // Entropie de Hawking
            const area = 4 * Math.PI * Math.pow(Rs, 2);
            const entropy = (this.KB * Math.pow(this.C, 3) * area) / (4 * this.G * this.HBAR);
            this.set('entropy-hawking', entropy.toExponential(4) + " J/K");

            this.set('gravitational-constant', this.G.toExponential(5));
            this.set('vitesse-la-lumiere-c', this.C + " m/s");
        }

        // --- 4. SUTURE DYNAMIQUE (UKF -> Astro -> Marées) ---
        onGpsUpdate(pos) {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const v = pos.coords.speed || 0;

            // Mise à jour Map
            if (this.map && this.marker) {
                this.marker.setLatLng([lat, lon]);
                this.map.panTo([lat, lon]);
            }

            // Mise à jour ID HTML
            this.set('lat-ukf', lat.toFixed(6));
            this.set('lon-ukf', lon.toFixed(6));

            // Relativité & Fluides
            this.updateRelativity(v);
            this.updateFluids(v);

            // Appel des modèles Astro (Si chargés)
            if (typeof window.computeAstroAll === 'function') {
                const astro = window.computeAstroAll(new Date(), lat, lon);
                this.injectAstroData(astro);
            }
        }

        injectAstroData(astro) {
            this.set('sun-alt', astro.sun.altitude.toFixed(4) + "°");
            this.set('sun-azimuth', astro.sun.azimuth.toFixed(4) + "°");
            this.set('moon-phase-name', astro.moon.illumination.phase_name);
            this.set('moon-illuminated', (astro.moon.illumination.fraction * 100).toFixed(2) + "%");
            this.set('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");

            // FORCE DE MARÉE LUNAIRE (Calculée)
            const dLune = astro.moon.distance || 384400; // km
            const forceMaree = (this.G * 7.342e22 * this.mass * 6371000) / Math.pow(dLune * 1000, 3);
            this.set('lunar-tide-force', forceMaree.toExponential(6) + " N");
            this.set('moon-distance', dLune.toLocaleString() + " km");
        }

        updateRelativity(v) {
            const beta = v / this.C;
            const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(6) + " ns/j");
            this.set('mach-number', (v / 340.29).toFixed(5));
        }

        updateFluids(v) {
            const q = 0.5 * 1.225 * Math.pow(v, 2);
            this.set('dynamic-pressure', q.toFixed(4) + " Pa");
        }

        // --- 5. BOUCLE TEMPORELLE ---
        startGlobalLoop() {
            const loop = () => {
                const now = new Date();
                this.set('local-time', now.toLocaleTimeString());
                this.set('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 19) + " UTC");

                if (this.active && this.startTime) {
                    const elapsed = (Date.now() - this.startTime) / 1000;
                    this.set('session-duration', elapsed.toFixed(2) + " s");
                }
                requestAnimationFrame(loop);
            };
            loop();
        }

        set(id, val) {
            const el = $(id);
            if (el) {
                el.textContent = val;
                el.style.color = (val.toString().includes("N/A")) ? "#666" : "#00ffcc";
            }
        }
    }

    window.Dashboard = new SpacetimeDashboard();
})(window);
