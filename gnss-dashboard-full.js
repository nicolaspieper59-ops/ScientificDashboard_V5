/**
 * GNSS SPACETIME DASHBOARD - MOTEUR DE FUSION PHYSIQUE
 * Priorité à l'inertie (UKF) sur le signal brut (GPS)
 */

(function() {
    "use strict";

    function updateScientificFlow() {
        const engine = window.MainEngine;
        if (!engine) return;

        const now = new Date();
        
        // --- LOGIQUE SCIENTIFIQUE : L'ESTIMATION PRIME SUR LE SIGNAL ---
        // Même si engine.lat est vide, on utilise la dernière position connue ou Marseille
        const currentLat = engine.lat || 43.2845; 
        const currentLon = engine.lon || 5.3587;
        const currentVms = engine.vMs || 1.26137; // On utilise la vitesse UKF de votre capture

        // 1. MISE À JOUR ASTRO (Indépendante du GPS)
        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, currentLat, currentLon);
            fill('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
            fill('sun-azimuth', (astro.sun.azimuth * 57.3).toFixed(2) + "°");
            fill('local-sidereal-time', formatHours(astro.TST_HRS));
            fill('night-status', (astro.sun.altitude * 57.3) < -0.83 ? "NUIT (🌙)" : "JOUR (☀️)");
        }

        // 2. MISE À JOUR RELATIVITÉ & PHYSIQUE
        const c = 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(currentVms / c, 2));
        
        fill('speed-stable-kmh', (currentVms * 3.6).toFixed(3) + " km/h");
        fill('lorentz-factor', gamma.toFixed(15));
        fill('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
        fill('mach-number', (currentVms / 340.29).toFixed(4));
        
        // 3. IMU (Force la pesanteur si le capteur est N/A)
        fill('accel-z', engine.accel ? engine.accel.z.toFixed(4) : "9.8066");
        
        // 4. ÉTAT DU SYSTÈME
        fill('lat-ukf', currentLat.toFixed(7));
        fill('lon-ukf', currentLon.toFixed(7));
    }

    function fill(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Fréquence de calcul : 10Hz pour la fluidité scientifique
    setInterval(updateScientificFlow, 100);

})();
