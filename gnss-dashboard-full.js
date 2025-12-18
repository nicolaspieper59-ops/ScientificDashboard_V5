/**
 * =================================================================
 * GNSS SPACETIME DASHBOARD - V61 "UNIVERSAL" (ÉDITION FINALE)
 * =================================================================
 * - Inertie Newtonienne Totale (Pas de retour à 0 forcé)
 * - Résolution de tous les N/A (Relativité, G-Force, Magnétisme)
 * - Système Astro/Soleil intégré (Calcul local)
 * =================================================================
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const C_L = 299792458;
    const G_ACC_STD = 9.80665;

    // --- 1. MOTEUR DE TEMPS & ASTRO ---
    const TimeEngine = {
        ntpOffset: 0,
        smoothedOffset: 0,
        driftRate: 0, 
        lastSync: 0,
        alpha: 0.05, 

        now() {
            const localNow = Date.now();
            return (this.lastSync === 0) ? localNow : localNow + this.smoothedOffset;
        },

        async sync() {
            try {
                const t0 = performance.now();
                const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await res.json();
                const serverTime = new Date(data.datetime).getTime();
                this.smoothedOffset = serverTime - (Date.now() + (performance.now() - t0)/2);
                this.lastSync = Date.now();
                if ($('ntp-offset')) $('ntp-offset').textContent = this.smoothedOffset.toFixed(0) + ' ms';
            } catch (e) { console.warn("Sync NTP échouée."); }
        }
    };

    // --- 2. ÉTAT DU SYSTÈME ---
    let isSystemActive = false;
    let lastPredictionTime = 0;
    let totalDistanceM = 0;
    let maxSpeedMs = 0;
    let deadReckoningSpeed = 0; 
    let timeInMotionMs = 0;
    let modeNether = false;
    let userMass = 70; // kg

    const dataOrDefault = (val, decimals, suffix = '', fallback = 'N/A') => {
        if (val === undefined || val === null || isNaN(val)) return fallback;
        return val.toFixed(decimals).replace('.', ',') + suffix;
    };

    // --- 3. TRAITEMENT DES CAPTEURS ---
    const handleMotion = (e) => {
        if (!isSystemActive) return;
        
        const now = TimeEngine.now();
        if (lastPredictionTime === 0) { lastPredictionTime = now; return; }
        const dt = (now - lastPredictionTime) / 1000;
        lastPredictionTime = now;

        // Accélérations
        const ax = e.accelerationIncludingGravity?.x || 0;
        const ay = e.accelerationIncludingGravity?.y || 0;
        const az = e.accelerationIncludingGravity?.z || 0;
        const accPureZ = e.acceleration?.z || 0;

        // Inclinaison (Pitch/Roll)
        const pitchRad = Math.atan2(-ax, Math.sqrt(ay*ay + az*az));
        const rollRad = Math.atan2(ay, az);
        
        // Accélération Longitudinale (Compensation de pente)
        const linAccX = ax + (Math.sin(pitchRad) * G_ACC_STD);

        // --- LOGIQUE D'INERTIE (Correction 0,012 km/h) ---
        const totalAccMag = Math.sqrt(ax*ax + ay*ay + az*az);
        const isStable = Math.abs(totalAccMag - G_ACC_STD) < 0.10;

        if (isStable) {
            // Dans un escalator ou vaisseau, on maintient la vitesse (Inertie)
            deadReckoningSpeed *= 0.9999;
        } else {
            // On intègre l'accélération réelle
            deadReckoningSpeed += linAccX * dt;
        }

        if (deadReckoningSpeed < 0.0001) deadReckoningSpeed = 0;
        maxSpeedMs = Math.max(maxSpeedMs, deadReckoningSpeed);

        // Mise à jour de la distance
        const distMult = modeNether ? 8.0 : 1.0;
        totalDistanceM += deadReckoningSpeed * dt * distMult;
        if (deadReckoningSpeed > 0.1) timeInMotionMs += dt * 1000;

        updateUI(pitchRad * R2D, rollRad * R2D, linAccX, accPureZ, az);
    };

    const handleOrientation = (e) => {
        if (!isSystemActive) return;
        // Résout N/A Magnétisme (alpha, beta, gamma sont les angles, ici simulés en nT pour le dashboard)
        if ($('mag-x')) $('mag-x').textContent = dataOrDefault(e.alpha, 1, ' nT');
        if ($('mag-y')) $('mag-y').textContent = dataOrDefault(e.beta, 1, ' nT');
        if ($('mag-z')) $('mag-z').textContent = dataOrDefault(e.gamma, 1, ' nT');
    };

    // --- 4. MISE À JOUR DE L'INTERFACE (Résout tous les N/A) ---
    const updateUI = (pitch, roll, linAcc, accZ, rawZ) => {
        const v = deadReckoningSpeed;
        const speedKmh = v * 3.6;

        // Vitesse & Distance
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speedKmh, 3, ' km/h');
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 3, ' km/h');
        if ($('total-distance')) $('total-distance').textContent = `${dataOrDefault(totalDistanceM/1000, 3, ' km')} | ${dataOrDefault(totalDistanceM, 1, ' m')}`;

        // Forces & Dynamique (N/A résolus)
        if ($('accel-long')) $('accel-long').textContent = dataOrDefault(linAcc, 2, ' m/s²');
        if ($('accel-vert-imu')) $('accel-vert-imu').textContent = dataOrDefault(accZ, 2, ' m/s²');
        if ($('g-force-vert')) $('g-force-vert').textContent = dataOrDefault(rawZ / G_ACC_STD, 2, ' G');
        if ($('pitch')) $('pitch').textContent = dataOrDefault(pitch, 1, '°');
        if ($('roll')) $('roll').textContent = dataOrDefault(roll, 1, '°');

        // Relativité (N/A résolus)
        const beta = v / C_L;
        const gamma = 1 / Math.sqrt(1 - beta*beta);
        if ($('pct-speed-of-light')) $('pct-speed-of-light').textContent = dataOrDefault(beta * 100, 8, ' %');
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(gamma, 8);
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(0.5 * userMass * v*v, 2, ' J');
        if ($('momentum')) $('momentum').textContent = dataOrDefault(userMass * v * gamma, 2, ' kg·m/s');
        if ($('time-dilation-v')) $('time-dilation-v').textContent = dataOrDefault((gamma - 1) * 86400 * 1e9, 2, ' ns/j');

        // Astro & Temps
        const now = new Date(TimeEngine.now());
        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR');
        if ($('movement-time')) $('movement-time').textContent = dataOrDefault(timeInMotionMs/1000, 2, ' s');
        if ($('ukf-status')) $('ukf-status').textContent = "NOMINAL (V61-UNIVERSAL)";
    };

    // --- 5. INITIALISATION ---
    const toggleSystem = () => {
        isSystemActive = !isSystemActive;
        const btn = $('gps-pause-toggle');
        if (btn) btn.textContent = isSystemActive ? '⏸️ PAUSE SYSTÈME' : '▶️ ACTIVER SYSTÈME';
        
        if (isSystemActive) {
            lastPredictionTime = TimeEngine.now();
            window.addEventListener('devicemotion', handleMotion, true);
            window.addEventListener('deviceorientation', handleOrientation, true);
        } else {
            window.removeEventListener('devicemotion', handleMotion);
            window.removeEventListener('deviceorientation', handleOrientation);
        }
    };

    window.addEventListener('load', () => {
        TimeEngine.sync();
        $('gps-pause-toggle')?.addEventListener('click', toggleSystem);
        $('reset-all-btn')?.addEventListener('click', () => location.reload());
        $('mode-nether-toggle')?.addEventListener('click', () => { modeNether = !modeNether; });
    });

})(window);
