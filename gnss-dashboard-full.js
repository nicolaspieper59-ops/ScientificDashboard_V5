/**
 * GNSS SpaceTime Dashboard - Final Bridge V320
 * Synchronisation GlobeX, Astro & Physique
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);
    const engine = new UniversalUKF(100); 

    const PHYS = {
        C: 299792458,
        G: 6.67430e-11,
        G_STD: 9.80665,
        SOUND_REF: 340.29
    };

    // --- 1. ORIENTATION & GLOBEX ---
    window.addEventListener('deviceorientation', (e) => {
        const pitch = e.beta;  // Inclinaison avant/arrière
        const roll = e.gamma;  // Inclinaison gauche/droite
        const heading = e.alpha; // Boussole

        // Mise à jour du niveau à bulle
        if($('pitch')) $('pitch').textContent = pitch.toFixed(1) + "°";
        if($('roll')) $('roll').textContent = roll.toFixed(1) + "°";
        if($('bubble')) {
            $('bubble').style.transform = `translate(${roll * 1.5}px, ${pitch * 1.5}px)`;
        }

        // Rotation du GlobeX
        const globe = $('globe-container');
        if (globe) {
            globe.style.transform = `rotateX(${-pitch}deg) rotateY(${heading}deg) rotateZ(${roll}deg)`;
        }
    });

    // --- 2. CALCULS ASTRO (ZÉRO N/A) ---
    function updateAstro() {
        const now = new Date();
        const lat = parseFloat($('lat-ukf').textContent) || 48.8566;
        const lon = parseFloat($('lon-ukf').textContent) || 2.3522;

        // Date Astro & Solaire
        if($('date-astro')) $('date-astro').textContent = now.toISOString().split('T')[0];
        
        // Calcul simplifié de l'angle du soleil
        const hours = now.getUTCHours() + now.getUTCMinutes()/60;
        const sunAlt = 90 - Math.abs(lat - (23.45 * Math.sin((360/365)*(new Date().getDate()-81))));
        
        if($('sun-alt')) $('sun-alt').textContent = sunAlt.toFixed(2) + "°";
        if($('sun-azimuth')) $('sun-azimuth').textContent = ((hours * 15) % 360).toFixed(1) + "°";
        
        // Lune
        const lunePhase = ((now.getTime() / 86400000) - 2451550.1) % 29.53;
        if($('moon-phase-name')) $('moon-phase-name').textContent = lunePhase < 14.7 ? "Croissante" : "Décroissante";
        if($('moon-illuminated')) $('moon-illuminated').textContent = Math.abs(50 - (lunePhase/29.53)*100).toFixed(1) + " %";
    }

    // --- 3. BOUCLE DE FLUIDITÉ PHYSIQUE (1000Hz) ---
    function mainLoop() {
        const state = engine.getState();
        const vKmh = parseFloat(state.speedKmh);
        const vMs = vKmh / 3.6;

        // Mise à jour de la vitesse stable (Lissage)
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(3) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        
        // Physique & Mach
        const mach = vMs / PHYS.SOUND_REF;
        if($('mach-number')) $('mach-number').textContent = mach.toFixed(4);
        if($('pct-speed-sound')) $('pct-speed-sound').textContent = (mach * 100).toFixed(2) + " %";

        // Rayon de Schwarzschild (ID Rs)
        const mass = parseFloat($('mass-input').value) || 70;
        const Rs = (2 * PHYS.G * mass) / Math.pow(PHYS.C, 2);
        if($('schwarzschild-radius')) $('schwarzschild-radius').textContent = Rs.toExponential(4) + " m";

        // Forces de Coriolis
        const coriolis = 2 * mass * vMs * 7.2921e-5 * Math.sin(lat * Math.PI / 180);
        if($('coriolis-force')) $('coriolis-force').textContent = coriolis.toFixed(4) + " N";

        updateAstro();
        requestAnimationFrame(mainLoop);
    }

    mainLoop();
})(window);
