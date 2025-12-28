(function() {
    const engine = new ProfessionalUKF();
    const btn = document.getElementById('gps-pause-toggle');

    async function startSystem() {
        // 1. Demande de Permission DeviceMotion (iOS / Chrome Mobile)
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                if (response !== 'granted') throw new Error("Permission Motion refusée");
            } catch (err) { alert(err); return; }
        }

        // 2. Activation de l'écouteur universel
        window.addEventListener('devicemotion', (e) => engine.processMotion(e), true);

        // 3. Lancement de la boucle Astro & Environnement
        engine.isRunning = true;
        btn.textContent = "🛑 ARRÊT";
        btn.style.background = "#990000";

        setInterval(() => {
            const lat = parseFloat(document.getElementById('lat-ukf').textContent) || 0;
            const lon = parseFloat(document.getElementById('lon-ukf').textContent) || 0;
            AstroBridge.update(lat, lon);
        }, 1000);
    }

    btn.addEventListener('click', async () => {
        if (!engine.isRunning) {
            await startSystem();
        } else {
            location.reload();
        }
    });

    // GPS & Turf.js
    navigator.geolocation.watchPosition((p) => {
        document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6);
        document.getElementById('lon-ukf').textContent = p.coords.longitude.toFixed(6);
        document.getElementById('gps-accuracy-display').textContent = p.coords.accuracy.toFixed(1) + " m";
    }, null, { enableHighAccuracy: true });

})();
