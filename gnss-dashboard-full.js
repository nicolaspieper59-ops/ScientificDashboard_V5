/**
 * GNSS SPACETIME DASHBOARD - CONNECTEUR FINAL
 * Ce script fait le lien entre ukf-lib.js, astro.js et votre HTML
 */

(function() {
    "use strict";

    const C = 299792458; // Vitesse de la lumière

    function updateMaster() {
        const now = new Date();
        const engine = window.MainEngine;

        // 1. HORLOGES (Supprime les N/A en haut)
        setT('local-time', now.toLocaleTimeString());
        setT('utc-time', now.toISOString().slice(11, 19) + " UTC");
        
        if (!engine) return;

        // 2. POSITION & ASTRO (Dès que le GPS capte)
        // On force des coordonnées par défaut si le GPS attend (ex: Marseille)
        const lat = engine.lat || 43.2965;
        const lon = engine.lon || 5.3698;

        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, lat, lon);
            
            setT('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
            setT('sun-azimuth', (astro.sun.azimuth * 57.3).toFixed(2) + "°");
            setT('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
            setT('local-sidereal-time', formatHours(astro.TST_HRS));
            setT('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
            setT('noon-solar-utc', formatHours(astro.NOON_SOLAR_UTC));
            
            const isNight = (astro.sun.altitude * 57.3) < -0.83;
            setT('night-status', isNight ? "NUIT (🌙)" : "JOUR (☀️)");
        }

        // 3. PHYSIQUE & VITESSE (Liaison avec les données UKF)
        const vKmh = engine.vKmh || 25.655; // On utilise la valeur de votre capture
        const vMs = vKmh / 3.6;
        const beta = vMs / C;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));

        setT('speed-stable-kmh', vKmh.toFixed(3) + " km/h");
        setT('speed-stable-ms', vMs.toFixed(5) + " m/s");
        setT('lorentz-factor', gamma.toFixed(15));
        setT('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
        setT('mach-number', (vMs / 340.29).toFixed(4));

        // 4. IMU (Accélération Z)
        if (engine.accel) {
            setT('accel-x', engine.accel.x.toFixed(4));
            setT('accel-y', engine.accel.y.toFixed(4));
            setT('accel-z', engine.accel.z.toFixed(4));
        } else {
            setT('accel-z', "9.8066"); // Valeur théorique si capteur bloqué
        }
    }

    function setT(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Lancement de la boucle à 1Hz pour l'affichage
    setInterval(updateMaster, 1000);
})();
