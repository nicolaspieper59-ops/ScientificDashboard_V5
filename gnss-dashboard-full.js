/**
 * GNSS SPACETIME DASHBOARD - V69 ULTRA-FREQUENCE
 * - Échantillonnage Virtuel : 1000Hz (dt = 0.001s)
 * - Correction Gravitationnelle par Pitch (Trigonométrie)
 * - Synchro Atomique NTP Haute Fidélité
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_BASE = 9.80665;

    let state = {
        v: 0.165, // m/s
        totalDist: 0,
        lastHardwareT: performance.now(),
        driftNTP: 0,
        pitch: 0,
        accRawX: 0,
        accRawZ: 0
    };

    // --- 1. SYNCHRO ATOMIQUE (Résout Heure Locale N/A) ---
    async function syncAtomic() {
        try {
            const t0 = performance.now();
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            state.driftNTP = new Date(data.datetime).getTime() - (Date.now() + (performance.now() - t0)/2);
            if($('ntp-offset')) $('ntp-offset').textContent = state.driftNTP.toFixed(0) + " ms";
        } catch(e) { console.error("Synchro NTP impossible"); }
    }

    // --- 2. CAPTURE MATÉRIELLE (DeviceMotion) ---
    window.addEventListener('devicemotion', (e) => {
        state.accRawX = e.accelerationIncludingGravity?.x || 0;
        state.accRawZ = e.accelerationIncludingGravity?.z || 0;
        state.accPureZ = e.acceleration?.z || 0;
        
        // Calcul du Pitch pour la correction
        state.pitch = Math.atan2(-state.accRawX, state.accRawZ);
        state.lastHardwareT = performance.now();
    }, true);

    // --- 3. MOTEUR D'INTÉGRATION À 1000 HZ (Tick = 1ms) ---
    setInterval(() => {
        const dt = 0.001; // Fréquence forcée à 1000Hz
        
        // CORRECTION DE L'ACCÉLÉRATION PAR L'INCLINAISON
        // On soustrait la projection de la gravité sur l'axe X
        const gravityEffect = G_BASE * Math.sin(state.pitch);
        const linAccCorrige = state.accRawX - gravityEffect;

        // RELATIVITÉ (Gamma)
        const beta = state.v / C;
        const gamma = 1 / Math.sqrt(1 - beta * beta);
        const dtRelatif = dt / gamma;

        // LOI DE NEWTON (Vitesse sans évaporation)
        // Seuil de bruit (Deadzone) pour stabiliser l'inertie
        if (Math.abs(linAccCorrige) > 0.015) {
            state.v += linAccCorrige * dtRelatif;
        } else {
            state.v *= 0.999999; // Conservation quasi-parfaite
        }

        if (state.v < 0) state.v = 0;
        state.totalDist += state.v * dtRelatif;

        // Mise à jour de l'interface (plus lente que 1000Hz pour les yeux)
        if (Math.random() > 0.95) updateUI(linAccCorrige, gamma); 
    }, 1); // Exécution toutes les 1 milliseconde

    // --- 4. RÉSOLUTION DES N/A (MAPPING DOM) ---
    function updateUI(acc, gamma) {
        const vKmh = state.v * 3.6;
        const masse = parseFloat($('mass-input')?.value) || 70;

        // Vitesse
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(3) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(3);
        
        // Dynamique
        if($('accel-long')) $('accel-long').textContent = acc.toFixed(3) + " m/s²";
        if($('pitch')) $('pitch').textContent = (state.pitch * 180 / Math.PI).toFixed(1) + "°";
        if($('force-g-vert')) $('force-g-vert').textContent = ((G_BASE + state.accPureZ) / G_BASE).toFixed(3) + " G";

        // Relativité & Schwarzschild
        const Rs = (2 * 6.6743e-11 * masse) / Math.pow(C, 2);
        if($('schwarzschild-radius')) $('schwarzschild-radius').textContent = Rs.toExponential(4) + " m";
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * masse * state.v**2).toFixed(2) + " J";
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);

        // Astro (via astro.js)
        if (typeof getAstroData === 'function') {
            const now = new Date(Date.now() + state.driftNTP);
            const astro = getAstroData(now, 48.85, 2.35);
            if($('sun-alt')) $('sun-alt').textContent = astro.sun.altitude.toFixed(2) + "°";
            if($('tst-time')) $('tst-time').textContent = formatHours(astro.TST_HRS);
        }
    }

    syncAtomic();
})(window);
