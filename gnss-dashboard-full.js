(function() {
    "use strict";
    const engine = new ProfessionalUKF();
    const C = 299792458;
    let wakeLock = null;
    let weather = { temp: 15, press: 1013, rho: 1.225 };

    async function setup() {
        const btn = document.getElementById('gps-pause-toggle');
        
        btn.onclick = async () => {
            if (!engine.isRunning) {
                try {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
                    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
                } catch (e) {}
                engine.isRunning = true;
                btn.textContent = "⏸️ STOP ENGINE";
            } else {
                engine.isRunning = false;
                if (wakeLock) wakeLock.release();
                btn.textContent = "▶️ MARCHE GPS";
            }
        };

        // GPS + MÉTÉO PROXY
        navigator.geolocation.watchPosition(async (p) => {
            const { latitude, longitude, speed, accuracy, altitude } = p.coords;
            engine.observeGPS(latitude, longitude, altitude, speed, accuracy);

            // Appel Proxy Météo (Vercel)
            fetch(`/api/weather?lat=${latitude}&lon=${longitude}`)
                .then(r => r.json())
                .then(data => {
                    weather.temp = data.main.temp;
                    weather.press = data.main.pressure;
                    weather.rho = (weather.press * 100) / (287.05 * (weather.temp + 273.15));
                    
                    safeSet('air-temp-c', weather.temp.toFixed(1) + " °C");
                    safeSet('pressure-hpa', weather.press + " hPa");
                    safeSet('air-density', weather.rho.toFixed(3) + " kg/m³");
                    safeSet('statut-meteo', data.weather[0].description.toUpperCase());
                }).catch(() => {});

            safeSet('lat-ukf', latitude.toFixed(6));
            safeSet('lon-ukf', longitude.toFixed(6));
            safeSet('gps-status', "FIX OK");
            safeSet('v-cosmic', (1670 * Math.cos(latitude * D2R)).toFixed(1) + " km/h");
        }, null, { enableHighAccuracy: true });

        // IMU (Accéléromètre)
        window.addEventListener('devicemotion', (e) => {
            if (engine.isRunning) {
                engine.accel = { 
                    x: e.accelerationIncludingGravity.x || 0, 
                    y: e.accelerationIncludingGravity.y || 0, 
                    z: e.accelerationIncludingGravity.z || 9.8 
                };
            }
        });

        requestAnimationFrame(loop);
    }

    function loop() {
        if (engine.isRunning) {
            engine.predict();
            const v = engine.vMs;

            // 1. Navigation & Forces
            safeSet('speed-main-display', (v * 3.6).toFixed(1) + " km/h");
            safeSet('speed-stable-ms', v.toFixed(3) + " m/s");
            safeSet('total-distance-3d', engine.distance.toFixed(4) + " km");
            safeSet('force-g-vert', (engine.accel.z / 9.80665).toFixed(3) + " G");
            
            // 2. Physique Corrigée (Traînée)
            const dragF = 0.5 * weather.rho * v * v * 0.3 * 1.8;
            safeSet('drag-force', dragF.toFixed(2) + " N");
            safeSet('dynamic-pressure', (0.5 * weather.rho * v * v).toFixed(2) + " Pa");

            // 3. Astro Corrigé (Réfraction + Mach + Minecraft)
            if (engine.lat) {
                const a = calculateAstroData(new Date(), engine.lat, engine.lon, weather.temp, weather.press);
                safeSet('sun-alt', a.sun.alt.toFixed(2) + "°");
                safeSet('sun-azimuth', a.sun.az.toFixed(2) + "°");
                safeSet('local-speed-of-sound', a.soundSpeed.toFixed(1) + " m/s");
                safeSet('mach-number', (v / a.soundSpeed).toFixed(4));
                safeSet('time-minecraft', a.mcTime.toString().padStart(5, '0'));
                safeSet('julian-date', a.jd.toFixed(5));
                safeSet('astro-phase', a.sun.alt > 0 ? "Jour ☀️" : "Nuit 🌙");
            }

            // 4. Relativité
            const gamma = 1 / Math.sqrt(1 - (v/C)**2);
            safeSet('lorentz-factor', gamma.toFixed(14));
            safeSet('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
        }
        safeSet('local-time', new Date().toLocaleTimeString());
        requestAnimationFrame(loop);
    }

    function safeSet(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.onload = setup;
})();
