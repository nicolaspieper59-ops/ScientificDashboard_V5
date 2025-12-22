/**
 * GNSS SPACETIME - ORCHESTRATEUR CENTRAL (V105)
 * Gère la synchronisation 1ms par Offset et le moteur UKF.
 */

(function(window) {
    const $ = id => document.getElementById(id);

    class MasterController {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.timeOffset = 0; // Calculé par rapport à l'heure système
            this.init();
        }

        init() {
            console.log("💎 Dashboard Spacetime : Initialisation du Master...");
            
            // 1. Initialisation de la carte Leaflet
            this.setupMap();

            // 2. Branchement du bouton Marche/Arrêt
            const btn = $('gps-pause-toggle');
            if (btn) {
                // On utilise addEventListener pour ne pas interférer avec d'autres scripts
                btn.addEventListener('click', (e) => this.toggleSystem(e));
            }

            // 3. Lancement de la boucle de synchronisation (Haute Fréquence)
            this.startClockLoop();
        }

        setupMap() {
            if (typeof L !== 'undefined' && $('map-container')) {
                this.map = L.map('map-container').setView([43.2965, 5.3698], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
            }
        }

        async toggleSystem(e) {
            const btn = $('gps-pause-toggle');
            if (!this.isRunning) {
                try {
                    // SÉCURITÉ : Demande de permission pour les capteurs (iOS/Android/Chrome)
                    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                        const permission = await DeviceMotionEvent.requestPermission();
                        if (permission !== 'granted') throw new Error("Permission refusée");
                    }

                    // INITIALISATION DU MOTEUR
                    // On vérifie si la classe existe (chargée via ukf-lib.js ou ukf-class.js)
                    const EngineClass = window.UltimateUKFEngine || window.UKFEngine;
                    if (EngineClass) {
                        this.engine = new EngineClass();
                        window.AppUKF = this.engine; // Pour le debug console
                        this.engine.isRunning = true;
                        if (this.engine.setupUI) this.engine.setupUI();
                    }

                    this.isRunning = true;
                    btn.innerHTML = "🛑 ARRÊT GPS";
                    btn.style.background = "#dc3545";
                    console.log("📡 Moteur activé : Acquisition GNSS en cours...");

                } catch (err) {
                    alert("Erreur d'activation des capteurs : " + err.message);
                }
            } else {
                // Arrêt : On recharge la page pour vider les matrices UKF proprement
                location.reload();
            }
        }

        startClockLoop() {
            const loop = () => {
                // Synchronisation par Offset
                const now = new Date(Date.now() + this.timeOffset);
                const ms = now.getMilliseconds().toString().padStart(3, '0');
                
                // Affichage Heure Pro
                if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString() + "." + ms;
                if ($('utc-datetime')) $('utc-datetime').textContent = now.toISOString().replace('T', ' ').substring(0, 23);

                // Si le moteur tourne, on injecte les données dans le Dashboard
                if (this.isRunning && this.engine) {
                    this.updateDashboard(now);
                }
                requestAnimationFrame(loop);
            };
            loop();
        }

        updateDashboard(now) {
            // 1. Extraction des états depuis l'UKF (indices standards)
            const lat = this.engine.x.get([0, 0]);
            const lon = this.engine.x.get([1, 0]);
            const vx = this.engine.x.get([3, 0]);
            const vy = this.engine.x.get([4, 0]);
            const v_stable = Math.sqrt(vx**2 + vy**2);

            if (lat !== 0 && lon !== 0) {
                if ($('lat-ukf')) $('lat-ukf').textContent = lat.toFixed(7);
                if ($('lon-ukf')) $('lon-ukf').textContent = lon.toFixed(7);

                // 2. Suture Astro (Appel de astro.js)
                if (typeof computeAstroAll === 'function') {
                    const astro = computeAstroAll(now, lat, lon);
                    this.refreshAstroUI(astro);
                }
            }

            // 3. Physique Relativiste
            const c = 299792458;
            const beta = v_stable / c;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            if ($('mach-number')) $('mach-number').textContent = (v_stable / 340.29).toFixed(5);
            if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        }

        refreshAstroUI(a) {
            if ($('sun-alt')) $('sun-alt').textContent = a.sun.altitude.toFixed(4) + "°";
            if ($('moon-phase-name')) $('moon-phase-name').textContent = a.moon.illumination.phase_name;
            if ($('moon-distance')) $('moon-distance').textContent = (a.moon.distance / 1000).toFixed(0) + " km";
        }
    }

    // Démarrage auto
    window.addEventListener('load', () => { window.Master = new MasterController(); });
})(window);
