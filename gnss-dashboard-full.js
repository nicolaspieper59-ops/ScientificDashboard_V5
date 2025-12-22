/**
 * GNSS SPACETIME - MASTER ORCHESTRATOR (V110)
 * Gère les IDs du fichier index (28).html sans aucune simplification
 */
(function(window) {
    const $ = id => document.getElementById(id);

    class MasterSystem {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.startTime = null;
            this.mass = 70.0;
            this.C = 299792458;
            this.G = 6.67430e-11;

            this.init();
        }

        init() {
            console.log("💎 Initialisation Système GNSS...");
            
            // 1. Injection des constantes physiques dès le départ
            this.updatePhysicsConstants();

            // 2. Branchement impératif du bouton (Priorité Haute)
            const btn = $('gps-pause-toggle');
            if (btn) btn.onclick = (e) => this.handleMainAction(e);

            // 3. Initialisation de la carte
            if (typeof L !== 'undefined' && $('map-container')) {
                this.map = L.map('map-container').setView([43.2965, 5.3698], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
            }

            // 4. Lancement de la boucle de rafraîchissement (60fps / 1ms sync)
            this.startSyncLoop();
        }

        // Utilitaire pour éviter les erreurs si un ID manque dans le HTML
        setUI(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }

        updatePhysicsConstants() {
            const Rs = (2 * this.G * this.mass) / Math.pow(this.C, 2);
            const E0 = this.mass * Math.pow(this.C, 2);
            this.setUI('schwarzschild-radius', Rs.toExponential(8) + " m");
            this.setUI('rest-mass-energy', E0.toExponential(8) + " J");
            this.setUI('vitesse-lumiere-c', this.C + " m/s");
            this.setUI('gravitational-constant', this.G.toExponential(5));
        }

        async handleMainAction(e) {
            const btn = $('gps-pause-toggle');
            if (!this.isRunning) {
                try {
                    // SÉCURITÉ : Déblocage des capteurs via une interaction utilisateur
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        const permission = await DeviceMotionEvent.requestPermission();
                        if (permission !== 'granted') throw new Error("Accès capteurs refusé");
                    }

                    // Démarrage du moteur UKF
                    this.engine = new window.UltimateUKFEngine();
                    this.startTime = performance.now();
                    this.isRunning = true;

                    // Activation des écouteurs Hardware
                    this.setupHardwareListeners();

                    btn.innerHTML = "🛑 ARRÊT GPS";
                    btn.style.background = "#dc3545";
                    this.setUI('master-mode', "MODE DYNAMIQUE ACTIF");
                } catch (err) {
                    alert("Erreur critique : " + err.message);
                }
            } else {
                location.reload(); // Reset complet du système
            }
        }

        setupHardwareListeners() {
            // GPS Haute Précision
            navigator.geolocation.watchPosition(
                pos => this.engine.updateGPS(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude),
                err => console.warn("GPS Signal perdu"),
                { enableHighAccuracy: true }
            );

            // Accéléromètre 100Hz
            window.ondevicemotion = (e) => {
                if (this.isRunning && this.engine) {
                    this.engine.predict(e.accelerationIncludingGravity, e.rotationRate, 0.01);
                }
            };
        }

        startSyncLoop() {
            const tick = () => {
                const now = new Date();
                
                // Horloge haute précision (0.001s)
                const ms = now.getMilliseconds().toString().padStart(3, '0');
                this.setUI('local-time', now.toLocaleTimeString() + "." + ms);
                this.setUI('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 23));

                // Heure Minecraft (Calcul exact)
                const totalSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
                const mcTicks = Math.floor((totalSeconds / 86400) * 24000);
                this.setUI('time-minecraft', mcTicks.toString().padStart(5, '0') + " ticks");

                if (this.isRunning && this.engine) {
                    this.refreshDynamicUI(now);
                }
                requestAnimationFrame(tick);
            };
            tick();
        }

        refreshDynamicUI(now) {
            const lat = this.engine.x.get([0, 0]);
            const lon = this.engine.x.get([1, 0]);
            const vx = this.engine.x.get([3, 0]);
            const vy = this.engine.x.get([4, 0]);
            const v = Math.sqrt(vx**2 + vy**2);

            // Position
            this.setUI('lat-ukf', lat.toFixed(7));
            this.setUI('lon-ukf', lon.toFixed(7));
            this.setUI('alt-ukf', this.engine.x.get([2, 0]).toFixed(2) + " m");

            // Physique Relativiste & Mach
            const beta = v / this.C;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            this.setUI('mach-number', (v / 340.29).toFixed(5));
            this.setUI('lorentz-factor', gamma.toFixed(14));
            this.setUI('vitesse-stable-kmh', (v * 3.6).toFixed(1) + " km/h");

            // Suture Astro (Appel de lib/astro.js)
            if (typeof computeAstroAll === 'function' && lat !== 0) {
                const astro = computeAstroAll(now, lat, lon);
                this.setUI('sun-alt', astro.sun.altitude.toFixed(4) + "°");
                this.setUI('moon-phase-name', astro.moon.illumination.phase_name);
                this.setUI('moon-distance', (astro.moon.distance / 1000).toLocaleString() + " km");
            }

            // Session
            const elapsed = (performance.now() - this.startTime) / 1000;
            this.setUI('session-duration', elapsed.toFixed(2) + " s");
        }
    }

    window.addEventListener('load', () => { window.Master = new MasterSystem(); });
})(window);
