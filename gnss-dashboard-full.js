(function() {
    "use strict";

    function start() {
        const engine = window.MainEngine = new ProfessionalUKF();

        // 1. Liaison Contrôles
        const btnToggle = document.getElementById('gps-pause-toggle');
        if (btnToggle) {
            btnToggle.onclick = () => {
                engine.isRunning = !engine.isRunning;
                btnToggle.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                btnToggle.style.color = engine.isRunning ? "#00ff00" : "#ff4d4d";
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
            };
        }

        // 2. Boucle de rafraîchissement (Hautes fréquences)
        setInterval(() => {
            engine.update();
            const now = new Date();
            const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

            // --- VITESSES ---
            const kmh = engine.vMs * 3.6;
            safeSet('speed-main-display', kmh.toFixed(2) + " km/h");
            safeSet('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            safeSet('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");

            // --- PHYSIQUE ÉNERGÉTIQUE ---
            // Energie Cinétique (1/2 mv²)
            const kinetic = 0.5 * engine.mass * Math.pow(engine.vMs, 2);
            safeSet('kinetic-energy', kinetic.toFixed(2) + " J");

            // --- RELATIVITÉ RESTREINTE ---
            // Facteur de Lorentz gamma = 1 / sqrt(1 - v²/c²)
            const beta = engine.vMs / engine.C;
            const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));
            
            // Dilatation du temps (ns/jour)
            const timeDilat = (gamma - 1) * 86400 * 1e9;
            safeSet('time-dilation', timeDilat.toFixed(2) + " ns/j");

            // --- ODOMÉTRIE ---
            safeSet('total-distance-3d', engine.distance3D.toFixed(6) + " km");
            safeSet('precise-distance-ukf', engine.distance3D.toFixed(9) + " km");

            // --- ASTRONOMIE ---
            const lst = engine.getLST ? engine.getLST() : 0;
            safeSet('sidereal-time', (lst/15).toFixed(4) + " h");
            safeSet('utc-time', now.toISOString().split('T')[1].substr(0,8));
            safeSet('gravity-local', engine.gLocal.toFixed(5) + " m/s²");

            // --- IMU ---
            safeSet('acc-x', engine.accel.x.toFixed(3));
            safeSet('acc-y', engine.accel.y.toFixed(3));
            safeSet('acc-z', engine.accel.z.toFixed(3));

        }, 100);
    }

    window.addEventListener('load', start);
})();
