/**
 * GNSS SPACETIME - DASHBOARD FINAL
 * Fichier : gnss-dashboard-full.js
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
            const btn = $('gps-pause-toggle') || $('toggle-gps-btn');
            if (btn) btn.onclick = () => this.handleStart();
            this.renderLoop();
        }

        async handleStart() {
            if (this.isRunning) { location.reload(); return; }

            // Résout l'erreur de vos captures d'écran
            if (typeof window.UltimateUKFEngine !== 'function') {
                alert("ERREUR : lib/ukf-lib.js n'a pas chargé la classe UltimateUKFEngine.");
                return;
            }

            try {
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }

                this.engine = new window.UltimateUKFEngine();
                this.isRunning = true;

                // Capteurs
                navigator.geolocation.watchPosition(p => {
                    this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                }, null, {enableHighAccuracy: true});

                window.ondevicemotion = (e) => {
                    if (this.isRunning) this.engine.predict(e.accelerationIncludingGravity, e.rotationRate, 0.02);
                };

            } catch (err) { alert(err.message); }
        }

        renderLoop() {
            const tick = () => {
                if (this.isRunning && this.engine) {
                    const state = this.engine.getState();
                    const now = new Date();

                    // Affichage GPS
                    if ($('lat-ukf')) $('lat-ukf').textContent = state.lat.toFixed(7);
                    if ($('lon-ukf')) $('lon-ukf').textContent = state.lon.toFixed(7);

                    // --- SUTURE ASTRO.JS ---
                    if (typeof computeAstroAll === 'function') {
                        const astro = computeAstroAll(now, state.lat, state.lon);
                        if ($('sun-alt')) $('sun-alt').textContent = astro.sun.altitude.toFixed(2) + "°";
                        if ($('moon-phase')) $('moon-phase').textContent = astro.moon.illumination.phase_name;
                    }

                    // Relativité
                    const gamma = 1 / Math.sqrt(1 - (state.speed / this.C)**2);
                    if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
                }
                requestAnimationFrame(tick);
            };
            tick();
        }
    }
    window.addEventListener('load', () => new MasterSystem());
})(window);
