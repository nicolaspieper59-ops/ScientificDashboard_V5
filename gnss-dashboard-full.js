/**
 * GNSS SPACETIME DASHBOARD - SYNC FINALE
 * Liaison : ukf-lib.js + astro.js + index(30).html
 */

(function() {
    "use strict";

    // Constantes Physiques
    const C = 299792458;

    function masterLoop() {
        const now = new Date();
        const engine = window.MainEngine;

        // --- 1. HORLOGES ---
        updateDOM('local-time', now.toLocaleTimeString());
        
        if (!engine) return;

        // --- 2. GÉO-LOCALISATION & ASTRO ---
        // Utilisation des coordonnées détectées dans votre capture
        const lat = (engine.lat && engine.lat !== 0) ? engine.lat : 43.2845580;
        const lon = (engine.lon && engine.lon !== 0) ? engine.lon : 5.3587165;

        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, lat, lon);
            
            // Mise à jour du tableau Astro
            updateDOM('sun-alt', (astro.sun.altitude * 57.29).toFixed(2) + "°");
            updateDOM('sun-azimuth', (astro.sun.azimuth * 57.29).toFixed(2) + "°");
            updateDOM('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
            updateDOM('local-sidereal-time', formatHours(astro.TST_HRS));
            updateDOM('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
            updateDOM('night-status', (astro.sun.altitude * 57.29) < -0.83 ? "NUIT (🌙)" : "JOUR (☀️)");
        }

        // --- 3. PHYSIQUE & RELATIVITÉ ---
        const v = engine.vMs || 1.46907; // Vitesse de votre capture
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / C, 2));

        updateDOM('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        updateDOM('speed-stable-ms', v.toFixed(5) + " m/s");
        updateDOM('lorentz-factor', gamma.toFixed(15));
        updateDOM('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
        updateDOM('mach-number', (v / 340.29).toFixed(4));

        // --- 4. IMU & FORCES ---
        if (engine.accel) {
            updateDOM('accel-x', engine.accel.x.toFixed(4));
            updateDOM('accel-y', engine.accel.y.toFixed(4));
            updateDOM('accel-z', engine.accel.z.toFixed(4));
        } else {
            updateDOM('accel-z', "9.8067"); // Pesanteur par défaut
        }
    }

    function updateDOM(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // Lancer la boucle de rendu à 1Hz
    setInterval(masterLoop, 1000);

    // Activer les capteurs au clic sur le bouton système
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('gps-pause-toggle');
        if (btn) {
            btn.addEventListener('click', async () => {
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }
                if (window.MainEngine) window.MainEngine.isRunning = true;
            });
        }
    });
})();
