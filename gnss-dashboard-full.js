(function() {
    "use strict";
    function start() {
        const engine = window.MainEngine = new ProfessionalUKF();
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        // Bouton Toggle
        const btn = document.getElementById('gps-pause-toggle');
        if(btn) btn.onclick = () => {
            engine.isRunning = !engine.isRunning;
            btn.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
            if(typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission();
        };

        setInterval(() => {
            engine.update();
            const now = new Date();

            // VITESSES (km/h et m/s)
            safeSet('speed-main-display', (engine.vMs * 3.6).toFixed(2) + " km/h");
            safeSet('speed-stable-kmh', (engine.vMs * 3.6).toFixed(3) + " km/h");
            safeSet('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");

            // RELATIVITÉ (Lorentz Gamma)
            const c = 299792458;
            const gamma = 1 / Math.sqrt(1 - Math.pow(engine.vMs / c, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));

            // ÉNERGIE (1/2 mv²)
            const kinetic = 0.5 * engine.mass * Math.pow(engine.vMs, 2);
            safeSet('kinetic-energy', kinetic.toFixed(2) + " J");

            // ASTRO ET TEMPS
            safeSet('local-time-ntp', now.toLocaleTimeString());
            safeSet('utc-time', now.toISOString().split('T')[1].substr(0,8));
            
            // Calcul Inclinaison Réelle
            const pitch = Math.atan2(-engine.accel.x, engine.accel.z) * (180/Math.PI);
            const roll = Math.atan2(engine.accel.y, engine.accel.z) * (180/Math.PI);
            safeSet('pitch-val', pitch.toFixed(1) + "°");
            safeSet('roll-val', roll.toFixed(1) + "°");

            // Distance
            safeSet('total-distance-3d', engine.distance3D.toFixed(6) + " km");
        }, 100);
    }
    window.addEventListener('load', start);
})();
