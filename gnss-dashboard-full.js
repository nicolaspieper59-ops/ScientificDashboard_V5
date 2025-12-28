(function() {
    "use strict";
    const engine = new SpaceTimeUKF();
    const mass = 70; // kg

    async function init() {
        document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            engine.isRunning = !engine.isRunning;
        });

        window.addEventListener('devicemotion', (e) => {
            engine.accelBrute = {
                x: e.accelerationIncludingGravity.x || 0,
                y: e.accelerationIncludingGravity.y || 0,
                z: e.accelerationIncludingGravity.z || 0
            };
        });

        navigator.geolocation.watchPosition((p) => {
            engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude, p.coords.speed, p.coords.accuracy);
        }, null, { enableHighAccuracy: true });

        requestAnimationFrame(dashboardLoop);
    }

    function dashboardLoop() {
        if (engine.isRunning) {
            engine.predict();
            const v = engine.vMs;
            const c = 299792458;

            // --- 1. NAVIGATION & VITESSE ---
            setUI('speed-main-display', (v * 3.6).toFixed(1) + " km/h");
            setUI('speed-stable-ms', v.toFixed(2) + " m/s");
            setUI('total-distance-3d', engine.totalDistance.toFixed(4) + " km");

            // --- 2. PHYSIQUE & RELATIVITÉ (Plus de 0) ---
            const gamma = 1 / Math.sqrt(1 - Math.pow(v / c, 2));
            setUI('lorentz-factor', gamma.toFixed(12));
            setUI('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j");
            setUI('kinetic-energy', (0.5 * mass * v * v).toFixed(0) + " J");
            setUI('pct-speed-of-light', ((v / c) * 100).toFixed(7) + " %");

            // --- 3. DYNAMIQUE & FORCES ---
            const rho = 1.225 * Math.exp(-engine.alt / 8500);
            setUI('air-density', rho.toFixed(3) + " kg/m³");
            setUI('drag-force', (0.5 * rho * v * v * 0.3 * 1.8).toFixed(2) + " N");

            // --- 4. ASTRONOMIE (Suppression des N/A) ---
            if (engine.lat && window.Ephem) {
                const now = new Date();
                const sun = Ephem.getSunPosition(now, engine.lat, engine.lon);
                setUI('lat-ukf', engine.lat.toFixed(6));
                setUI('lon-ukf', engine.lon.toFixed(6));
                setUI('sun-alt', sun.altitude.toFixed(2) + "°");
                setUI('sun-azimuth', sun.azimuth.toFixed(2) + "°");
                setUI('astro-phase', sun.altitude > 0 ? "Jour ☀️" : "Nuit 🌙");
                setUI('moon-phase-name', Ephem.getMoonPhase(now));
            }

            // --- 5. SYSTÈME ---
            setUI('local-time', new Date().toLocaleTimeString());
            setUI('nyquist-limit', "60 Hz"); // Basé sur RAF
        }
        requestAnimationFrame(dashboardLoop);
    }

    function setUI(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);
})();
