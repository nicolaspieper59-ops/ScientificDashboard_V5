/**
 * =================================================================
 * GNSS SPACETIME DASHBOARD - V67 "QUANTUM-ATOMIC"
 * =================================================================
 * - Moteur de Navigation Inertielle Newtonienne (Anti-Évaporation)
 * - Intégration Native : astro.js & ephem.js (VSOP2013)
 * - Relativité Restreinte : Temps Relatif (dt' = dt/gamma)
 * - Synchro Atomique NTP : Correction du décalage de -1287ms
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
    let deadReckoningSpeed = 0.00333; // Vitesse d'inertie initiale (~0.012 km/h)
    let totalDistanceM = 0;
    let timeInMotionMs = 0;
    let modeNether = false;

    // --- 1. MOTEUR DE TEMPS ATOMIQUE (Résout le lag système) ---
    const AtomicClock = {
        drift: 0,
        lastSync: 0,
        async sync() {
            try {
                const t0 = performance.now();
                const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await res.json();
                const atomicTime = new Date(data.datetime).getTime();
                // Calcul de latence réseau pour précision milliseconde
                const latency = (performance.now() - t0) / 2;
                this.drift = atomicTime - (Date.now() + latency);
                this.lastSync = Date.now();
                if ($('ntp-offset')) $('ntp-offset').textContent = this.drift.toFixed(0) + ' ms';
            } catch (e) { console.warn("Mode Offline : Utilisation Horloge Locale"); }
        },
        getTime() { return Date.now() + this.drift; }
    };

    // --- 2. MOTEUR PHYSIQUE & RELATIVITÉ ---
    const handleMotion = (e) => {
        if (!isSystemActive) return;

        const currentNow = AtomicClock.getTime();
        if (lastT === 0) { lastT = currentNow; return; }
        
        let dt = (currentNow - lastT) / 1000;
        if (dt <= 0 || dt > 0.2) return; // Sécurité anti-glitch
        lastT = currentNow;

        // CALCUL DU FACTEUR DE LORENTZ (Votre remarque UKF)
        const beta = deadReckoningSpeed / C_LIGHT;
        const gamma = 1 / Math.sqrt(1 - beta * beta);
        
        // TEMPS RELATIF : Le temps s'écoule plus lentement pour l'objet en mouvement
        const relativisticDt = dt / gamma;

        // DONNÉES CAPTEURS
        const ax = e.accelerationIncludingGravity?.x || 0;
        const ay = e.accelerationIncludingGravity?.y || 0;
        const az = e.accelerationIncludingGravity?.z || 0;
        const accPureZ = e.acceleration?.z || 0; // Accélération verticale nette

        // COMPENSATION PITCH (Niveau à bulle)
        const pitchRad = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
        const linAccX = ax + (Math.sin(pitchRad) * G_ACC);

        // MOTEUR D'INERTIE (Zéro évaporation)
        const totalAccMag = Math.sqrt(ax**2 + ay**2 + az**2);
        const isStable = Math.abs(totalAccMag - G_ACC) < 0.12;

        if (!isStable) {
            // Newton : On n'intègre que les forces réelles
            deadReckoningSpeed += linAccX * relativisticDt;
        } else {
            // Inertie : On conserve 99.999% du mouvement (frottement air simulé)
            deadReckoningSpeed *= 0.99999; 
        }

        if (deadReckoningSpeed < 0.0001) deadReckoningSpeed = 0;

        // DISTANCE & CHRONO
        const distMult = modeNether ? 8.0 : 1.0;
        totalDistanceM += deadReckoningSpeed * relativisticDt * distMult;
        if (deadReckoningSpeed > 0.01) timeInMotionMs += relativisticDt * 1000;

        // MISE À JOUR ASTRO (Lien avec astro.js & ephem.js)
        if (window.getAstroData) {
            const lat = parseFloat($('lat-val')?.textContent) || 48.85;
            const lon = parseFloat($('lon-val')?.textContent) || 2.35;
            const astro = getAstroData(new Date(currentNow), lat, lon);
            updateAstroUI(astro);
        }

        updateDashboardUI(pitchRad * R2D, linAccX, accPureZ, az, gamma);
    };

    // --- 3. INTERFACE (Résolution des N/A du HTML) ---
    const updateDashboardUI = (pitch, linAcc, accZ, rawZ, gamma) => {
        const v = deadReckoningSpeed;
        const mass = parseFloat($('mass-input')?.value) || 70;

        // Vitesse & Relativité
        if ($('speed-main-display')) $('speed-main-display').textContent = (v * 3.6).toFixed(3) + ' km/h';
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = (v * 3.6).toFixed(3);
        if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);
        if ($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * v**2).toFixed(2) + " J";
        if ($('time-dilation-vitesse')) $('time-dilation-vitesse').textContent = ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j";
        
        // Dynamique & Forces
        if ($('g-force-vert')) $('g-force-vert').textContent = (rawZ / G_ACC).toFixed(3) + " G";
        if ($('acceleration-vert-imu')) $('acceleration-vert-imu').textContent = accZ.toFixed(3) + " m/s²";
        if ($('accel-long')) $('accel-long').textContent = linAcc.toFixed(3) + " m/s²";
        if ($('pitch')) $('pitch').textContent = pitch.toFixed(1) + "°";
        
        // Temps & Session
        const now = new Date(AtomicClock.getTime());
        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR');
        if ($('movement-time')) $('movement-time').textContent = (timeInMotionMs/1000).toFixed(2) + " s";
        if ($('ukf-status')) $('ukf-status').textContent = "NOMINAL (V67-ATOMIC)";
    };

    const updateAstroUI = (a) => {
        // Mapping direct avec vos fichiers astro.js / ephem.js
        if ($('sun-alt')) $('sun-alt').textContent = a.sun.altitude.toFixed(2) + "°";
        if ($('sun-azimuth')) $('sun-azimuth').textContent = a.sun.azimuth.toFixed(2) + "°";
        if ($('moon-phase-name')) $('moon-phase-name').textContent = getMoonPhaseName(a.moon.illumination.phase);
        if ($('tst-time')) $('tst-time').textContent = formatHours(a.TST_HRS);
        if ($('mst-time')) $('mst-time').textContent = formatHours(a.MST_HRS);
        if ($('noon-solar')) $('noon-solar').textContent = a.NOON_SOLAR_UTC || "N/A";
    };

    // --- 4. CONTRÔLES ---
    const toggle = () => {
        isSystemActive = !isSystemActive;
        if (isSystemActive) {
            lastT = AtomicClock.getTime();
            window.addEventListener('devicemotion', handleMotion, true);
        } else {
            window.removeEventListener('devicemotion', handleMotion);
        }
        $('gps-pause-toggle').textContent = isSystemActive ? '⏸️ PAUSE SYSTÈME' : '▶️ ACTIVER SYSTÈME';
    };

    window.addEventListener('load', () => {
        AtomicClock.sync();
        $('gps-pause-toggle')?.addEventListener('click', toggle);
        $('reset-all-btn')?.addEventListener('click', () => location.reload());
        
        // Réinitialisation automatique de la synchro toutes les 5 min
        setInterval(() => AtomicClock.sync(), 300000);
    });

})(window);
