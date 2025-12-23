(function() {
    let engine = null;
    let isRunning = false;
    let lastT = performance.now();

    const startApp = async () => {
        const btn = document.getElementById('gps-pause-toggle');
        
        btn.addEventListener('click', async () => {
            if (isRunning) {
                isRunning = false;
                btn.textContent = "▶️ MARCHE GPS";
                return;
            }

            // 1. Vérification UKF
            if (!window.ProfessionalUKF) {
                alert("Erreur : Le moteur UKF n'est pas chargé. Vérifiez vos fichiers .js");
                return;
            }

            // 2. Permission Capteurs (OBLIGATOIRE sur mobile)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') return;
            }

            // 3. Lancement
            engine = new window.ProfessionalUKF();
            isRunning = true;
            btn.textContent = "⏸️ ARRÊT GPS";
            btn.style.background = "#dc3545";
            
            animate();
        });
    };

    function animate() {
        if (!isRunning) return;

        // Acquisition IMU
        window.ondevicemotion = (e) => {
            const dt = (performance.now() - lastT) / 1000;
            lastT = performance.now();
            engine.predict(dt, e.accelerationIncludingGravity, e.rotationRate);
        };

        // Mise à jour interface (Suture des IDs du HTML)
        const state = engine.getState();
        document.getElementById('lat-ukf').textContent = state.lat.toFixed(8);
        document.getElementById('speed-main-display').textContent = state.v_kmh.toFixed(2) + " km/h";
        
        // VÉRITÉ COSMIQUE (1.3M km/h)
        const v_cosmic = state.v_kmh + 107000 + 828000; 
        document.getElementById('v-cosmic').textContent = v_cosmic.toLocaleString() + " km/h";

        requestAnimationFrame(animate);
    }

    window.onload = startApp;
})();
