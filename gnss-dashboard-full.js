(function() {
    "use strict";

    const state = { isRunning: false };

    async function init() {
        window.MainEngine = new ProfessionalUKF();
        document.getElementById('gps-pause-toggle').addEventListener('click', startDashboard);
        requestAnimationFrame(syncLoop);
    }

    async function startDashboard() {
        // Demande des autorisations (iOS/Android)
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') return;
        }

        state.isRunning = !state.isRunning;
        window.MainEngine.isRunning = state.isRunning;
        
        const btn = document.getElementById('gps-pause-toggle');
        btn.textContent = state.isRunning ? "⏸️ STOP ENGINE" : "▶️ START ENGINE";

        if (state.isRunning) {
            // Capteur de mouvement (Newton)
            window.addEventListener('devicemotion', (e) => {
                window.MainEngine.accelBrute = {
                    x: e.accelerationIncludingGravity.x || 0,
                    y: e.accelerationIncludingGravity.y || 0,
                    z: e.accelerationIncludingGravity.z || 0
                };
            });

            // Capteur GPS
            navigator.geolocation.watchPosition((p) => {
                window.MainEngine.updateGPS(
                    p.coords.latitude, p.coords.longitude,
                    p.coords.altitude, p.coords.speed, p.coords.accuracy
                );
            }, null, { enableHighAccuracy: true });
        }
    }

    function syncLoop() {
        if (state.isRunning && window.MainEngine) {
            const engine = window.MainEngine;
            engine.predict();

            // 1. Mise à jour Navigation
            updateUI('speed-main-display', (engine.vMs * 3.6).toFixed(1) + " km/h");
            updateUI('lat-ukf', engine.lat ? engine.lat.toFixed(6) : "...");
            updateUI('lon-ukf', engine.lon ? engine.lon.toFixed(6) : "...");
            updateUI('alt-display', engine.alt ? engine.alt.toFixed(1) + " m" : "0 m");

            // 2. Mise à jour Relativité
            const c = 299792458;
            const gamma = 1 / Math.sqrt(1 - Math.pow(engine.vMs / c, 2));
            updateUI('lorentz-factor', gamma.toFixed(12));
            updateUI('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j");

            // 3. Mise à jour Astronomie (Suppression des N/A)
            if (engine.lat && window.Ephem) {
                const now = new Date();
                const sun = Ephem.getSunPosition(now, engine.lat, engine.lon);
                updateUI('sun-alt', sun.altitude.toFixed(2) + "°");
                updateUI('sun-azimuth', sun.azimuth.toFixed(2) + "°");
                updateUI('astro-phase', sun.altitude > 0 ? "Jour ☀️" : "Nuit 🌙");
            }
        }
        requestAnimationFrame(syncLoop);
    }

    function updateUI(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);
})();
