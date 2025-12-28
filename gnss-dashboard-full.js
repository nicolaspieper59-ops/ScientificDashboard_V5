(function() {
    "use strict";
    const engine = new ProfessionalUKF();
    const C_LIGHT = 299792458;

    async function setup() {
        // GPS + MÉTÉO PROXY
        navigator.geolocation.watchPosition(async (p) => {
            const lat = p.coords.latitude;
            const lon = p.coords.longitude;
            engine.observeGPS(lat, lon, p.coords.altitude, p.coords.speed, p.coords.accuracy);

            // Appel Proxy Vercel
            try {
                const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
                const data = await response.json();
                safeSet('air-temp-c', data.main.temp + " °C");
                safeSet('pressure-hpa', data.main.pressure + " hPa");
                const rho = (data.main.pressure * 100) / (287.05 * (data.main.temp + 273.15));
                safeSet('air-density', rho.toFixed(3) + " kg/m³");
                safeSet('statut-meteo', data.weather[0].description.toUpperCase());
            } catch (e) { console.warn("Erreur Proxy Météo"); }

            safeSet('lat-ukf', lat.toFixed(6));
            safeSet('lon-ukf', lon.toFixed(6));
            safeSet('v-cosmic', (1670 * Math.cos(lat * (Math.PI/180))).toFixed(1) + " km/h");
            safeSet('gps-status', "FIX OK");
        }, null, { enableHighAccuracy: true });

        // Capteurs IMU
        window.addEventListener('devicemotion', (e) => {
            if (!engine.isRunning) return;
            engine.accel = { 
                x: e.accelerationIncludingGravity.x || 0, 
                y: e.accelerationIncludingGravity.y || 0, 
                z: e.accelerationIncludingGravity.z || 9.8 
            };
        });

        document.getElementById('gps-pause-toggle').addEventListener('click', () => {
            engine.isRunning = !engine.isRunning;
        });

        requestAnimationFrame(updateLoop);
    }

    function updateLoop() {
        if (engine.isRunning) {
            engine.predict();
            const v = engine.vMs;

            // 1. Navigation & Vitesse
            safeSet('speed-main-display', (v * 3.6).toFixed(1) + " km/h");
            safeSet('speed-stable-ms', v.toFixed(3) + " m/s");
            safeSet('total-distance-3d', engine.distance.toFixed(4) + " km");

            // 2. Physique & Relativité
            const gamma = 1 / Math.sqrt(1 - (v / C_LIGHT)**2);
            safeSet('lorentz-factor', gamma.toFixed(14));
            safeSet('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
            safeSet('kinetic-energy', (0.5 * 70 * v * v).toFixed(2) + " J");
            safeSet('force-g-vert', (engine.accel.z / 9.806).toFixed(3) + " G");

            // 3. Astro & Minecraft
            if (engine.lat) {
                const astro = calculateAstroData(new Date(), engine.lat, engine.lon);
                if (astro) {
                    safeSet('sun-alt', astro.sun.altitude.toFixed(2) + "°");
                    safeSet('sun-azimuth', astro.sun.azimuth.toFixed(2) + "°");
                    safeSet('time-minecraft', astro.mcTime.toString().padStart(5, '0'));
                    safeSet('julian-date', astro.jd.toFixed(5));
                    safeSet('tst-time', astro.tst.toFixed(2));
                    safeSet('astro-phase', astro.sun.altitude > 0 ? "Jour ☀️" : "Nuit 🌙");
                }
            }
        }
        safeSet('local-time', new Date().toLocaleTimeString());
        requestAnimationFrame(updateLoop);
    }

    function safeSet(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.onload = setup;
})();
