/**
 * GNSS SpaceTime Dashboard - MOTEUR FINAL OPÉRATIONNEL
 * Version : Fusion Pro UKF 21-États & VSOP2013
 * Usage : Données réelles uniquement (No Simulation)
 */

(function() {
    "use strict";

    // --- CONFIGURATION ET VARIABLES D'ÉTAT ---
    let engine;
    let utcOffset = 0;
    let startTime = Date.now();
    let lastUpdate = Date.now();
    const C = 299792458; // m/s

    // Sécurité de mise à jour du DOM
    const updateUI = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    /**
     * 1. SYNCHRONISATION TEMPORELLE (NTP/GMT)
     * Pour une précision astronomique vs heure système potentiellement fausse
     */
    async function syncRealTime() {
        try {
            const startFetch = Date.now();
            const response = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC");
            const data = await response.json();
            const serverTime = new Date(data.utc_datetime).getTime();
            const latency = (Date.now() - startFetch) / 2;
            utcOffset = serverTime - (Date.now() - latency);
            updateUI('clock-accuracy', `± ${Math.abs(utcOffset).toFixed(0)}ms`);
            console.log("🕒 GMT Synchro terminée.");
        } catch (e) {
            console.warn("⚠️ Échec synchro GMT, utilisation heure locale.");
            updateUI('clock-accuracy', "Locale");
        }
    }

    /**
     * 2. INITIALISATION DES CAPTEURS ET DU MOTEUR
     */
    function init() {
        if (typeof ProfessionalUKF === 'undefined') {
            console.error("❌ Moteur UKF introuvable. Vérifiez ukf-lib.js");
            return;
        }

        engine = new ProfessionalUKF();
        syncRealTime();

        // Écouteur pour le bouton Start (Indispensable pour permissions capteurs iOS/Android)
        const btn = document.getElementById('gps-pause-toggle');
        if (btn) {
            btn.addEventListener('click', async () => {
                if (!engine.isRunning) {
                    // Demande de permission pour les capteurs sur mobile
                    if (DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    engine.start(); // Active la lecture GPS et IMU réelle
                    btn.textContent = "⏸️ STOP ENGINE";
                    btn.style.background = "#3a1a1a";
                } else {
                    engine.stop();
                    btn.textContent = "▶️ START ENGINE";
                    btn.style.background = "#2a2a35";
                }
            });
        }

        // Boucle de rendu (20Hz)
        requestAnimationFrame(processLoop);
    }

    /**
     * 3. BOUCLE DE TRAITEMENT PRINCIPALE
     */
    function processLoop() {
        const now = Date.now();
        const dt = (now - lastUpdate) / 1000;
        lastUpdate = now;

        if (engine && engine.isRunning) {
            // A. CALCUL DU TEMPS RÉEL (Synchro GMT)
            const exactNow = new Date(now + utcOffset);
            const jd = (exactNow.getTime() / 86400000) + 2440587.5; // Date Julienne

            // B. MISE À JOUR DU FILTRE UKF (Fusion Accel/GPS/Mag)
            // Le filtre traite ici les données réelles reçues par les API navigateurs
            engine.update(dt); 

            const state = engine.state; // Position, Vitesse, Accélération filtrées
            const velocityVec = state.vel;
            const speedMS = Math.sqrt(velocityVec.x**2 + velocityVec.y**2 + velocityVec.z**2);
            const altitude = engine.altitude || 0;

            // C. CALCULS PHYSIQUES RÉELS
            // Vitesse du son locale (selon altitude/température standard)
            const tempCelsius = 15 - (0.0065 * altitude);
            const speedSound = 331.3 * Math.sqrt(1 + tempCelsius / 273.15);
            const mach = speedMS / speedSound;

            // Relativité (Lorentz)
            const beta = speedMS / C;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            const timeDilation = (gamma - 1) * 1e9; // ns/s

            // Aéro (Traînée)
            const rho = 1.225 * Math.exp(-altitude / 8500); // Densité de l'air
            const dynamicPressure = 0.5 * rho * speedMS**2;
            const dragForce = dynamicPressure * engine.dragCoeff * engine.area;

            // D. CALCULS ASTRONOMIQUES (VSOP2013)
            const astro = engine.getAstroData ? engine.getAstroData(jd) : null;

            // E. MISE À JOUR DE L'INTERFACE (IDs demandés)
            updateUI('speed-main-display', (speedMS * 3.6).toFixed(2));
            updateUI('gmt-time-display', exactNow.toISOString().split('T')[1].replace('Z',''));
            updateUI('julian-date', jd.toFixed(6));
            updateUI('session-time', ((now - startTime)/1000).toFixed(2) + " s");

            updateUI('alt-display', altitude.toFixed(2) + " m");
            updateUI('vel-z', velocityVec.z.toFixed(2) + " m/s");
            updateUI('total-distance-3d', (engine.totalDistance / 1000).toFixed(4) + " km");

            updateUI('mach-number', mach.toFixed(4));
            updateUI('lorentz-factor', gamma.toFixed(9));
            updateUI('time-dilation', timeDilation.toFixed(4) + " ns/s");
            updateUI('air-density', rho.toFixed(4) + " kg/m³");
            updateUI('dyn-pressure', dynamicPressure.toFixed(2) + " Pa");
            updateUI('drag-force', dragForce.toFixed(2) + " N");
            updateUI('kinetic-energy', (0.5 * engine.mass * speedMS**2).toLocaleString() + " J");

            if (astro) {
                updateUI('tslv', astro.tslv.toFixed(4) + " h");
                updateUI('moon-distance', Math.round(astro.moonDist).toLocaleString() + " km");
                updateUI('sun-alt', astro.sunAlt.toFixed(2) + "°");
            }

            updateUI('filter-status', "ACTIF (UKF 21-E)");
            document.getElementById('filter-status').className = "status-active";
        }

        requestAnimationFrame(processLoop);
    }

    // Lancement
    window.addEventListener('load', init);

})();
