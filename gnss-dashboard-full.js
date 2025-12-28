(function() {
    "use strict";
    const engine = new ProfessionalUKF();
    const C = 299792458;
    let wakeLock = null;
    let weather = { temp: 15, press: 1013, rho: 1.225 };

    async function init() {
        const btn = document.getElementById('gps-pause-toggle');
        btn.onclick = async () => {
            if (!engine.isRunning) {
                if (typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
                if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
                engine.isRunning = true;
                btn.textContent = "⏸️ STOP ENGINE";
            } else {
                engine.isRunning = false;
                if (wakeLock) wakeLock.release();
                btn.textContent = "▶️ MARCHE GPS";
            }
        };

        navigator.geolocation.watchPosition((p) => {
            const { latitude, longitude, speed, accuracy, altitude } = p.coords;
            engine.lat = latitude; engine.lon = longitude;
            engine.observeGPS(latitude, longitude, altitude, speed, accuracy);
            engine.autoDetectMode(latitude, altitude, accuracy, speed);

            fetch(`/api/weather?lat=${latitude}&lon=${longitude}`)
                .then(r => r.json())
                .then(data => {
                    weather.temp = (engine.envMode === "DOME") ? data.main.temp + 7 : data.main.temp; 
                    weather.press = data.main.pressure;
                    weather.rho = (weather.press * 100) / (287.05 * (weather.temp + 273.15));
                    
                    safeSet('air-temp-c', weather.temp.toFixed(1) + " °C");
                    safeSet('air-density', weather.rho.toFixed(3) + " kg/m³");
                    safeSet('statut-meteo', engine.envMode + " / " + data.weather[0].description.toUpperCase());
                });
        }, null, { enableHighAccuracy: true });

        window.addEventListener('devicemotion', (e) => {
            if (engine.isRunning) {
                const a = e.accelerationIncludingGravity;
                engine.accel = { x: a.x||0, y: a.y||0, z: a.z||9.8 };
            }
        });

        requestAnimationFrame(loop);
    }

    function loop() {
        if (engine.isRunning) {
            engine.predict();
            const v = engine.vMs;

            // 1. Navigation & Relativité
            safeSet('speed-main-display', (v * 3.6).toFixed(1) + " km/h");
            safeSet('total-distance-3d', engine.distance.toFixed(4) + " km");
            
            const gamma = 1 / Math.sqrt(1 - Math.pow(v/C, 2));
            safeSet('lorentz-factor', gamma.toFixed(14));
            
            // 2. Astro & BioSVT Corrigés
            if (engine.lat) {
                const a = calculateAstroData(new Date(), engine.lat, engine.lon, weather.temp, weather.press, engine.envMode);
                safeSet('sun-alt', a.sunAlt.toFixed(2) + "°");
                safeSet('time-minecraft', a.mcTime.toString().padStart(5, '0'));
                safeSet('local-speed-of-sound', a.soundSpeed.toFixed(1) + " m/s");
                safeSet('mach-number', (v / a.soundSpeed).toFixed(4));
                
                // BioSVT : Saturation O2 baisse en altitude (avion)
                const alt = parseFloat(engine.alt) || 0;
                const o2 = Math.max(0, 100 - (alt / 300));
                safeSet('oxygen-saturation', o2.toFixed(1) + " %");
            }
        }
        requestAnimationFrame(loop);
    }

    function safeSet(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.onload = init;
})();
