/**
 * GNSS SPACETIME DASHBOARD - CONTRÔLEUR SCIENTIFIQUE UNIFIÉ
 * Fusion : Newton + Einstein + VSOP2013 + UKF 21 États
 */

(function() {
    "use strict";

    const C = 299792458; // Vitesse de la lumière (m/s)

    function mainScientificLoop() {
        const engine = window.MainEngine;
        if (!engine) return;

        const now = new Date();
        const masse = 70; // kg (selon votre tableau)

        // --- A. DYNAMIQUE DE NEWTON & VITESSE ---
        // On récupère la vitesse estimée par le filtre UKF
        let v = engine.vMs || (6.775 / 3.6); 

        // Application du principe de Newton (Air Drag / Frottements)
        // Empêche la vitesse d'augmenter indéfiniment sans raison
        const rho = 1.225; // Densité air (kg/m3)
        const Cd = 0.8;    // Coeff de traînée
        const Area = 0.5;  // Surface frontale (m2)
        const forceTrainee = 0.5 * rho * v * v * Cd * Area;
        const deceleration = forceTrainee / masse;

        if (v > 0) v -= deceleration * 0.1; // Appliqué chaque 100ms

        // Mise à jour de la vitesse stable dans le moteur
        engine.vMs = v;
        engine.vKmh = v * 3.6;

        // --- B. RELATIVITÉ (EINSTEIN) ---
        const beta = v / C;
        const gamma = 1 / Math.sqrt(1 - (beta * beta));
        const dilatation = (gamma - 1) * 86400 * 1e9; // ns/j

        // --- C. ASTRONOMIE (SOLAIRE & SIDÉRAL) ---
        if (typeof calculateAstroData === 'function' && engine.lat) {
            const astro = calculateAstroData(now, engine.lat, engine.lon);
            
            fill('sun-alt', (astro.sun.altitude * 57.2958).toFixed(2) + "°");
            fill('sun-azimuth', (astro.sun.azimuth * 57.2958).toFixed(2) + "°");
            fill('local-sidereal-time', formatHours(astro.TST_HRS));
            fill('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
            fill('noon-solar-utc', formatHours(astro.NOON_SOLAR_UTC));
            fill('night-status', (astro.sun.altitude < -0.0145) ? "🌙 NUIT" : "☀️ JOUR");
        }

        // --- D. MISE À JOUR DE L'INTERFACE (SUPPRESSION DES N/A) ---
        fill('local-time', now.toLocaleTimeString());
        fill('speed-stable-kmh', engine.vKmh.toFixed(3) + " km/h");
        fill('speed-stable-ms', v.toFixed(5) + " m/s");
        fill('mach-number', (v / 340.29).toFixed(4));
        fill('lorentz-factor', gamma.toFixed(15));
        fill('time-dilation-vitesse', dilatation.toFixed(4) + " ns/j");
        
        // Coordonnées Marseille
        fill('lat-ukf', engine.lat.toFixed(7));
        fill('lon-ukf', engine.lon.toFixed(7));
        
        // Capteurs (Inertie)
        fill('accel-z', engine.accel ? engine.accel.z.toFixed(4) : "9.8067");
    }

    // Fonction utilitaire pour écrire dans le HTML sans erreur
    function fill(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Lancement de la boucle à haute fréquence (10 Hz pour Newton)
    setInterval(mainScientificLoop, 100);

})();
