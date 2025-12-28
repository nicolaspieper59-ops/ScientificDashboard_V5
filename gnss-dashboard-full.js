(function() {
    const engine = new ProfessionalUKF();
    let lastTime = performance.now();

    // 1. Branchement du bouton MARCHE/ARRÊT
    const btn = document.getElementById('gps-pause-toggle');
    
    btn.addEventListener('click', async () => {
        if (!engine.isRunning) {
            // DÉMARRAGE
            engine.isRunning = true;
            btn.textContent = "🛑 ARRÊT";
            btn.style.background = "#550000";
            
            // Activation des capteurs IMU
            startIMU();
            
            // Lancement de la boucle de calcul
            requestAnimationFrame(mainLoop);
        } else {
            // ARRÊT
            location.reload(); // Réinitialisation propre
        }
    });

    function startIMU() {
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
    }

    function mainLoop(now) {
        if (!engine.isRunning) return;

        const dt = (now - lastTime) / 1000;
        lastTime = now;

        // Appel des moteurs
        engine.compute(dt);
        
        // Utilisation de Turf pour la distance si coordonnées changent
        // (Logique Turf ici)

        // Mise à jour Astro
        const lat = parseFloat(document.getElementById('lat-ukf').textContent);
        const lon = parseFloat(document.getElementById('lon-ukf').textContent);
        EphemProcessor.update(lat, lon);

        requestAnimationFrame(mainLoop);
    }

    // GPS (Toujours actif pour les coordonnées)
    navigator.geolocation.watchPosition((p) => {
        document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6);
        document.getElementById('lon-ukf').textContent = p.coords.longitude.toFixed(6);
        if(p.coords.speed) engine.vMs = p.coords.speed;
    }, null, {enableHighAccuracy: true});

})();
