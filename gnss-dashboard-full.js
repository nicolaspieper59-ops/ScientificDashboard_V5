/**
 * GNSS SPACETIME - ORCHESTRATEUR FINAL V200
 * Liaison : Capteurs -> UKF -> Astro.js
 */
(function(window) {
    const $ = id => document.getElementById(id);

    class MasterSystem {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.C = 299792458;
            this.init();
        }

        init() {
            // Bouton de démarrage
            const btn = $('gps-pause-toggle');
            if (btn) btn.onclick = () => this.handleToggle();

            // Lancement de la boucle d'affichage
            this.startLoop();
        }

        async handleToggle() {
            if (!this.isRunning) {
                try {
                    // 1. Permissions iOS/Android
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }

                    // 2. Vérification de la présence du moteur (lib/ukf-lib.js)
                    if (typeof window.UltimateUKFEngine === 'undefined') {
                        throw new Error("Moteur UKF non chargé. Vérifiez lib/ukf-lib.js");
                    }

                    this.engine = new window.UltimateUKFEngine();
                    this.isRunning = true;

                    // 3. Activation des capteurs
                    navigator.geolocation.watchPosition(p => {
                        this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                    }, null, { enableHighAccuracy: true });

                    window.ondevicemotion = (e) => {
                        if (this.isRunning) this.engine.predict(e.accelerationIncludingGravity, e.rotationRate, 0.02);
                    };

                    $('gps-pause-toggle').textContent = "🛑 ARRÊT DU SYSTÈME";
                    $('gps-pause-toggle').style.background = "#dc3545";

                } catch (err) {
                    alert("ERREUR CRITIQUE : " + err.message);
                }
            } else {
                location.reload();
            }
        }

        startLoop() {
            const run = () => {
                const now = new Date();
                
                // Heure locale
                const elTime = $('local-time');
                if (elTime) elTime.textContent = now.toLocaleTimeString() + "." + now.getMilliseconds();

                if (this.isRunning && this.engine) {
                    this.processPhysics(now);
                }
                requestAnimationFrame(run);
            };
            run();
        }

        processPhysics(now) {
            const lat = this.engine.x.get([0, 0]);
            const lon = this.engine.x.get([1, 0]);

            // Mise à jour de l'affichage Position
            if ($('lat-ukf')) $('lat-ukf').textContent = lat.toFixed(7);
            if ($('lon-ukf')) $('lon-ukf').textContent = lon.toFixed(7);

            // --- SUTURE AVEC ASTRO.JS ---
            if (typeof computeAstroAll === 'function' && lat !== 0) {
                const astro = computeAstroAll(now, lat, lon);
                
                // Mise à jour des données célestes
                if ($('sun-alt')) $('sun-alt').textContent = astro.sun.altitude.toFixed(4) + "°";
                if ($('moon-phase-name')) $('moon-phase-name').textContent = astro.moon.illumination.phase_name;
                if ($('moon-distance')) $('moon-distance').textContent = (astro.moon.distance / 1000).toLocaleString() + " km";
            }

            // --- PHYSIQUE RELATIVISTE ---
            const v = Math.sqrt(this.engine.x.get([3,0])**2 + this.engine.x.get([4,0])**2);
            const gamma = 1 / Math.sqrt(1 - (v / this.C)**2);
            if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        }
    }

    window.addEventListener('load', () => new MasterSystem());
})(window);
