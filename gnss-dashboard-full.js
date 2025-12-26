(function() {
    "use strict";
    function init() {
        if (!window.MainEngine) window.MainEngine = new ProfessionalUKF();
        const engine = window.MainEngine;

        const safeSet = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        // Liaison Masse & Bouton
        const btn = document.getElementById('gps-pause-toggle') || document.getElementById('gps-status');
        if (btn) {
            btn.onclick = () => {
                engine.isRunning = !engine.isRunning;
                btn.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                const mInput = document.getElementById('mass-obj-kg');
                if (mInput) engine.mass = parseFloat(mInput.value) || 70;
                if (typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission();
            };
        }

        setInterval(() => {
            engine.update();
            const now = new Date();

            // 1. VITESSE & PHYSIQUE
            const kmh = engine.vMs * 3.6;
            safeSet('speed-main-display', kmh.toFixed(2) + " km/h");
            safeSet('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            safeSet('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");
            safeSet('speed-max-session', engine.maxSpeed.toFixed(2) + " km/h");
            safeSet('kinetic-energy', (0.5 * engine.mass * engine.vMs**2).toFixed(2) + " J");

            // 2. RELATIVITÉ (Précision SI)
            const gamma = 1 / Math.sqrt(1 - Math.pow(engine.vMs / engine.C, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));
            safeSet('time-dilation', ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j");

            // 3. ASTRONOMIE (Offline)
            const astro = engine.getAstroData(5.36, 43.28); // Marseille par défaut
            const h = Math.floor(astro.lst);
            const m = Math.floor((astro.lst - h) * 60);
            safeSet('sidereal-time', `${h}h ${m}m LST`);
            safeSet('sun-longitude', astro.sunLon.toFixed(2) + "°");
            safeSet('utc-time', now.toISOString().split('T')[1].substr(0,8));

            // 4. ENVIRONNEMENT
            const rho = engine.getAirDensity();
            safeSet('air-density', rho.toFixed(4) + " kg/m³");
            const dragPower = 0.5 * rho * Math.pow(engine.vMs, 3) * engine.Cd * engine.Area;
            safeSet('drag-power', (dragPower/1000).toFixed(3) + " kW");

            // 5. IMU & ODOMÉTRIE
            safeSet('acc-x', engine.acc.x.toFixed(3));
            safeSet('total-distance-3d', engine.distance3D.toFixed(5) + " km");
            safeSet('precise-distance-ukf', engine.distance3D.toFixed(8) + " km");

        }, 100);
    }
    window.addEventListener('load', init);
})();
