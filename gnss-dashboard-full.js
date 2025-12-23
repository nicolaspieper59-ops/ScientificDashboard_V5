(function() {
    let engine = new window.ProfessionalUKF();
    let isRunning = false;
    let lastT = performance.now();

    const btn = document.getElementById('gps-pause-toggle');

    btn.onclick = async () => {
        if (isRunning) {
            isRunning = false;
            btn.textContent = "▶️ MARCHE GPS";
            btn.style.background = "";
            return;
        }

        // Permission capteurs (Mobile/Tablette)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const resp = await DeviceMotionEvent.requestPermission();
            if (resp !== 'granted') return;
        }

        isRunning = true;
        btn.textContent = "⏸ PAUSE SYSTÈME";
        btn.style.background = "#dc3545";
        
        // Boucle de calcul
        requestAnimationFrame(syncLoop);
    };

    // Capteurs IMU
    window.addEventListener('devicemotion', (e) => {
        if (!isRunning) return;
        const now = performance.now();
        const dt = (now - lastT) / 1000;
        lastT = now;
        engine.predict(dt, e.acceleration || {x:0, y:0, z:0}, e.rotationRate);
    });

    // Capteur GPS
    navigator.geolocation.watchPosition(p => engine.updateGPS(p.coords));

    function syncLoop() {
        if (!isRunning) return;

        const mass = parseFloat(document.getElementById('mass-input')?.value) || 70;
        const results = engine.computeAll(mass);

        // --- SUTURE AUTOMATIQUE DES 100+ IDs ---
        // Cette boucle regarde chaque résultat et cherche l'ID correspondant dans ton HTML
        for (const [id, value] of Object.entries(results)) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        }

        requestAnimationFrame(syncLoop);
    }
})();
