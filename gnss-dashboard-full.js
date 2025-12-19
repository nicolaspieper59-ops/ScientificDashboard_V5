/**
 * GNSS SPACETIME DASHBOARD - V68 "GALILEO-QUANTUM"
 * Intégration complète astro.js / ephem.js / Inertie Newtonienne
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_STD = 9.80665;
    const R2D = 180 / Math.PI;

    let state = {
        v: 0.165, // Correspond à 0.594 km/h
        lastT: performance.now(),
        totalDist: 0,
        driftNTP: 0
    };

    // --- SYNCHRO TEMPORELE ATOMIQUE ---
    async function syncAtomicTime() {
        try {
            const t0 = performance.now();
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            state.driftNTP = new Date(data.datetime).getTime() - (Date.now() + (performance.now() - t0)/2);
            if($('ntp-offset')) $('ntp-offset').textContent = state.driftNTP.toFixed(0) + " ms";
            if($('utc-time')) $('utc-time').textContent = new Date(Date.now() + state.driftNTP).toUTCString();
        } catch(e) { console.warn("Erreur Synchro NTP"); }
    }

    const updateLoop = (e) => {
        const now = Date.now() + state.driftNTP;
        const dt = (performance.now() - state.lastT) / 1000;
        state.lastT = performance.now();
        if (dt <= 0 || dt > 0.2) return;

        // 1. PHYSIQUE & RELATIVITÉ
        const beta = state.v / C;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        const dtRelatif = dt / gamma; // Temps propre

        const ax = e.accelerationIncludingGravity?.x || 0;
        const az = e.accelerationIncludingGravity?.z || 0;
        const accPureZ = e.acceleration?.z || 0;

        // Calcul d'inertie (Ignorer le bruit < 0.01)
        const pitch = Math.atan2(-ax, az);
        const linAcc = ax + (Math.sin(pitch) * G_STD);
        
        if (Math.abs(linAcc) > 0.01) {
            state.v += linAcc * dtRelatif;
        }

        // 2. RÉSOLUTION DES N/A (Injection DOM)
        const masse = parseFloat($('mass-input')?.value) || 70;
        
        // Dynamique
        if($('g-force-vert')) $('g-force-vert').textContent = ((G_STD + accPureZ) / G_STD).toFixed(3) + " G";
        if($('accel-long')) $('accel-long').textContent = linAcc.toFixed(3) + " m/s²";
        if($('accel-vert-imu')) $('accel-vert-imu').textContent = accPureZ.toFixed(3) + " m/s²";
        
        // Relativité
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);
        if($('momentum')) $('momentum').textContent = (gamma * masse * state.v).toFixed(4) + " kg·m/s";
        if($('mass-energy')) $('mass-energy').textContent = (masse * C**2 * gamma).toExponential(3) + " J";
        if($('time-dilation-v')) $('time-dilation-v').textContent = ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j";

        // 3. ASTRONOMIE (Via vos fichiers chargés)
        if (typeof getAstroData === 'function') {
            const lat = 48.8584, lon = 2.2945; // Exemple (Paris) ou GPS
            const astro = getAstroData(new Date(now), lat, lon);
            
            if($('sun-alt')) $('sun-alt').textContent = astro.sun.altitude.toFixed(2) + "°";
            if($('sun-azimuth')) $('sun-azimuth').textContent = astro.sun.azimuth.toFixed(2) + "°";
            if($('tst-time')) $('tst-time').textContent = formatHours(astro.TST_HRS);
            if($('moon-phase-name')) $('moon-phase-name').textContent = getMoonPhaseName(astro.moon.illumination.phase);
        }
    };

    window.addEventListener('load', () => {
        syncAtomicTime();
        window.addEventListener('devicemotion', updateLoop, true);
    });

})(window);
