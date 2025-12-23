(function() {
    let engine = null;
    let isRunning = false;

    function init() {
        const btn = document.getElementById('gps-pause-toggle');
        
        if (!window.ProfessionalUKF) {
            console.log("⏳ UKF introuvable, nouvelle tentative dans 500ms...");
            setTimeout(init, 500);
            return;
        }

        console.log("🚀 UKF détecté ! Liaison du bouton Marche/Arrêt...");
        
        btn.onclick = async () => {
            if (isRunning) {
                isRunning = false;
                btn.textContent = "▶️ MARCHE GPS";
                return;
            }

            // Demande de permission capteurs
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }

            if (!engine) engine = new window.ProfessionalUKF();
            isRunning = true;
            btn.textContent = "⏸️ ARRÊT GPS";
            startLoops();
        };
    }

    function startLoops() {
        // Boucle de calcul et rendu
        const loop = () => {
            if (!isRunning) return;
            // Update UI...
            requestAnimationFrame(loop);
        };
        loop();
    }

    window.onload = init;
})();
