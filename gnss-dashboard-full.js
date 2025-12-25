(function() {
    "use strict";

    function updateDashboard() {
        const engine = window.MainEngine;
        if (!engine) return;

        engine.update();
        const v = engine.vMs;
        const c = 299792458;
        const now = new Date();

        // 1. VITESSE & DISTANCE
        update('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        update('speed-stable-ms', v.toFixed(4) + " m/s");
        update('total-distance-3d', engine.distance3D.toFixed(4) + " km");
        update('precise-distance-ukf', engine.distance3D.toFixed(7) + " km");

        // 2. RELATIVITÉ & FORCES
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/c, 2));
        update('lorentz-factor', gamma.toFixed(15));
        update('kinetic-energy', (0.5 * engine.mass * v * v).toFixed(2) + " J");
        
        // Vitesse de libération
        const vLib = 11186; // m/s sur Terre
        update('cosmic-speed', (v / vLib * 100).toFixed(4) + " % (Libération)");

        // 3. ASTRO (VSOP2013)
        const astro = calculateAstroData(now, engine.lat, engine.lon);
        update('sun-alt', astro.sun.altitude.toFixed(4) + "°");
        update('sun-distance', (astro.sun.distance * 149597870.7).toLocaleString() + " km");
        
        // 4. DYNAMIQUE & MÉTO (OACI)
        const alt = engine.altitude;
        const rho = 1.225 * Math.exp(-alt / 8500);
        update('air-density', rho.toFixed(4) + " kg/m³");
        update('pres-atm', (1013.25 * Math.pow(1 - (0.0065*alt)/288.15, 5.255)).toFixed(2) + " hPa");
        
        // Forces G
        const gVert = engine.accel.z / 9.80665;
        update('force-g-vert', gVert.toFixed(3) + " G");
        update('gravity-local', (9.80665 * (1 - (0.0000011 * Math.sin(astro.sun.altitude * Math.PI/180)))).toFixed(6) + " m/s²");
    }

    function update(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // --- ACTIVATION DU BOUTON MARCHE GPS ---
    window.addEventListener('load', () => {
        const btn = document.querySelector('.status-indicator') || document.getElementById('system-status');
        if (btn) {
            btn.onclick = function() {
                if (!window.MainEngine) return;
                window.MainEngine.isRunning = !window.MainEngine.isRunning;
                this.textContent = window.MainEngine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                this.style.color = window.MainEngine.isRunning ? "#00ff41" : "#ff4d4d";
            };
        }
        setInterval(updateDashboard, 100);
    });
})();
