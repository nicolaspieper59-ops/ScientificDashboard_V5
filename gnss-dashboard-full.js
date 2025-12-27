/**
 * GNSS SpaceTime Dashboard - ENGINE CORE v4.0 (Professional Edition)
 * REQUIS : math.js, ephem.js (VSOP2013), ukf-lib.js
 */

(function() {
    "use strict";

    // --- CONSTANTES PHYSIQUES ---
    const C = 299792458; 
    const G = 6.67430e-11;
    const M_EARTH = 5.972e24;
    const R_EARTH = 6371000;

    let engineState = {
        isRunning: false,
        startTime: null,
        lastTick: null,
        utcOffset: 0,
        mass: 70,
        totalDistance: 0
    };

    /**
     * INITIALISATION DU SYSTÈME
     */
    async function init() {
        console.log("🚀 Moteur Pro UKF-21 : Démarrage du séquençage...");
        
        // Synchro Temps Atomique (NTP-like)
        await synchronizeTime();

        // Liaison avec l'instance ProfessionalUKF
        if (typeof ProfessionalUKF !== 'undefined') {
            window.MainEngine = new ProfessionalUKF();
        }

        setupEventListeners();
        requestAnimationFrame(coreLoop);
    }

    /**
     * SYNCHRONISATION GMT / UTC
     */
    async function synchronizeTime() {
        try {
            const t0 = performance.now();
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await response.json();
            const t1 = performance.now();
            const latency = (t1 - t0) / 2;
            engineState.utcOffset = new Date(data.utc_datetime).getTime() - (Date.now() - latency);
            updateField('clock-accuracy', `±${latency.toFixed(0)}ms`);
        } catch (e) {
            updateField('clock-accuracy', 'Locale (Offline)');
        }
    }

    /**
     * BOUCLE SCIENTIFIQUE PRINCIPALE (HAUTE FRÉQUENCE)
     */
    function coreLoop(timestamp) {
        if (!engineState.lastTick) engineState.lastTick = timestamp;
        const dt = (timestamp - engineState.lastTick) / 1000;
        engineState.lastTick = timestamp;

        if (engineState.isRunning && window.MainEngine) {
            // 1. CALCUL DU TEMPS ABSOLU
            const nowUTC = new Date(Date.now() + engineState.utcOffset);
            const jd = (nowUTC.getTime() / 86400000) + 2440587.5;

            // 2. MISE À JOUR DU FILTRE DE KALMAN (21 ÉTATS)
            // Fusionne : Position(3), Vitesse(3), Accel(3), Attitude(3), Biais(9)
            window.MainEngine.predict(dt);
            const state = window.MainEngine.getState(); // Vecteur d'état via math.js

            // 3. CALCULS RELATIVISTES & PHYSIQUE
            const v = state.velocity; // Norme de la vitesse (m/s)
            const alt = state.altitude;
            
            const beta = v / C;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            const mach = v / (331.3 * Math.sqrt(1 + (15 - 0.0065 * alt) / 273.15));
            
            // Densité de l'air (Modèle barométrique)
            const rho = 1.225 * Math.pow(1 - 0.0065 * alt / 288.15, 5.255);
            
            // 4. CALCULS ASTRONOMIQUES (VSOP2013)
            const astro = computeAstro(jd, state.lat, state.lon);

            // 5. MISE À JOUR DU DOM (INTERFACE)
            render(nowUTC, jd, state, gamma, mach, rho, astro);
        }

        requestAnimationFrame(coreLoop);
    }

    /**
     * FONCTION DE RENDU - Injection des IDs
     */
    function render(time, jd, state, gamma, mach, rho, astro) {
        // Temps
        updateField('gmt-time-display', time.toISOString().split('T')[1].slice(0, 12));
        updateField('julian-date', jd.toFixed(8));
        
        // Navigation
        updateField('speed-main-display', (state.velocity * 3.6).toFixed(2));
        updateField('alt-display', state.altitude.toFixed(2) + " m");
        updateField('vel-z', state.velZ.toFixed(2) + " m/s");
        updateField('total-distance-3d', (window.MainEngine.distance / 1000).toFixed(5) + " km");

        // Physique
        updateField('mach-number', mach.toFixed(5));
        updateField('lorentz-factor', gamma.toFixed(10));
        updateField('time-dilation', ((gamma - 1) * 1e9).toFixed(4) + " ns/s");
        updateField('air-density', rho.toFixed(4) + " kg/m³");
        updateField('drag-force', (0.5 * rho * state.velocity**2 * 0.47 * 0.5).toFixed(2) + " N");
        updateField('kinetic-energy', (0.5 * engineState.mass * state.velocity**2).toExponential(2) + " J");

        // Astro
        if (astro) {
            updateField('tslv', astro.tslv.toFixed(6));
            updateField('sun-pos', `${astro.sunAlt.toFixed(2)}° / ${astro.sunAz.toFixed(2)}°`);
            updateField('moon-distance', Math.round(astro.moonDist).toLocaleString() + " km");
        }

        // Filtre
        updateField('filter-status', "STABLE (UKF-21)");
    }

    /**
     * LOGIQUE DES CAPTEURS RÉELS
     */
    function setupEventListeners() {
        const btn = document.getElementById('gps-pause-toggle');
        btn.addEventListener('click', async () => {
            if (!engineState.isRunning) {
                // Déclenchement Capteurs (Real Data Only)
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }
                startSensors();
                engineState.isRunning = true;
                btn.textContent = "⏸️ STOP ENGINE";
            } else {
                engineState.isRunning = false;
                btn.textContent = "▶️ START ENGINE";
            }
        });

        document.getElementById('mass-input').addEventListener('change', (e) => {
            engineState.mass = parseFloat(e.target.value) || 70;
        });
    }

    function startSensors() {
        navigator.geolocation.watchPosition((pos) => {
            if (window.MainEngine) window.MainEngine.observeGPS(pos);
        }, null, { enableHighAccuracy: true });

        window.addEventListener('devicemotion', (e) => {
            if (window.MainEngine) window.MainEngine.observeIMU(e.accelerationIncludingGravity);
        });
    }

    function updateField(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function computeAstro(jd, lat, lon) {
        // Simulation de l'appel aux éphémérides VSOP2013
        if (typeof VSOP2013 === 'undefined') return null;
        return VSOP2013.getPositions(jd, lat, lon);
    }

    window.addEventListener('load', init);
})();
