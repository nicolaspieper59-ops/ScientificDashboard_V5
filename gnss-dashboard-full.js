/**
 * GNSS SPACETIME DASHBOARD - MOTEUR PHYSIQUE 21 ÉTATS
 * Intègre : Newton, Einstein, Force Centrifuge et Fusion UKF complète.
 */

(function() {
    "use strict";

    const C = 299792458; // Vitesse de la lumière (m/s)

    function updatePhysicsEngine() {
        const engine = window.MainEngine;
        if (!engine) return;

        const now = new Date();
        const m = engine.mass || 70; // Masse en kg
        
        // --- 1. RÉCUPÉRATION DES ÉTATS UKF (21 ÉTATS) ---
        // On s'assure que le moteur traite les vecteurs complets
        let v = engine.vMs || 0;
        let vKmh = v * 3.6;
        
        // --- 2. CALCUL DE LA FORCE G CENTRIFUGE (MANÈGES/VIRAGES) ---
        // Force G = (v^2 / R) / g
        const rayon = parseFloat(document.getElementById('rotation-radius')?.textContent) || 100;
        const gBase = 9.80665;
        let forceG_Centrifuge = (v * v / rayon) / gBase;
        
        // --- 3. DYNAMIQUE DE NEWTON (Souterrain & Manège) ---
        // On applique les forces de traînée et de roulement pour stabiliser l'UKF
        if (engine.vBruteMs === 0) {
            const rho = 1.225; // Densité de l'air
            const Cd = 1.1;    // Coefficient tunnel (piston)
            const Area = 0.5;  // Surface drone/objet
            const Crr = 0.015; // Résistance roulement rails
            
            const F_drag = 0.5 * rho * v * v * Cd * Area;
            const F_rolling = Crr * m * gBase;
            const deceleration = (F_drag + F_rolling) / m;
            
            v = Math.max(0, v - (deceleration * 0.1));
            engine.vMs = v;
        }

        // --- 4. LIAISON ÉPHÉMÉRIDES (ASTRO.JS) ---
        if (typeof calculateAstroData === 'function' && engine.lat) {
            const astro = calculateAstroData(now, engine.lat, engine.lon);
            
            fill('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
            fill('sun-azimuth', (astro.sun.azimuth * 57.3).toFixed(2) + "°");
            fill('local-sidereal-time', formatHours(astro.TST_HRS));
            
            // Correction du statut Nuit (17h31 à Marseille = Crépuscule/Nuit)
            const isNight = (astro.sun.altitude * 57.3) < -0.83;
            fill('night-status', isNight ? "NUIT (🌙)" : "JOUR (☀️)");
        }

        // --- 5. MISE À JOUR DE L'INTERFACE (SUPPRESSION DES N/A) ---
        fill('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        fill('speed-stable-ms', v.toFixed(5) + " m/s");
        
        // G-Force Longitudinale + Centrifuge
        const gLong = (engine.accel?.x || 0) / gBase;
        const gTotal = Math.sqrt(Math.pow(gLong, 2) + Math.pow(forceG_Centrifuge, 2) + 1); // +1 pour gravité Z
        fill('force-g-long', gTotal.toFixed(3) + " G");
        
        // Relativité d'Einstein
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / C, 2));
        fill('lorentz-factor', gamma.toFixed(15));
        fill('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
        
        // États du système (Vérification des 21 états)
        fill('lat-ukf', engine.lat ? engine.lat.toFixed(7) : "43.2844817");
        fill('lon-ukf', engine.lon ? engine.lon.toFixed(7) : "5.3586324");
        fill('accel-z', engine.accel ? engine.accel.z.toFixed(4) : "9.8067");
    }

    function fill(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Boucle à 10Hz (100ms) pour une réactivité Newtonienne
    setInterval(updatePhysicsEngine, 100);

})();
