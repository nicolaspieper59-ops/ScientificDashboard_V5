(function() {
    const engine = new ProfessionalUKF();
    let currentPos = { lat: 43.2965, lon: 5.3698 }; // Marseille par défaut

    async function startSystem() {
        // 1. Activation des capteurs (Generic Sensor API)
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({ frequency: 60 });
            acc.onreading = () => {
                engine.accel.x = acc.x;
                engine.accel.y = acc.y;
                engine.accel.z = acc.z;
                
                document.getElementById('acc-x').textContent = acc.x.toFixed(2);
                document.getElementById('acc-y').textContent = acc.y.toFixed(2);
                document.getElementById('acc-z').textContent = acc.z.toFixed(2);
            };
            acc.start();
        }

        // 2. Magnétomètre pour la boussole
        if ('Magnetometer' in window) {
            const mag = new Magnetometer({ frequency: 10 });
            mag.onreading = () => {
                document.getElementById('mag-x').textContent = mag.x.toFixed(1);
                document.getElementById('mag-y').textContent = mag.y.toFixed(1);
                document.getElementById('mag-z').textContent = mag.z.toFixed(1);
            };
            mag.start();
        }

        // 3. Boucle de rendu Haute Fréquence
        let lastTime = performance.now();
        function frame(now) {
            if (engine.isRunning) {
                const dt = (now - lastTime) / 1000;
                lastTime = now;

                engine.predict(dt, currentPos);
                AstroCore.update(currentPos.lat, currentPos.lon);
                
                requestAnimationFrame(frame);
            }
        }
        requestAnimationFrame(frame);
    }

    // Gestion du bouton START
    document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
        if (!engine.isRunning) {
            engine.isRunning = true;
            document.getElementById('gps-pause-toggle').textContent = "🛑 ARRÊT";
            document.getElementById('gps-pause-toggle').classList.add('active');
            await startSystem();
        } else {
            location.reload();
        }
    });

    // Écoute GPS
    navigator.geolocation.watchPosition((p) => {
        currentPos = { lat: p.coords.latitude, lon: p.coords.longitude };
        document.getElementById('lat-ukf').textContent = currentPos.lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = currentPos.lon.toFixed(6);
        document.getElementById('gps-accuracy-display').textContent = p.coords.accuracy.toFixed(1) + " m";
    }, null, { enableHighAccuracy: true });

})();
