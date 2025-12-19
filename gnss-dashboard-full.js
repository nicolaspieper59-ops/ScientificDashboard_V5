/**
 * GNSS SPACETIME DASHBOARD - V66 ATOMIC-RELATIVITY
 * Intègre astro.js, ephem.js et la dilatation temporelle réelle.
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458; 
    const G_STD = 9.80665;
    const R2D = 180 / Math.PI;

    // --- MOTEUR TEMPOREL ATOMIQUE ---
    const AtomicClock = {
        drift: 0,
        lastSync: 0,
        async sync() {
            try {
                const start = performance.now();
                // Utilisation de WorldTimeAPI pour la synchro atomique
                const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await response.json();
                const atomicTime = new Date(data.datetime).getTime();
                const latency = (performance.now() - start) / 2;
                this.drift = atomicTime - (Date.now() + latency);
                this.lastSync = Date.now();
                if ($('ntp-offset')) $('ntp-offset').textContent = this.drift.toFixed(0) + ' ms';
                console.log("✅ Synchro Atomique Réussie");
            } catch (e) { console.error("❌ Échec Synchro"); }
        },
        getTime() { return Date.now() + this.drift; }
    };

    let state = {
        v: 0, // Vitesse m/s
        lastUpdate: 0,
        dist: 0
    };

    const updatePhysics = (e) => {
        const now = AtomicClock.getTime();
        if (state.lastUpdate === 0) { state.lastUpdate = now; return; }

        // 1. CALCUL DU TEMPS RELATIF (DT RELATIVISTE)
        let dtReal = (now - state.lastUpdate) / 1000;
        state.lastUpdate = now;

        const beta = state.v / C;
        const gamma = 1 / Math.sqrt(1 - beta * beta);
        
        // Le temps propre (celui de l'objet) ralentit avec la vitesse
        const dtRelativistic = dtReal / gamma;

        // 2. CAPTEURS & INERTIE (SANS ÉVAPORATION)
        const ax = e.accelerationIncludingGravity?.x || 0;
        const az = e.accelerationIncludingGravity?.z || 0;
        const accPureZ = e.acceleration?.z || 0;

        // Compensation inclinaison (Pitch)
        const pitch = Math.atan2(-ax, Math.sqrt(Math.pow(0,2) + Math.pow(az,2)));
        const linAcc = ax + (Math.sin(pitch) * G_STD);

        // Intégration Newtonienne (Inertie préservée)
        if (Math.abs(linAcc) > 0.01) { 
            state.v += linAcc * dtRelativistic; 
        } else {
            state.v *= 0.99999; // Conservation quasi-totale du mouvement
        }

        // 3. MISE À JOUR ASTRO (via vos fichiers astro.js / ephem.js)
        if (window.getJulianDay) {
            const date = new Date(now);
            const lat = 48.85, lon = 2.35; // À lier au GPS
            const astro = getAstroData(date, lat, lon); // Fonction de votre astro.js
            
            if ($('sun-alt')) $('sun-alt').textContent = astro.sun.altitude.toFixed(2) + "°";
            if ($('tst-time')) $('tst-time').textContent = formatHours(astro.TST_HRS);
        }

        // 4. RÉSOLUTION DES N/A DYNAMIQUE
        const speedKmh = state.v * 3.6;
        if ($('speed-main-display')) $('speed-main-display').textContent = speedKmh.toFixed(3) + " km/h";
        if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(10);
        if ($('g-force-vert')) $('g-force-vert').textContent = (az / G_STD).toFixed(3) + " G";
        if ($('acceleration-vert-imu')) $('acceleration-vert-imu').textContent = accPureZ.toFixed(3) + " m/s²";
        
        // Énergies
        const mass = 70;
        if ($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * state.v**2).toFixed(2) + " J";
        if ($('rest-mass-energy')) $('rest-mass-energy').textContent = (mass * Math.pow(C, 2)).toExponential(2) + " J";
    };

    // Initialisation
    window.addEventListener('load', () => {
        AtomicClock.sync();
        window.addEventListener('devicemotion', updatePhysics, true);
        $('gps-pause-toggle')?.addEventListener('click', () => AtomicClock.sync());
    });

})(window);
