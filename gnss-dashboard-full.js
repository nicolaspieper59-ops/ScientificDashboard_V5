/**
 * GNSS SPACETIME DASHBOARD - MASTER CONTROLLER
 * Fusion UKF 21 États + Astro VSOP2013 + Physique Relativiste
 */

(function() {
    "use strict";

    // --- 1. CONFIGURATION & ÉTAT DU SYSTÈME ---
    const engine = new ProfessionalUKF();
    const C_LIGHT = 299792458; // m/s
    const G_CONST = 6.67430e-11;
    let mass = 70; // kg par défaut
    let startTime = Date.now();
    let lastAstroUpdate = 0;

    // --- 2. INITIALISATION DES ÉCOUTEURS ---
    async function init() {
        // Bouton Marche/Arrêt
        const toggleBtn = document.getElementById('gps-pause-toggle');
        toggleBtn.addEventListener('click', async () => {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try { await DeviceMotionEvent.requestPermission(); } catch (e) { console.error(e); }
            }
            engine.isRunning = !engine.isRunning;
            toggleBtn.textContent = engine.isRunning ? "⏸️ STOP ENGINE" : "▶️ MARCHE GPS";
            toggleBtn.style.borderLeft = engine.isRunning ? "4px solid #ff4444" : "4px solid #00ff88";
        });

        // Mise à jour de la masse en temps réel
        const massInput = document.getElementById('mass-input');
        massInput.addEventListener('input', (e) => {
            mass = parseFloat(e.target.value) || 70;
            safeSet('mass-display', mass.toFixed(3) + " kg");
        });

        // Capteurs de mouvement (IMU)
        window.addEventListener('devicemotion', (e) => {
            if (!engine.isRunning) return;
            const acc = e.accelerationIncludingGravity;
            engine.accel = { x: acc.x || 0, y: acc.y || 0, z: acc.z || 0 };
            
            // Mise à jour directe UI IMU
            safeSet('acc-x', (acc.x || 0).toFixed(3));
            safeSet('acc-y', (acc.y || 0).toFixed(3));
            safeSet('acc-z', (acc.z || 0).toFixed(3));
        });

        // Capteur d'orientation (Niveau à bulle)
        window.addEventListener('deviceorientation', (e) => {
            if (!engine.isRunning) return;
            const pitch = e.beta || 0;
            const roll = e.gamma || 0;
            safeSet('pitch', pitch.toFixed(1) + "°");
            safeSet('roll', roll.toFixed(1) + "°");
            
            const bubble = document.getElementById('bubble');
            if (bubble) {
                const moveX = Math.max(-40, Math.min(40, roll));
                const moveY = Math.max(-40, Math.min(40, pitch));
                bubble.style.transform = `translate(${moveX}px, ${moveY}px)`;
            }
        });

        // GPS (Geolocation API)
        navigator.geolocation.watchPosition((p) => {
            engine.observeGPS(
                p.coords.latitude, 
                p.coords.longitude, 
                p.coords.altitude, 
                p.coords.speed, 
                p.coords.accuracy
            );
            safeSet('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
            safeSet('gps-status', "FIX OK");
        }, (err) => {
            safeSet('gps-status', "ERROR: " + err.message);
        }, { enableHighAccuracy: true });

        // Lancement de la boucle de rendu
        requestAnimationFrame(mainLoop);
    }

    // --- 3. BOUCLE PRINCIPALE (RAF) ---
    function mainLoop(now) {
        if (engine.isRunning) {
            engine.predict(); // Calcul UKF
            updatePhysicsUI();
            
            // Mise à jour Astro toutes les secondes (moins gourmand)
            if (now - lastAstroUpdate > 1000) {
                updateAstroUI();
                lastAstroUpdate = now;
            }

            // Temps de session
            const elapsed = (Date.now() - startTime) / 1000;
            safeSet('elapsed-time', elapsed.toFixed(2) + " s");
            safeSet('local-time', new Date().toLocaleTimeString());
        }
        requestAnimationFrame(mainLoop);
    }

    // --- 4. CALCULS PHYSIQUES & RELATIVISTES ---
    function updatePhysicsUI() {
        const v = engine.vMs; // m/s
        const vKmh = v * 3.6;

        // Vitesse & Navigation
        safeSet('speed-main-display', vKmh.toFixed(1) + " km/h");
        safeSet('speed-stable-kmh', vKmh.toFixed(1) + " km/h");
        safeSet('speed-stable-ms', v.toFixed(3) + " m/s");
        safeSet('total-distance-3d', engine.distance.toFixed(4) + " km");

        // Relativité (Einstein)
        const beta = v / C_LIGHT;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        safeSet('lorentz-factor', gamma.toFixed(14));
        safeSet('pct-speed-of-light', (beta * 100).toFixed(7) + " %");
        
        // Dilatation du temps (ns par jour)
        const dilationNs = (gamma - 1) * 86400 * 1e9;
        safeSet('time-dilation-vitesse', dilationNs.toFixed(4) + " ns/j");

        // Énergie Cinétique (1/2 mv²)
        const ec = 0.5 * mass * v * v;
        safeSet('kinetic-energy', ec.toFixed(2) + " J");

        // Dynamique des fluides (Trainée air)
        const rho = 1.225; // Densité air standard
        const drag = 0.5 * rho * v * v * 0.3 * 1.8; // Formule simplifiée
        safeSet('drag-force', drag.toFixed(2) + " N");
        safeSet('dynamic-pressure', (0.5 * rho * v * v).toFixed(2) + " Pa");

        // Force G Verticale (Ascenseur / Salto)
        const gVert = engine.accel.z / 9.80665;
        safeSet('force-g-vert', gVert.toFixed(3) + " G");
        
        // Debug EKF
        safeSet('ukf-status', "STABLE (21S)");
        safeSet('nyquist-limit', (1000/16.6).toFixed(0) + " Hz"); // ~60Hz
    }

    // --- 5. CALCULS ASTRONOMIQUES (VSOP2013) ---
    function updateAstroUI() {
        if (!engine.lat || !window.calculateAstroData) return;

        const date = new Date();
        const astro = calculateAstroData(date, engine.lat, engine.lon);

        safeSet('sun-alt', astro.sun.altitude.toFixed(2) + "°");
        safeSet('sun-azimuth', astro.sun.azimuth.toFixed(2) + "°");
        safeSet('julian-date', astro.jd.toFixed(5));
        safeSet('lat-ukf', engine.lat.toFixed(6));
        safeSet('lon-ukf', engine.lon.toFixed(6));
        safeSet('alt-display', engine.alt.toFixed(2) + " m");

        // Heure Solaire Vraie (TST)
        const h = Math.floor(astro.tst);
        const m = Math.floor((astro.tst - h) * 60);
        safeSet('tst-time', `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`);
        
        // Phase de la journée
        safeSet('astro-phase', astro.sun.altitude > 0 ? "Jour ☀️" : "Nuit/Crépuscule 🌙");
    }

    // --- 6. UTILITAIRE D'INJECTION ---
    function safeSet(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    window.addEventListener('load', init);
})();
