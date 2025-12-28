(function() {
    "use strict";
    const engine = new ProfessionalUKF();

    async function startSensors() {
        // Baromètre matériel (Android)
        if ('PressureSensor' in window) {
            const baro = new PressureSensor({ frequency: 10 });
            baro.onreading = () => { 
                engine.pressureHardware = baro.pressure / 100;
                document.querySelectorAll('[id^="pressure-hpa"]').forEach(el => el.textContent = engine.pressureHardware.toFixed(1));
            };
            baro.start();
        }

        // Accéléromètre & Gyro (Mouvement & Saltos)
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({ frequency: 60 });
            acc.onreading = () => { engine.accel = { x: acc.x, y: acc.y, z: acc.z }; };
            acc.start();
        }

        window.addEventListener('deviceorientation', (e) => {
            engine.pitch = e.beta || 0;
            document.querySelectorAll('[id^="pitch"]').forEach(el => el.textContent = engine.pitch.toFixed(1) + "°");
            document.querySelectorAll('[id^="roll"]').forEach(el => el.textContent = (e.gamma || 0).toFixed(1) + "°");
        });

        // Magnétomètre
        if ('Magnetometer' in window) {
            const mag = new Magnetometer({ frequency: 10 });
            mag.onreading = () => {
                document.getElementById('mag-x').textContent = mag.x.toFixed(1);
                document.getElementById('mag-y').textContent = mag.y.toFixed(1);
                document.getElementById('mag-z').textContent = mag.z.toFixed(1);
            };
            mag.start();
        }
    }

    function render() {
        if (engine.isRunning) {
            engine.predict();
            AstroEngine.calculate(engine.lat || 43.3, engine.lon || 5.4);
            requestAnimationFrame(render);
        }
    }

    document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
        if (!engine.isRunning) {
            await startSensors();
            if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');
            engine.isRunning = true;
            document.getElementById('filter-status').textContent = "UKF FUSION ACTIVE";
            render();
        }
    });

    navigator.geolocation.watchPosition((p) => {
        engine.lat = p.coords.latitude;
        engine.lon = p.coords.longitude;
        if (p.coords.speed !== null) {
            // Fusion douce GPS / Newton
            engine.vMs = (engine.vMs * 0.3) + (p.coords.speed * 0.7);
        }
        document.querySelectorAll('[id^="lat-ukf"]').forEach(el => el.textContent = engine.lat.toFixed(6));
        document.querySelectorAll('[id^="lon-ukf"]').forEach(el => el.textContent = engine.lon.toFixed(6));
    }, null, { enableHighAccuracy: true });

    // Enregistrement PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }
})();
