/**
 * GNSS SpaceTime Dashboard - ENGINE CORE v4.0 (Professional Edition)
 * Fusion UKF 21-États + VSOP2013 + Relativité Einsteinienne
 * REQUIS : math.min.js, ephem.js, ukf-lib.js
 */

(function() {
    "use strict";

    // --- CONSTANTES PHYSIQUES ---
    const C = 299792458; // Vitesse lumière (m/s)
    const G = 6.67430e-11; // Constante gravitationnelle
    const M_EARTH = 5.972e24; // Masse Terre (kg)
    const R_EARTH = 6371000; // Rayon Terre (m)

    // --- ÉTAT DU MOTEUR ---
    let engine = {
        isRunning: false,
        startTime: Date.now(),
        lastTick: performance.now(),
        utcOffset: 0,
        mass: 70,
        totalDistance: 0,
        vMax: 0,
        ukf: null // Instance du filtre ProfessionalUKF
    };

    /**
     * INITIALISATION
     */
    async function init() {
        console.log("🚀 Lancement du Moteur UKF-21...");
        
        // 1. Synchronisation Temps Atomique via API
        await syncAtomicTime();

        // 2. Initialisation du filtre de Kalman (via ukf-lib.js et math.js)
        if (typeof ProfessionalUKF !== 'undefined') {
            engine.ukf = new ProfessionalUKF();
        } else {
            console.error("❌ Librairie ukf-lib.js manquante !");
            updateUI('filter-status', "ERREUR LIB");
            return;
        }

        setupControls();
        requestAnimationFrame(mainLoop);
    }

    /**
     * SYNCHRONISATION GMT / UTC (Précision Astro)
     */
    async function syncAtomicTime() {
        try {
            const start = performance.now();
            const resp = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await resp.json();
            const latency = (performance.now() - start) / 2;
            engine.utcOffset = new Date(data.utc_datetime).getTime() - (Date.now() - latency);
            updateUI('clock-accuracy', `±${latency.toFixed(0)}ms`);
        } catch (e) {
            updateUI('clock-accuracy', 'Locale (Offline)');
        }
    }

    /**
     * BOUCLE SCIENTIFIQUE (Haute Fréquence)
     */
    function mainLoop(now) {
        const dt = (now - engine.lastTick) / 1000;
        engine.lastTick = now;

        if (engine.isRunning && engine.ukf) {
            // A. TEMPS ET ÉPHÉMÉRIDES
            const exactNow = new Date(Date.now() + engine.utcOffset);
            const jd = (exactNow.getTime() / 86400000) + 2440587.5;

            // B. PRÉDICTION DU FILTRE (math.js interne)
            engine.ukf.predict(dt);
            const state = engine.ukf.getState(); // Position, Vitesse, Accel filtrées

            // C. PHYSIQUE & RELATIVITÉ
            const v = state.velocity; // m/s
            const alt = state.altitude;
            
            // Lorentz & Temps
            const beta = v / C;
            const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
            const timeDilation = (gamma - 1) * 1e9; // nanosecondes par seconde

            // Aérodynamique (Densité de l'air dynamique)
            const rho = 1.225 * Math.pow(1 - 0.0065 * alt / 288.15, 5.255);
            const mach = v / (331.3 * Math.sqrt(1 + (15 - 0.0065 * alt) / 273.15));
            const dynPressure = 0.5 * rho * Math.pow(v, 2);
            const dragForce = dynPressure * 0.47 * 0.5; // Coeff standard sphère

            // D. ASTRONOMIE VSOP2013 (ephem.js)
            const astro = (typeof VSOP2013 !== 'undefined') ? 
                          VSOP2013.getPositions(jd, state.lat, state.lon) : null;

            // E. MISE À JOUR DE L'INTERFACE (DOM)
            refreshDashboard(exactNow, jd, state, gamma, mach, rho, dragForce, astro);
        }
        requestAnimationFrame(mainLoop);
    }

    /**
     * RENDU DES DONNÉES (Liaison avec vos IDs HTML)
     */
    function refreshDashboard(time, jd, state, gamma, mach, rho, drag, astro) {
        // Temps & Session
        updateUI('gmt-time-display', time.toISOString().split('T')[1].slice(0, 12));
        updateUI('julian-date', jd.toFixed(7));
        updateUI('session-time', ((Date.now() - engine.startTime)/1000).toFixed(2) + "s");

        // Navigation (Centre)
        updateUI('speed-main-display', (state.velocity * 3.6).toFixed(2));
        updateUI('alt-display', state.altitude.toFixed(2) + " m");
        updateUI('vel-z', state.velZ.toFixed(2) + " m/s");
        updateUI('total-distance-3d', (engine.ukf.distance / 1000).toFixed(5) + " km");

        // Physique & Relativité
        updateUI('mach-number', mach.toFixed(5));
        updateUI('lorentz-factor', gamma.toFixed(10));
        updateUI('time-dilation', timeDilation.toFixed(4) + " ns/s");
        updateUI('air-density', rho.toFixed(4) + " kg/m³");
        updateUI('drag-force', drag.toFixed(2) + " N");
        updateUI('kinetic-energy', (0.5 * engine.mass * Math.pow(state.velocity, 2)).toExponential(2) + " J");

        // Astronomie
        if (astro) {
            updateUI('tslv', astro.tslv.toFixed(6));
            updateUI('sun-alt', astro.sunAlt.toFixed(2) + "°");
            updateUI('moon-distance', Math.round(astro.moonDist).toLocaleString() + " km");
            updateUI('moon-phase-name', astro.phaseName);
        }

        // Status
        updateUI('filter-status', "ACTIF (UKF-21)");
        document.getElementById('filter-status').className = "status-active";
    }

    /**
     * GESTION DES CAPTEURS RÉELS (GPS / IMU)
     */
    function setupControls() {
        const btn = document.getElementById('gps-pause-toggle');
        
        btn.addEventListener('click', async () => {
            if (!engine.isRunning) {
                // Demande de permissions (iOS/Android)
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }

                // Activation Géolocalisation Haute Précision
                navigator.geolocation.watchPosition(
                    (pos) => engine.ukf.observeGPS(pos),
                    (err) => console.error("GPS Error:", err),
                    { enableHighAccuracy: true, maximumAge: 0 }
                );

                // Activation Accéléromètre
                window.addEventListener('devicemotion', (e) => {
                    engine.ukf.observeIMU(e.accelerationIncludingGravity);
                });

                engine.isRunning = true;
                btn.textContent = "⏸️ STOP ENGINE";
                btn.style.background = "#3a1a1a";
            } else {
                engine.isRunning = false;
                btn.textContent = "▶️ START ENGINE";
                btn.style.background = "#1a2e1a";
                updateUI('filter-status', "PAUSE");
            }
        });

        // Masse dynamique
        document.getElementById('mass-input').addEventListener('change', (e) => {
            engine.mass = parseFloat(e.target.value) || 70;
        });
    }

    function updateUI(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);

})();
