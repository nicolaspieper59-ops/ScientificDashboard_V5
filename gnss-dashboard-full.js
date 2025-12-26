(function() {
    "use strict";
    function start() {
        const engine = window.MainEngine = new ProfessionalUKF();
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        setInterval(() => {
            engine.update();
            const v = Math.sqrt(engine.state.v.x**2 + engine.state.v.y**2 + engine.state.v.z**2);
            
            // --- ÉTATS PHYSIQUES ---
            safeSet('speed-main-display', (v * 3.6).toFixed(2) + " km/h");
            safeSet('accel-vert', engine.state.a.z.toFixed(3) + " m/s²");
            safeSet('vel-z', engine.state.v.z.toFixed(2) + " m/s");
            
            // --- ÉTATS ENVIRONNEMENTAUX ---
            safeSet('air-density', engine.state.rho.toFixed(4) + " kg/m³");
            const dragForce = 0.5 * engine.state.rho * v**2 * engine.Cd * engine.Area;
            safeSet('drag-force', dragForce.toFixed(2) + " N");

            // --- ASTRONOMIE VSOP2013 ---
            if (typeof vsop2013 !== 'undefined') {
                const jd = (new Date().getTime() / 86400000) + 2440587.5;
                const earth = vsop2013.earth.state(jd);
                const sunLon = (Math.atan2(-earth.r.y, -earth.r.x) * 180 / Math.PI + 360) % 360;
                safeSet('ecl-long', sunLon.toFixed(4) + "°");
                safeSet('tslv', ((jd % 1) * 24).toFixed(4) + " h");
            }

            // --- RELATIVITÉ & ÉNERGIE ---
            safeSet('kinetic-energy', (0.5 * engine.mass * v**2).toFixed(2) + " J");
            const gamma = 1 / Math.sqrt(1 - Math.pow(v / 299792458, 2));
            safeSet('lorentz-factor', gamma.toFixed(18));

        }, 50); // Fréquence de rafraîchissement 20Hz
    }
    window.addEventListener('load', start);
})();
