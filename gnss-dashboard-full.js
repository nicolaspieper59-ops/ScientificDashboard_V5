(function() {
    "use strict";
    function start() {
        const engine = window.MainEngine = new ProfessionalUKF();
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        const btn = document.getElementById('gps-pause-toggle');
        if(btn) btn.onclick = () => {
            engine.isRunning = !engine.isRunning;
            btn.textContent = engine.isRunning ? "⏸️ SYSTÈME ACTIF" : "▶️ MARCHE GPS";
            if(typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission();
        };

        setInterval(() => {
            engine.update();
            const v = Math.sqrt(engine.state.vel.x**2 + engine.state.vel.y**2 + engine.state.vel.z**2);
            const astro = engine.getAstro();

            // --- NAVIGATION & VITESSES ---
            safeSet('speed-main-display', (v * 3.6).toFixed(2) + " km/h");
            safeSet('vel-z', engine.state.vel.z.toFixed(2) + " m/s");
            safeSet('total-distance-3d', (Math.sqrt(engine.state.pos.x**2 + engine.state.pos.y**2 + engine.state.pos.z**2)/1000).toFixed(6) + " km");

            // --- DYNAMIQUE DES FLUIDES (FIN DES N/A) ---
            const rho = engine.state.rho;
            const q = 0.5 * rho * v**2;
            safeSet('air-density', rho.toFixed(4) + " kg/m³");
            safeSet('drag-force', (q * engine.Cd * engine.Area).toFixed(2) + " N");
            
            // Mach (Vitesse du son ISA)
            const speedSound = 331.3 + 0.606 * (15 - 0.0065 * engine.alt);
            safeSet('mach-number', (v / speedSound).toFixed(5));

            // --- ASTRONOMIE (VSOP2013) ---
            if (astro) {
                safeSet('tslv', astro.tslv.toFixed(4) + " h");
                safeSet('ecl-long', astro.sunLon.toFixed(2) + "°");
            }

            // --- RELATIVITÉ & PHYSIQUE ---
            const c = 299792458;
            const gamma = 1 / Math.sqrt(1 - Math.pow(v / c, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));
            safeSet('kinetic-energy', (0.5 * engine.mass * v**2).toFixed(2) + " J");

            // --- IMU ---
            safeSet('acc-x', engine.accelRaw.x.toFixed(3));
            safeSet('acc-y', engine.accelRaw.y.toFixed(3));
            safeSet('acc-z', engine.accelRaw.z.toFixed(3));

        }, 50);
    }
    window.addEventListener('load', start);
})();
