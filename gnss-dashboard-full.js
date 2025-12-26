(function() {
    "use strict";
    function start() {
        const engine = window.MainEngine = new ProfessionalUKF();
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        // Liaison des contrôles HTML
        const btn = document.getElementById('gps-pause-toggle');
        const massInput = document.getElementById('mass-input');

        if(btn) btn.onclick = () => {
            engine.isRunning = !engine.isRunning;
            btn.textContent = engine.isRunning ? "⏸️ SYSTÈME ACTIF" : "▶️ MARCHE GPS";
            if(massInput) engine.mass = parseFloat(massInput.value) || 70;
            if(typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission();
        };

        setInterval(() => {
            engine.update();
            const now = new Date();
            const astro = engine.getAstroData();

            // --- VITESSE & PHYSIQUE ---
            safeSet('speed-main-display', (engine.vMs * 3.6).toFixed(2) + " km/h");
            safeSet('speed-stable-kmh', (engine.vMs * 3.6).toFixed(3) + " km/h");
            safeSet('kinetic-energy', (0.5 * engine.mass * Math.pow(engine.vMs, 2)).toFixed(2) + " J");

            // --- RELATIVITÉ ---
            const gamma = 1 / Math.sqrt(1 - Math.pow(engine.vMs / engine.C, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));
            safeSet('time-dilation', ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j");

            // --- ASTRO PROFESSIONNEL (VSOP2013) ---
            safeSet('tslv', astro.lst.toFixed(4) + " h");
            safeSet('ecl-long', astro.sunLon.toFixed(2) + "°");
            safeSet('utc-datetime', now.toISOString().replace('T', ' ').substr(0, 19));

            // --- MÉCANIQUE DES FLUIDES ---
            const rho = engine.getAirDensity();
            safeSet('air-density', rho.toFixed(4) + " kg/m³");
            const q = 0.5 * rho * Math.pow(engine.vMs, 2); // Pression dynamique
            safeSet('dyn-pressure', q.toFixed(2) + " Pa");
            const dragForce = q * engine.Cd * engine.Area;
            safeSet('drag-force', dragForce.toFixed(2) + " N");

            // --- IMU & DISTANCE ---
            safeSet('acc-x', engine.accel.x.toFixed(3));
            safeSet('acc-y', engine.accel.y.toFixed(3));
            safeSet('acc-z', engine.accel.z.toFixed(3));
            safeSet('total-distance-3d', engine.distance3D.toFixed(6) + " km");

        }, 100);
    }
    window.addEventListener('load', start);
})();
