/**
 * MAIN CONTROLLER - SUTURE TOTALE
 */
(function() {
    let engine = null;
    let isRunning = false;
    let lastT = performance.now();

    const startApp = () => {
        const btn = document.getElementById('gps-pause-toggle');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            if (isRunning) {
                isRunning = false;
                btn.textContent = "▶️ MARCHE GPS";
                return;
            }

            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const perms = await DeviceMotionEvent.requestPermission();
                if (perms !== 'granted') return;
            }

            if (!window.ProfessionalUKF) return alert("UKF non chargé !");
            
            engine = new window.ProfessionalUKF();
            isRunning = true;
            btn.textContent = "⏸️ ARRÊT GPS";
            btn.style.background = "#dc3545";
            
            requestAnimationFrame(mainLoop);
        });
    };

    function mainLoop() {
        if (!isRunning) return;

        // 1. Capture Capteurs
        window.ondevicemotion = (e) => {
            const dt = (performance.now() - lastT) / 1000;
            lastT = performance.now();
            engine.predict(dt, e.accelerationIncludingGravity, e.rotationRate);
        };

        const state = engine.getState();
        updateUI(state);
        requestAnimationFrame(mainLoop);
    }

    function updateUI(s) {
        // --- PHYSIQUE & RELATIVITÉ ---
        const v_ms = s.v;
        const v_totale = v_ms + 465.1 + 29780 + 230000; // Vitesse cosmique
        const beta = v_totale / 299792458;
        const gamma = 1 / Math.sqrt(1 - beta**2);

        document.getElementById('speed-main-display').textContent = (v_ms * 3.6).toFixed(2) + " km/h";
        document.getElementById('v-cosmic').textContent = (v_totale * 3.6).toLocaleString() + " km/h";
        document.getElementById('lorentz-factor').textContent = gamma.toFixed(14);
        document.getElementById('time-dilation-vitesse').textContent = ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j";

        // --- NAVIGATION ---
        document.getElementById('lat-ukf').textContent = s.lat.toFixed(8);
        document.getElementById('lon-ukf').textContent = s.lon.toFixed(8);
        document.getElementById('alt-ukf').textContent = s.alt.toFixed(2);

        // --- MÉCANIQUE DES FLUIDES (Oiseaux/Toboggans) ---
        const mach = v_ms / 340.29;
        document.getElementById('speed-mach').textContent = mach.toFixed(4);
        
        // --- IMU / NIVEAU ---
        // Utilisation des quaternions pour le pitch/roll
        const q = s.q;
        const roll = Math.atan2(2*(q[0]*q[1] + q[2]*q[3]), 1 - 2*(q[1]**2 + q[2]**2)) * 57.29;
        const pitch = Math.asin(2*(q[0]*q[2] - q[3]*q[1])) * 57.29;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
        
        const bubble = document.getElementById('bubble');
        if(bubble) bubble.style.transform = `translate(${roll}px, ${pitch}px)`;
    }

    window.onload = startApp;
})();
