/**
 * GNSS SPACETIME DASHBOARD - SYNC FINALE
 * Liaison : UKF (Marseille) -> Astro (Soleil/Lune) -> DOM
 */

(function() {
    "use strict";

    function updateAll() {
        const now = new Date();
        const engine = window.MainEngine;

        // 1. HORLOGES DE BASE (Toujours actives)
        setText('local-time', now.toLocaleTimeString());
        setText('utc-time', now.toISOString().slice(11, 19) + " UTC");

        // 2. CALCULS ASTRO (Si le GPS a une position)
        if (engine && engine.lat && typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, engine.lat, engine.lon);

            // Mapping des IDs du HTML pour le Soleil et la Lune
            setText('sun-alt', (astro.sun.altitude * 57.29).toFixed(2) + "°");
            setText('sun-azimuth', (astro.sun.azimuth * 57.29).toFixed(2) + "°");
            setText('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
            setText('moon-illumination', (astro.moon.illumination.fraction * 100).toFixed(1) + "%");
            setText('moon-alt', (astro.moon.altitude * 57.29).toFixed(2) + "°");
            setText('local-sidereal-time', formatHours(astro.TST_HRS));
            setText('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
            setText('noon-solar-utc', formatHours(astro.NOON_SOLAR_UTC));
            
            // Statut Nuit/Jour
            const isNight = (astro.sun.altitude * 57.29) < -0.83;
            setText('night-status', isNight ? "NUIT (🌙)" : "JOUR (☀️)");
        }

        // 3. RELATIVITÉ (IDs exacts du HTML)
        if (engine) {
            const v = engine.vMs || 0;
            const c = 299792458;
            const gamma = 1 / Math.sqrt(1 - Math.pow(v / c, 2));
            
            setText('lorentz-factor', gamma.toFixed(15));
            setText('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
            setText('mach-number', (v / 340.29).toFixed(4));
            setText('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        }
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Lancement de la boucle de synchronisation (1 Hz)
    setInterval(updateAll, 1000);

    // Initialisation forcée des boutons
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('gps-pause-toggle')?.addEventListener('click', function() {
            if (window.MainEngine) {
                window.MainEngine.isRunning = !window.MainEngine.isRunning;
                this.textContent = window.MainEngine.isRunning ? "⏸ SYSTÈME ACTIF" : "▶ SYSTÈME EN PAUSE";
                this.style.background = window.MainEngine.isRunning ? "#28a745" : "#ffc107";
            }
        });
    });
})();
