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
            const astro = engine.getAstroData();
            const v = Math.sqrt(engine.state.vel.x**2 + engine.state.vel.y**2 + engine.state.vel.z**2);
            const rho = engine.getAirDensity();

            // --- VITESSES & PHYSIQUE ---
            safeSet('speed-main-display', (v * 3.6).toFixed(2) + " km/h");
            safeSet('vel-z', engine.state.vel.z.toFixed(2) + " m/s");
            safeSet('kinetic-energy', (0.5 * engine.mass * v**2).toFixed(2) + " J");

            // --- FLUIDES & INERTIE ---
            const q = 0.5 * rho * v**2;
            const dragForce = q * engine.Cd * engine.Area;
            safeSet('air-density', rho.toFixed(4) + " kg/m³");
            safeSet('dyn-pressure', q.toFixed(2) + " Pa");
            safeSet('drag-force', dragForce.toFixed(2) + " N");
            safeSet('ballistic-coeff', engine.getBallisticCoefficient().toFixed(2) + " kg/m²");

            // --- NAVIGATION 21-ÉTATS (RÉPONSE AUX N/A) ---
            safeSet('acc-x', engine.accelRaw.x.toFixed(3));
            safeSet('acc-y', engine.accelRaw.y.toFixed(3));
            safeSet('acc-z', engine.accelRaw.z.toFixed(3));
            safeSet('total-distance-3d', (Math.sqrt(engine.state.pos.x**2 + engine.state.pos.y**2 + engine.state.pos.z**2)/1000).toFixed(6) + " km");

            // --- ASTRONOMIE (VSOP2013) ---
            if (astro) {
                safeSet('tslv', astro.tslv.toFixed(4) + " h");
                safeSet('ecl-long', astro.sunLon.toFixed(2) + "°");
            }

            // --- RELATIVITÉ ---
            const gamma = 1 / Math.sqrt(1 - Math.pow(v / 299792458, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));

        }, 40); // 25Hz pour la fluidité
    }
    window.addEventListener('load', start);
})();
