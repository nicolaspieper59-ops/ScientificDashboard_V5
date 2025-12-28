(function() {
    const engine = new ProfessionalUKF();
    let lastTime = performance.now();
    let currentPos = { lat: 43.29, lon: 5.37 };

    const btn = document.getElementById('gps-pause-toggle');

    async function initHardware() {
        // Accéléromètre Haute Fréquence
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({ frequency: 60 });
            acc.onreading = () => {
                engine.accel.x = acc.x;
                document.getElementById('acc-x').textContent = acc.x.toFixed(2);
                document.getElementById('acc-z').textContent = acc.z.toFixed(2);
            };
            acc.start();
        }

        // Boucle de rendu
        function frame(now) {
            if (!engine.isRunning) return;
            const dt = (now - lastTime) / 1000;
            lastTime = now;

            engine.update(dt);
            AstroBridge.update(currentPos.lat, currentPos.lon);

            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    btn.addEventListener('click', async () => {
        if (!engine.isRunning) {
            engine.isRunning = true;
            btn.textContent = "🛑 ARRÊT";
            btn.style.background = "#880000";
            await initHardware();
        } else {
            location.reload();
        }
    });

    // GPS & Turf.js
    navigator.geolocation.watchPosition((p) => {
        const newPos = { lat: p.coords.latitude, lon: p.coords.longitude };
        
        // Exemple d'usage Turf.js pour la distance précise
        if(currentPos) {
            const from = turf.point([currentPos.lon, currentPos.lat]);
            const to = turf.point([newPos.lon, newPos.lat]);
            const distMeters = turf.distance(from, to, {units: 'meters'});
            // On pourrait ajouter cette distance au moteur UKF ici
        }
        
        currentPos = newPos;
        document.getElementById('lat-ukf').textContent = currentPos.lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = currentPos.lon.toFixed(6);
    }, null, { enableHighAccuracy: true });

})();
