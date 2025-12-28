(function() {
    "use strict";
    const ukf = new ProfessionalUKF();
    const C_LIGHT = 299792458;

    async function setup() {
        document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            ukf.isRunning = !ukf.isRunning;
            document.getElementById('gps-pause-toggle').textContent = ukf.isRunning ? "⏸️ STOP ENGINE" : "▶️ MARCHE GPS";
        });

        window.addEventListener('devicemotion', (e) => {
            ukf.accel = {
                x: e.accelerationIncludingGravity.x || 0,
                y: e.accelerationIncludingGravity.y || 0,
                z: e.accelerationIncludingGravity.z || 0
            };
        });

        navigator.geolocation.watchPosition((p) => {
            ukf.observeGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude, p.coords.speed, p.coords.accuracy);
        }, null, { enableHighAccuracy: true });

        requestAnimationFrame(updateUI);
    }

    function updateUI() {
        if (ukf.isRunning) {
            ukf.predict();
            const v = ukf.vMs;

            // --- NAVIGATION ---
            set('speed-main-display', (v * 3.6).toFixed(1) + " km/h");
            set('speed-stable-ms', v.toFixed(3) + " m/s");
            set('total-distance-3d', ukf.distance.toFixed(4) + " km");

            // --- RELATIVITÉ ---
            const gamma = 1 / Math.sqrt(1 - Math.pow(v / C_LIGHT, 2));
            set('lorentz-factor', gamma.toFixed(14));
            set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j");

            // --- ASTRO (Liaison astro.js) ---
            if (ukf.lat && window.calculateAstroData) {
                const astro = calculateAstroData(new Date(), ukf.lat, ukf.lon);
                set('sun-alt', astro.sun.altitude.toFixed(2) + "°");
                set('sun-azimuth', astro.sun.azimuth.toFixed(2) + "°");
                set('lat-ukf', ukf.lat.toFixed(6));
                set('lon-ukf', ukf.lon.toFixed(6));
                set('julian-date', astro.jd.toFixed(5));
            }

            // --- DYNAMIQUE ---
            set('kinetic-energy', (0.5 * 70 * v * v).toFixed(1) + " J");
            set('force-g-vertical', (ukf.accel.z / 9.80665).toFixed(2) + " G");
        }
        requestAnimationFrame(updateUI);
    }

    function set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', setup);
})();
