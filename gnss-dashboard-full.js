(function() {
    "use strict";
    function start() {
        const engine = window.MainEngine = new ProfessionalUKF();
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        const btn = document.getElementById('gps-pause-toggle');
        if(btn) btn.onclick = () => {
            engine.isRunning = !engine.isRunning;
            btn.textContent = engine.isRunning ? "⏸️ SYSTÈME ACTIF" : "▶️ MARCHE GPS";
            engine.mass = parseFloat(document.getElementById('mass-input').value) || 70;
            if(typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission();
        };

        setInterval(() => {
            engine.update();
            const now = new Date();

            // Vitesse & Relativité
            safeSet('speed-main-display', (engine.vMs * 3.6).toFixed(2) + " km/h");
            safeSet('speed-stable-kmh', (engine.vMs * 3.6).toFixed(3) + " km/h");
            const gamma = 1 / Math.sqrt(1 - Math.pow(engine.vMs / engine.C, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));
            safeSet('kinetic-energy', (0.5 * engine.mass * engine.vMs**2).toFixed(2) + " J");

            // Astronomie & Météo ISA
            const astro = engine.getAstro(5.36);
            safeSet('tslv', astro.lst.toFixed(4) + " h");
            safeSet('ecl-long', astro.sunLon.toFixed(2) + "°");
            safeSet('utc-datetime', now.toISOString().replace('T', ' ').substr(0, 19));
            
            const rho = engine.getAirDensity();
            safeSet('air-density', rho.toFixed(4) + " kg/m³");
            const dragForce = 0.5 * rho * Math.pow(engine.vMs, 2) * engine.Cd * engine.Area;
            safeSet('drag-force', dragForce.toFixed(2) + " N");

            // Inclinaison
            const pitch = Math.atan2(-engine.accel.x, engine.accel.z) * (180/Math.PI);
            const roll = Math.atan2(engine.accel.y, engine.accel.z) * (180/Math.PI);
            safeSet('pitch', pitch.toFixed(1) + "°");
            safeSet('roll', roll.toFixed(1) + "°");
            
            // Horloge Minecraft (Visuel)
            const sunDeg = (astro.lst / 24) * 360;
            const sunEl = document.getElementById('sun-element');
            if(sunEl) sunEl.style.transform = `rotate(${sunDeg}deg)`;

        }, 100);
    }
    window.addEventListener('load', start);
})();
