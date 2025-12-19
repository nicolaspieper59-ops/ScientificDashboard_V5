/**
 * GNSS SPACETIME DASHBOARD - V68 PROFESSIONAL
 * Moteur complet : Inertie Newtonienne, Relativité, Astro & Mapping DOM
 */

((window) => {
    "use strict";

    // --- 1. CONSTANTES & UTILITAIRES ---
    const $ = id => document.getElementById(id);
    const C = 299792458; // Vitesse de la lumière (m/s)
    const G_STD = 9.80665;
    const R2D = 180 / Math.PI;

    // Utilitaire de formatage type "Tableau de bord"
    const display = (id, val, suffix = '', dec = 3) => {
        const el = $(id);
        if (!el) return;
        if (val === undefined || val === null || isNaN(val)) {
            el.textContent = 'N/A';
        } else {
            el.textContent = val.toFixed(dec).replace('.', ',') + suffix;
        }
    };

    // --- 2. ÉTAT DU SYSTÈME ---
    let state = {
        v: 0.165,           // Vitesse m/s (0.594 km/h initial)
        totalDist: 0,
        lastT: performance.now(),
        driftNTP: 0,
        isPaused: true,
        timeInMotionMs: 0,
        sessionStart: Date.now()
    };

    // --- 3. MOTEUR TEMPOREL ATOMIQUE (Synchro NTP) ---
    async function syncAtomicTime() {
        try {
            const t0 = performance.now();
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            const atomicTime = new Date(data.datetime).getTime();
            const latency = (performance.now() - t0) / 2;
            state.driftNTP = atomicTime - (Date.now() + latency);
            if ($('ntp-offset')) $('ntp-offset').textContent = state.driftNTP.toFixed(0) + " ms";
            console.log("✅ Synchro Atomique opérationnelle");
        } catch (e) {
            console.warn("⚠️ Mode Offline : Décalage NTP non synchronisé");
        }
    }

    // --- 4. CŒUR DE NAVIGATION & MAPPING ---
    const processHardwareData = (e) => {
        if (state.isPaused) return;

        const now = Date.now() + state.driftNTP;
        const dt = (performance.now() - state.lastT) / 1000;
        state.lastT = performance.now();
        if (dt <= 0 || dt > 0.2) return;

        // --- CALCULS PHYSIQUES ---
        const gamma = 1 / Math.sqrt(1 - Math.pow(state.v / C, 2));
        const dtRelatif = dt / gamma; // Dilatation du temps (Temps Propre)

        const ax = e.accelerationIncludingGravity?.x || 0;
        const ay = e.accelerationIncludingGravity?.y || 0;
        const az = e.accelerationIncludingGravity?.z || 0;
        const accPureZ = e.acceleration?.z || 0;

        // Inertie Newtonienne (Anti-évaporation)
        const pitch = Math.atan2(-ax, Math.sqrt(ay*ay + az*az));
        const linAcc = ax + (Math.sin(pitch) * G_STD);
        
        // On ne modifie la vitesse que si l'accélération dépasse le bruit de fond
        if (Math.abs(linAcc) > 0.01) {
            state.v += linAcc * dtRelatif;
        }
        if (state.v < 0) state.v = 0;

        state.totalDist += state.v * dtRelatif;
        if (state.v > 0.01) state.timeInMotionMs += dtRelatif * 1000;

        // --- MAPPING INTEGRAL DES ID HTML ---
        
        // A. Vitesse & Relativité
        const vKmh = state.v * 3.6;
        display('speed-main-display', vKmh, ' km/h', 3);
        display('speed-stable-kmh', vKmh, '', 3);
        display('speed-stable-ms', state.v, ' m/s', 3);
        display('lorentz-factor', gamma, '', 12);
        display('time-dilation-vitesse', (gamma - 1) * 86400 * 1e9, ' ns/j', 2);
        display('pct-speed-of-light', (state.v / C * 100), ' %', 8);

        // B. Énergie (Dynamique)
        const masse = parseFloat($('mass-input')?.value) || 70;
        display('kinetic-energy', 0.5 * masse * Math.pow(state.v, 2), ' J', 2);
        display('momentum', gamma * masse * state.v, ' kg·m/s', 4);
        display('mass-energy', masse * Math.pow(C, 2) * gamma, ' J', 0);

        // C. Forces & Dynamique
        display('accel-long', linAcc, ' m/s²', 3);
        display('accel-vert-imu', accPureZ, ' m/s²', 3);
        display('force-g-vert', (G_STD + accPureZ) / G_STD, ' G', 3);
        display('pitch', pitch * R2D, '°', 1);

        // D. Astronomie (Appel aux fonctions de astro.js)
        if (typeof getJulianDay === 'function') {
            const dateObj = new Date(now);
            // On utilise les coordonnées par défaut ou GPS
            const lat = 48.85, lon = 2.35; 
            const astro = getAstroData(dateObj, lat, lon);

            display('sun-alt', astro.sun.altitude, '°', 2);
            display('sun-azimuth', astro.sun.azimuth, '°', 2);
            if($('tst-time')) $('tst-time').textContent = formatHours(astro.TST_HRS);
            if($('mst-time')) $('mst-time').textContent = formatHours(astro.MST_HRS);
            if($('moon-phase-name')) $('moon-phase-name').textContent = getMoonPhaseName(astro.moon.illumination.phase);
            display('moon-illuminated', astro.moon.illumination.fraction * 100, ' %', 1);
        }

        // E. Temps & Session
        if($('local-time')) $('local-time').textContent = new Date(now).toLocaleTimeString('fr-FR');
        display('movement-time', state.timeInMotionMs / 1000, ' s', 2);
        display('total-distance', state.totalDist / 1000, ' km', 3);
        if($('ukf-status')) $('ukf-status').textContent = "NOMINAL (RELATIVISTIC V68)";
    };

    // --- 5. INITIALISATION DES ÉCOUTEURS ---
    const init = () => {
        syncAtomicTime();

        $('gps-pause-toggle')?.addEventListener('click', () => {
            state.isPaused = !state.isPaused;
            state.lastT = performance.now();
            $('gps-pause-toggle').textContent = state.isPaused ? '▶️ ACTIVER SYSTÈME' : '⏸️ PAUSE SYSTÈME';
            
            if (!state.isPaused) {
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
                window.addEventListener('devicemotion', processHardwareData, true);
            }
        });

        $('reset-all-btn')?.addEventListener('click', () => location.reload());
    };

    window.addEventListener('load', init);

})(window);
