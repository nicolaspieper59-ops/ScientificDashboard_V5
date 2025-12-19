/**
 * =================================================================
 * GNSS SPACETIME DASHBOARD - V65 "GALILEO-INERTIAL"
 * =================================================================
 * - Intégration Native : astro.js & ephem.js
 * - Moteur Physique : Inertie Newtonienne (Anti-ZUPT)
 * - Temps Relatif : dt' = dt / gamma (Calculé en mouvement)
 * =================================================================
 */

((window) => {
    "use strict";

    // --- CONSTANTES ---
    const $ = id => document.getElementById(id);
    const C_LIGHT = 299792458;
    const G_ACC = 9.80665;
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;

    // --- ÉTAT DU SYSTÈME ---
    let isSystemActive = false;
    let lastT = 0;
    let deadReckoningSpeed = 0.00333; // Start à 0.012 km/h
    let totalDistanceM = 0;
    let timeInMotionMs = 0;
    let modeNether = false;

    // --- MODULE DE TEMPS STABILISÉ (TimeEngine) ---
    const TimeEngine = {
        offset: 0,
        now() { return Date.now() + this.offset; },
        async sync() {
            try {
                const t0 = performance.now();
                const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await res.json();
                this.offset = new Date(data.datetime).getTime() - (Date.now() + (performance.now() - t0)/2);
                if($('ntp-offset')) $('ntp-offset').textContent = this.offset.toFixed(0) + ' ms';
            } catch (e) { console.warn("Sync NTP Offline."); }
        }
    };

    // --- MOTEUR DE NAVIGATION & RELATIVITÉ ---
    const handleMotion = (e) => {
        if (!isSystemActive) return;

        const currentNow = TimeEngine.now();
        if (lastT === 0) { lastT = currentNow; return; }
        
        let dt = (currentNow - lastT) / 1000;
        if (dt <= 0 || dt > 0.2) return;
        lastT = currentNow;

        // 1. CALCUL DU FACTEUR DE LORENTZ (Temps Relatif)
        const beta = deadReckoningSpeed / C_LIGHT;
        const gamma = 1 / Math.sqrt(1 - beta * beta);
        const relativisticDt = dt / gamma; // Dilatation temporelle propre

        // 2. CAPTEURS IMU (Accéléromètre/Gyro)
        const ax = e.accelerationIncludingGravity?.x || 0;
        const ay = e.accelerationIncludingGravity?.y || 0;
        const az = e.accelerationIncludingGravity?.z || 0;
        const accPureZ = e.acceleration?.z || 0;

        // 3. COMPENSATION PITCH (Niveau à bulle)
        const pitchRad = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
        const linAccX = ax + (Math.sin(pitchRad) * G_ACC);

        // 4. MOTEUR D'INERTIE (Suppression de l'évaporation vers 0)
        const totalAccMag = Math.sqrt(ax**2 + ay**2 + az**2);
        const isStable = Math.abs(totalAccMag - G_ACC) < 0.12;

        if (!isStable) {
            // Newton : On n'intègre que si une force réelle est détectée
            deadReckoningSpeed += linAccX * relativisticDt;
        } else {
            // Inertie pure : conservation du mouvement (frottement spatial négligeable)
            deadReckoningSpeed *= 0.99999; 
        }

        if (deadReckoningSpeed < 0.0001) deadReckoningSpeed = 0;

        // Distance & Chrono
        const distMult = modeNether ? 8.0 : 1.0;
        totalDistanceM += deadReckoningSpeed * relativisticDt * distMult;
        if (deadReckoningSpeed > 0.01) timeInMotionMs += relativisticDt * 1000;

        // 5. MISE À JOUR ASTRO (Via astro.js & ephem.js)
        if (window.getAstroData) {
            // On récupère les coordonnées GPS du dashboard si dispo
            const lat = parseFloat($('lat-val')?.textContent) || 48.85;
            const lon = parseFloat($('lon-val')?.textContent) || 2.35;
            const astro = getAstroData(new Date(currentNow), lat, lon);
            updateAstroUI(astro);
        }

        updateDashboardUI(pitchRad * R2D, linAccX, accPureZ, az, gamma);
    };

    // --- INTERFACE (RÉSOLUTION DES N/A) ---
    const updateDashboardUI = (pitch, linAcc, accZ, rawZ, gamma) => {
        const v = deadReckoningSpeed;
        const mass = parseFloat($('mass-input')?.value) || 70;

        // Vitesse & Relativité
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = (v * 3.6).toFixed(3);
        if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(10);
        if ($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * v*v).toFixed(2) + " J";
        if ($('time-dilation-vitesse')) $('time-dilation-vitesse').textContent = ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j";
        if ($('pct-speed-of-light')) $('pct-speed-of-light').textContent = (beta * 100).toExponential(2) + " %";

        // Forces
        if ($('g-force-vert')) $('g-force-vert').textContent = (rawZ / G_ACC).toFixed(3) + " G";
        if ($('acceleration-vert-imu')) $('acceleration-vert-imu').textContent = accZ.toFixed(3) + " m/s²";
        if ($('pitch')) $('pitch').textContent = pitch.toFixed(1) + "°";
        
        // Chronos
        const now = new Date(TimeEngine.now());
        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR');
        if ($('movement-time')) $('movement-time').textContent = (timeInMotionMs/1000).toFixed(2) + " s";
    };

    const updateAstroUI = (a) => {
        // Mapping spécifique à votre fichier astro.js
        if ($('sun-alt')) $('sun-alt').textContent = a.sun.altitude.toFixed(2) + "°";
        if ($('sun-azimuth')) $('sun-azimuth').textContent = a.sun.azimuth.toFixed(2) + "°";
        if ($('moon-phase-name')) $('moon-phase-name').textContent = getMoonPhaseName(a.moon.illumination.phase);
        if ($('moon-illuminated')) $('moon-illuminated').textContent = (a.moon.illumination.fraction * 100).toFixed(1) + "%";
        if ($('tst-time')) $('tst-time').textContent = formatHours(a.TST_HRS);
        if ($('mst-time')) $('mst-time').textContent = formatHours(a.MST_HRS);
        if ($('noon-solar')) $('noon-solar').textContent = a.NOON_SOLAR_UTC || "N/A";
    };

    // --- CONTRÔLES ---
    const toggle = () => {
        isSystemActive = !isSystemActive;
        if (isSystemActive) {
            lastT = TimeEngine.now();
            window.addEventListener('devicemotion', handleMotion, true);
        } else {
            window.removeEventListener('devicemotion', handleMotion);
        }
        $('gps-pause-toggle').textContent = isSystemActive ? '⏸️ PAUSE SYSTÈME' : '▶️ ACTIVER SYSTÈME';
    };

    window.addEventListener('load', () => {
        TimeEngine.sync();
        $('gps-pause-toggle')?.addEventListener('click', toggle);
        $('reset-all-btn')?.addEventListener('click', () => location.reload());
    });

})(window);
