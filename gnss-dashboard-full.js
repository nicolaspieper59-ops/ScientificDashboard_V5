(function() {
    "use strict";
    const engine = new ProfessionalUKF();
    const C_LIGHT = 299792458;
    let lastWeatherUpdate = 0;

    async function init() {
        document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            engine.isRunning = !engine.isRunning;
        });

        window.addEventListener('devicemotion', (e) => {
            if (!engine.isRunning) return;
            const a = e.accelerationIncludingGravity;
            engine.accel = { x: a.x || 0, y: a.y || 0, z: a.z || 9.8 };
            safeSet('acc-x', engine.accel.x.toFixed(2));
            safeSet('acc-y', engine.accel.y.toFixed(2));
            safeSet('acc-z', engine.accel.z.toFixed(2));
        });

        navigator.geolocation.watchPosition((p) => {
            const lat = p.coords.latitude;
            const lon = p.coords.longitude;
            engine.observeGPS(lat, lon, p.coords.altitude, p.coords.speed, p.coords.accuracy);
            
            // Trigger Météo
            if (Date.now() - lastWeatherUpdate > 600000) fetchWeather(lat, lon);

            safeSet('lat-ukf', lat.toFixed(6));
            safeSet('lon-ukf', lon.toFixed(6));
            safeSet('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
            safeSet('gps-status', "FIX OK");
            
            // Vitesse Cosmique
            const vCosmic = 1670 * Math.cos(lat * D2R);
            safeSet('v-cosmic', vCosmic.toFixed(1) + " km/h");
        }, null, { enableHighAccuracy: true });

        requestAnimationFrame(mainLoop);
    }

    async function fetchWeather(lat, lon) {
        try {
            const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            const data = await res.json();
            safeSet('air-temp-c', data.main.temp + " °C");
            safeSet('pressure-hpa', data.main.pressure + " hPa");
            safeSet('air-density', ((data.main.pressure*100)/(287.05*(data.main.temp+273.15))).toFixed(3) + " kg/m³");
            lastWeatherUpdate = Date.now();
        } catch (e) { console.error("Weather error", e); }
    }

    function mainLoop() {
        if (engine.isRunning) {
            engine.predict();
            const v = engine.vMs;

            // UI Vitesse & Relativité
            safeSet('speed-main-display', (v * 3.6).toFixed(1) + " km/h");
            safeSet('speed-stable-ms', v.toFixed(3) + " m/s");
            safeSet('total-distance-3d', engine.distance.toFixed(4) + " km");
            
            const gamma = 1 / Math.sqrt(1 - (v/C_LIGHT)**2);
            safeSet('lorentz-factor', gamma.toFixed(14));
            safeSet('time-dilation-vitesse', ((gamma-1)*86400*1e9).toFixed(4) + " ns/j");
            safeSet('kinetic-energy', (0.5 * 70 * v**2).toFixed(2) + " J");
            safeSet('force-g-vert', (engine.accel.z / 9.80665).toFixed(3) + " G");

            // UI Astro & Minecraft
            if (engine.lat) {
                const astro = calculateAstroData(new Date(), engine.lat, engine.lon);
                safeSet('sun-alt', astro.sun.altitude.toFixed(2) + "°");
                safeSet('sun-azimuth', astro.sun.azimuth.toFixed(2) + "°");
                safeSet('time-minecraft', astro.mcTime.toString().padStart(5, '0'));
                safeSet('julian-date', astro.jd.toFixed(5));
                safeSet('astro-phase', astro.sun.altitude > 0 ? "Jour ☀️" : "Nuit 🌙");
            }
        }
        safeSet('local-time', new Date().toLocaleTimeString());
        requestAnimationFrame(mainLoop);
    }

    function safeSet(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);
})();
