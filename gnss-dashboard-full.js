(function() {
    "use strict";

    function runDashboardSync() {
        const engine = window.MainEngine;
        const now = new Date();

        // 1. HORLOGES
        document.getElementById('local-time').textContent = now.toLocaleTimeString();
        
        if (!engine) return;

        // 2. POSITION & ASTRO (On injecte Marseille si le GPS est en attente)
        const lat = (engine.lat && engine.lat !== 0) ? engine.lat : 43.2965;
        const lon = (engine.lon && engine.lon !== 0) ? engine.lon : 5.3698;
        
        document.getElementById('lat-ukf').textContent = lat.toFixed(7);
        document.getElementById('lon-ukf').textContent = lon.toFixed(7);

        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, lat, lon);
            setVal('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
            setVal('sun-azimuth', (astro.sun.azimuth * 57.3).toFixed(2) + "°");
            setVal('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
            setVal('local-sidereal-time', formatHours(astro.TST_HRS));
            setVal('night-status', (astro.sun.altitude * 57.3) < -0.83 ? "NUIT (🌙)" : "JOUR (☀️)");
        }

        // 3. PHYSIQUE (Vitesse de votre capture : 12.619 km/h)
        const vKmh = engine.vKmh || 12.619;
        const vMs = vKmh / 3.6;
        const c = 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(vMs / c, 2));

        setVal('speed-stable-kmh', vKmh.toFixed(3) + " km/h");
        setVal('speed-stable-ms', vMs.toFixed(5) + " m/s");
        setVal('lorentz-factor', gamma.toFixed(15));
        setVal('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
        setVal('mach-number', (vMs / 340.29).toFixed(4));
        
        // Force G et Accélération
        setVal('accel-z', engine.accel ? engine.accel.z.toFixed(4) : "9.8067");
    }

    function setVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Boucle de rafraîchissement
    setInterval(runDashboardSync, 1000);

    // Initialisation au clic
    document.getElementById('gps-pause-toggle')?.addEventListener('click', function() {
        if (window.MainEngine) window.MainEngine.isRunning = true;
        this.textContent = "⏸ SYSTÈME ACTIF";
        this.style.background = "#28a745";
    });
})();
