(function() {
    const engine = new ProfessionalUKF();
    const btn = document.getElementById('gps-pause-toggle');

    async function activate() {
        // Autorisation obligatoire
        if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }

        window.addEventListener('devicemotion', (e) => {
            engine.updatePhysics(e);
        }, true);

        engine.isRunning = true;
        btn.textContent = "🛑 ARRÊT";

        // Boucle Haute Fréquence pour le tableau scientifique
        function loop() {
            if (!engine.isRunning) return;
            const lat = parseFloat(document.getElementById('lat-ukf').textContent) || 0;
            const lon = parseFloat(document.getElementById('lon-ukf').textContent) || 0;
            
            AstroBridge.update(lat, lon);
            requestAnimationFrame(loop);
        }
        loop();
    }

    btn.addEventListener('click', () => {
        if (!engine.isRunning) activate();
        else location.reload();
    });

    // Mise à jour GPS
    navigator.geolocation.watchPosition((p) => {
        document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6);
        document.getElementById('lon-ukf').textContent = p.coords.longitude.toFixed(6);
        if (p.coords.speed) engine.vMs = p.coords.speed;
    }, null, { enableHighAccuracy: true });
})();
