(function() {
    "use strict";
    function start() {
        const engine = window.MainEngine = new ProfessionalUKF();
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        // Gestion des contrôles
        const btn = document.getElementById('gps-pause-toggle');
        const massInput = document.getElementById('mass-input');

        if(btn) btn.onclick = () => {
            engine.isRunning = !engine.isRunning;
            btn.textContent = engine.isRunning ? "⏸️ SYSTÈME ACTIF" : "▶️ SYSTÈME EN PAUSE";
            if(massInput) engine.mass = parseFloat(massInput.value) || 70;
            if(typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission();
        };

        setInterval(() => {
            engine.update();
            const now = new Date();

            // VITESSES & DISTANCE
            safeSet('speed-main-display', (engine.vMs * 3.6).toFixed(2) + " km/h");
            safeSet('speed-stable-kmh', (engine.vMs * 3.6).toFixed(3) + " km/h");
            safeSet('total-distance-3d', engine.distance3D.toFixed(6) + " km");

            // RELATIVITÉ & ÉNERGIE
            const gamma = 1 / Math.sqrt(1 - Math.pow(engine.vMs / engine.C, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));
            safeSet('kinetic-energy', (0.5 * engine.mass * Math.pow(engine.vMs, 2)).toFixed(2) + " J");

            // MÉCANIQUE DES FLUIDES (Météo)
            const rho = engine.getAirDensity();
            safeSet('air-density', rho.toFixed(4) + " kg/m³");
            const dragPower = 0.5 * rho * Math.pow(engine.vMs, 3) * engine.Cd * engine.Area;
            safeSet('drag-power-kw', (dragPower/1000).toFixed(3) + " kW");

            // ASTRONOMIE OFFLINE
            const lst = engine.getLST(5.36); // Longitude Marseille par défaut
            safeSet('tslv', lst.toFixed(4) + " h");
            safeSet('utc-datetime', now.toISOString().replace('T', ' ').substr(0, 19));

            // IMU & INCLINAISON
            const pitch = Math.atan2(-engine.accel.x, engine.accel.z) * (180/Math.PI);
            const roll = Math.atan2(engine.accel.y, engine.accel.z) * (180/Math.PI);
            safeSet('pitch', pitch.toFixed(1) + "°");
            safeSet('roll', roll.toFixed(1) + "°");
            safeSet('acc-x', engine.accel.x.toFixed(3));
            safeSet('acc-y', engine.accel.y.toFixed(3));
            safeSet('acc-z', engine.accel.z.toFixed(3));

        }, 100);
    }
    window.addEventListener('load', start);
})();
