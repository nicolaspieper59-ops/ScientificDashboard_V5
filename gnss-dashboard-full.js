/**
 * GNSS SpaceTime Master Controller
 * Full PWA / Sensor Fusion / High-Speed Weather
 */
(function() {
    "use strict";
    const engine = new ProfessionalUKF();
    let wakeLock = null;

    async function init() {
        const btn = document.getElementById('gps-pause-toggle');

        // Activation Baromètre Android (PressureSensor)
        if ('PressureSensor' in window) {
            try {
                const sensor = new PressureSensor({ frequency: 5 });
                sensor.onreading = () => { engine.pressureHardware = sensor.pressure / 100; };
                sensor.start();
            } catch(e) { console.warn("Capteur Pression Indisponible"); }
        }

        btn.addEventListener('click', async () => {
            if (!engine.isRunning) {
                if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
                if (typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
                engine.isRunning = true;
                btn.textContent = "⏸️ STOP SYSTEM";
                render();
            } else {
                engine.isRunning = false;
                btn.textContent = "▶️ START SYSTEM";
                if (wakeLock) wakeLock.release();
            }
        });

        // GPS & Météo Prédictive
        navigator.geolocation.watchPosition((p) => {
            const { latitude, longitude, speed, altitude } = p.coords;
            engine.vMs = speed || engine.vMs;
            engine.altitude = altitude || 0;
            updateWeather(latitude, longitude);
        }, null, { enableHighAccuracy: true });

        // IMU
        window.addEventListener('devicemotion', (e) => {
            if (engine.isRunning) {
                const a = e.accelerationIncludingGravity;
                engine.accel = { x: a.x || 0, y: a.y || 0, z: a.z || 9.8 };
            }
        });
    }

    async function updateWeather(lat, lon) {
        try {
            const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            const data = await res.json();
            
            // Sauvegarde Prédiction +3h pour mode Hors-ligne
            localStorage.setItem('weather_cache', JSON.stringify({
                temp: data.main.temp,
                press: data.main.pressure,
                time: Date.now()
            }));

            updateAll('air-temp-c', data.main.temp.toFixed(1));
            updateAll('pressure-hpa', data.main.pressure.toFixed(1));
            updateAll('statut-meteo', "📡 ONLINE");
        } catch (e) {
            const cached = JSON.parse(localStorage.getItem('weather_cache'));
            if (cached) {
                updateAll('air-temp-c', cached.temp.toFixed(1));
                updateAll('statut-meteo', "⚠️ OFFLINE (PRED)");
            }
        }
    }

    function render() {
        if (!engine.isRunning) return;
        engine.predict();

        // Calculs Astro
        const astro = AstroEngine.calculate(engine.lat || 0, engine.lon || 0);

        // Mises à jour massives (incluant doublons -1, -2)
        updateAll('speed-main-display', (engine.vMs * 3.6).toFixed(1));
        updateAll('total-distance-3d', engine.dist.toFixed(4));
        updateAll('time-minecraft', astro.mcTime);
        updateAll('sun-alt', astro.sunAlt.toFixed(2));
        updateAll('local-time', new Date().toLocaleTimeString());
        updateAll('force-g-vert', (engine.accel.z / 9.806).toFixed(3));
        
        // Statut du filtre
        updateAll('filter-status', engine.pressureHardware ? "BARO HW" : "GPS EST.");

        requestAnimationFrame(render);
    }

    function updateAll(id, val) {
        // Sélectionne l'id exact ou les id-1, id-2 etc.
        const els = document.querySelectorAll(`[id^="${id}"]`);
        els.forEach(el => el.textContent = val);
    }

    window.onload = init;
})();
