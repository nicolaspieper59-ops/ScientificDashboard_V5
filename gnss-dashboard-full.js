/**
 * GNSS Dashboard Main Controller
 */
(function() {
    const engine = new ProfessionalUKF();
    let lastTime = performance.now();
    let currentAccelX = 0;

    const btn = document.getElementById('gps-pause-toggle');
    
    // Fonction de démarrage
    async function initSystem() {
        // Demande d'accès aux capteurs (Obligatoire sur Android/iOS)
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            await DeviceOrientationEvent.requestPermission();
        }

        // Accéléromètre
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({ frequency: 60 });
            acc.onreading = () => {
                currentAccelX = acc.x;
                document.getElementById('acc-x').textContent = acc.x.toFixed(2);
                document.getElementById('acc-y').textContent = acc.y.toFixed(2);
                document.getElementById('acc-z').textContent = acc.z.toFixed(2);
            };
            acc.start();
        }

        // Boucle de rendu
        function loop(now) {
            if (!engine.isRunning) return;
            const dt = (now - lastTime) / 1000;
            lastTime = now;

            // Mise à jour Physique
            engine.update(dt, currentAccelX);

            // Mise à jour Astro
            const lat = parseFloat(document.getElementById('lat-ukf').textContent) || 0;
            const lon = parseFloat(document.getElementById('lon-ukf').textContent) || 0;
            AstroEngine.calculate(lat, lon);

            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    // Événement clic sur le bouton MARCHE
    btn.addEventListener('click', async () => {
        if (!engine.isRunning) {
            engine.isRunning = true;
            btn.textContent = "🛑 ARRÊT D'URGENCE";
            btn.style.background = "linear-gradient(135deg, #660000, #ff0000)";
            btn.style.boxShadow = "0 0 20px #ff0000";
            
            await initSystem();
        } else {
            // Arrêt : On recharge pour tout réinitialiser
            location.reload();
        }
    });

    // Géolocalisation (indépendante de la boucle pour précision)
    navigator.geolocation.watchPosition((p) => {
        document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6);
        document.getElementById('lon-ukf').textContent = p.coords.longitude.toFixed(6);
        document.getElementById('gps-accuracy-display').textContent = p.coords.accuracy.toFixed(1) + " m";
        
        // Synchronisation de la vitesse si le moteur tourne
        if(engine.isRunning && p.coords.speed) {
            engine.vMs = p.coords.speed;
        }
    }, null, { enableHighAccuracy: true });

})();
