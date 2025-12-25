/**
 * GNSS DASHBOARD - CÂBLAGE COMPLET (HTML <-> JS)
 * Correction : Mapping des IDs Astro et Lune
 */

(function() {
    "use strict";
    
    // Constantes
    const C = 299792458;
    const G_STD = 9.80665;
    let map = null;
    let pathLine = null;

    // --- INIT CARTE ---
    function initGlobeX(lat, lon) {
        if (typeof L === 'undefined' || map) return;
        try {
            map = L.map('map-container').setView([lat, lon], 18);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
            pathLine = L.polyline([], {color: '#00ff41', weight: 3}).addTo(map);
        } catch(e) { console.error("Map Error", e); }
    }

    // --- BOUCLE PRINCIPALE ---
    function mainEvolutionLoop() {
        const engine = window.MainEngine;
        if (!engine || !engine.isRunning) return;

        const now = new Date();
        const mass = engine.mass || 70;

        // 1. ÉTATS PHYSIQUES
        let v = engine.vMs || 0;
        let lat = engine.lat || 43.2845270;
        let lon = engine.lon || 5.3587157;
        let alt = engine.altitude || 0;

        // Init Map si besoin
        if (!map) initGlobeX(lat, lon);

        // Physique (Newton & Air)
        const rho = 1.225 * Math.exp(-alt / 8500); // Densité air
        if (engine.vBruteMs === 0 && v > 0) {
            // Frottements si pas de GPS actif
            v = Math.max(0, v - (0.05 * v + 0.01)); 
            engine.vMs = v;
        }

        // 2. ASTRO (LE CORRCTIF MAJEUR EST ICI)
        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, lat, lon);
            
            // --- SOLEIL ---
            update('sun-alt', astro.sun.altitude.toFixed(2) + "°");
            update('sun-azimuth', astro.sun.azimuth.toFixed(2) + "°");
            
            // --- LUNE (Nouveaux calculs) ---
            update('moon-alt', astro.moon.altitude.toFixed(2) + "°");
            update('moon-azimuth', astro.moon.azimuth.toFixed(2) + "°");
            update('moon-phase-name', getMoonPhaseName(astro.moon.illumination.phase));
            update('moon-illuminated', (astro.moon.illumination.phase * 100).toFixed(1) + "%");

            // --- TEMPS SIDÉRAL & SOLAIRE (Correction IDs HTML) ---
            update('tslv', formatHours(astro.lmst / 15));        // Temps Sidéral Local Vrai
            update('tst-time', formatHours(astro.tst));          // Heure Solaire Vraie
            update('mst-time', formatHours(astro.mst));          // Heure Solaire Moyenne
            update('equation-of-time', astro.eot.toFixed(2) + " min"); // Equation du temps
            update('noon-solar', formatHours(astro.solar_noon)); // Midi Solaire

            // --- DATES ---
            const dateStr = now.toLocaleDateString();
            update('date-display-astro', dateStr);
            update('date-solar-mean', dateStr); // Approx pour affichage
            
            // --- UI GLOBALE ---
            const isNight = astro.sun.altitude < -6; // Crépuscule civil
            update('astro-phase', isNight ? "NUIT / CRÉPUSCULE (🌙)" : "JOUR (☀️)");
            
            // Animation Horloge Minecraft (Bonus visuel)
            const sunElem = document.getElementById('sun-element');
            const moonElem = document.getElementById('moon-element');
            if(sunElem && moonElem) {
                // Rotation simple basée sur l'heure (0-24h -> 0-360deg)
                const rot = ((astro.tst / 24) * 360) - 90; 
                sunElem.style.transform = `rotate(${rot}deg)`;
                moonElem.style.transform = `rotate(${rot + 180}deg)`;
            }
        }

        // 3. RELATIVITÉ & PHYSIQUE
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / C, 2));
        const ke = 0.5 * mass * v * v;
        
        update('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        update('kinetic-energy', ke.toFixed(2) + " J");
        update('lorentz-factor', gamma.toFixed(15));
        
        // Données GPS affichées
        update('lat-ukf', lat.toFixed(7));
        update('lon-ukf', lon.toFixed(7));
        update('air-density', rho.toFixed(4) + " kg/m³");

        // Carte Trace
        if (map && pathLine && v > 0.1) {
            pathLine.addLatLng([lat, lon]);
            map.panTo([lat, lon]);
        }
    }

    function update(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Start
    setInterval(mainEvolutionLoop, 100);
})();
