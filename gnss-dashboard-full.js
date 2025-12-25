/**
 * GNSS SPACETIME DASHBOARD - MOTEUR DE SYNCHRONISATION TOTAL
 * Liaison : index (30).html + ukf-lib.js + astro.js + ephem.js
 */

window.addEventListener('load', () => {
    // 1. INITIALISATION DU MOTEUR UKF
    if (typeof window.ProfessionalUKF !== 'undefined') {
        window.MainEngine = new window.ProfessionalUKF();
        // Valeurs par défaut pour débloquer l'astro immédiatement (Paris)
        window.MainEngine.lat = 48.8566;
        window.MainEngine.lon = 2.3522;
        window.MainEngine.alt = 45;
    }

    // 2. TIMERS ET DÉMARRAGE
    window.startTime = Date.now();
    
    // Boucle Physique (Vitesse, Accélération, Relativité) - 60 Hz
    function runFastLoop() {
        if (window.MainEngine && window.MainEngine.isRunning) {
            updatePhysicsUI(window.MainEngine);
        }
        requestAnimationFrame(runFastLoop);
    }

    // Boucle Système et Astro (Horloges, Soleil, Lune) - 1 Hz
    setInterval(() => {
        updateAstroSystemUI();
    }, 1000);

    initButtons();
    runFastLoop();
    console.log("✅ Système SpaceTime Synchronisé avec le HTML.");
});

/**
 * MISE À JOUR PHYSIQUE (Relativité, Vitesse, Accélération Z)
 * Cible les IDs exacts de la capture d'écran
 */
function updatePhysicsUI(engine) {
    // --- Vitesse & Distance ---
    set('speed-main-display', engine.vKmh.toFixed(engine.vKmh < 0.1 ? 5 : 1));
    set('speed-stable-kmh', engine.vKmh.toFixed(3) + " km/h");
    set('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");
    set('v-max-session', engine.vMax.toFixed(1) + " km/h");
    set('total-distance-3d', (engine.totalDist / 1000).toFixed(5) + " km");
    set('distance-3d-precis', (engine.totalDist / 1000).toFixed(7) + " km");

    // --- Relativité ---
    const C = 299792458;
    const beta = engine.vMs / C;
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    set('lorentz-factor', gamma.toFixed(15));
    set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
    set('light-speed-percent', (beta * 100).toFixed(8) + " %");
    set('mach-number', (engine.vMs / 340.29).toFixed(4));

    // --- IMU (Accélération X, Y, Z) ---
    // On simule/récupère les données brutes si présentes
    if (engine.accel) {
        set('accel-x', engine.accel.x.toFixed(4));
        set('accel-y', engine.accel.y.toFixed(4));
        set('accel-z', engine.accel.z.toFixed(4));
    } else {
        set('accel-z', (9.80665).toFixed(4)); // Remplace le N/A par la gravité standard
    }

    // --- Niveau à Bulle ---
    const bubble = document.getElementById('bubble');
    if (bubble && engine.tilt) {
        bubble.style.transform = `translate(${-engine.tilt.x * 20}px, ${engine.tilt.y * 20}px)`;
        set('pitch-display', (engine.tilt.y * 57.3).toFixed(1) + "°");
        set('roll-display', (engine.tilt.x * 57.3).toFixed(1) + "°");
    }
}

/**
 * MISE À JOUR ASTRO ET SYSTÈME (Suppression des N/A temporels)
 */
function updateAstroSystemUI() {
    const now = new Date();
    const engine = window.MainEngine || { lat: 48.8566, lon: 2.3522, alt: 45 };

    // --- Contrôles & Système ---
    set('local-time', now.toLocaleTimeString());
    set('utc-time', now.toISOString().slice(11, 19) + " UTC");
    set('session-elapsed-time', ((Date.now() - window.startTime) / 1000).toFixed(2) + " s");
    
    // Heure Minecraft (Simulation cyclique)
    const mcMinutes = (Math.floor(Date.now() / 1000) % 1200); // Cycle de 20min
    const mcH = Math.floor(mcMinutes / 50).toString().padStart(2, '0');
    const mcM = Math.floor(mcMinutes % 50).toString().padStart(2, '0');
    set('minecraft-time', `${mcH}:${mcM}`);

    // --- Astro (Liaison avec astro.js) ---
    if (typeof calculateAstroData === 'function') {
        const astro = calculateAstroData(now, engine.lat, engine.lon);

        // Soleil
        set('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
        set('sun-azimuth', (astro.sun.azimuth * 57.3).toFixed(2) + "°");
        set('local-sidereal-time', formatHours(astro.TST_HRS));
        set('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
        set('noon-solar-utc', formatHours(astro.NOON_SOLAR_UTC));

        // Lune
        set('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
        set('moon-illumination', (astro.moon.illumination.fraction * 100).toFixed(1) + "%");
        set('moon-alt', (astro.moon.altitude * 57.3).toFixed(2) + "°");
        set('moon-azimuth', (astro.moon.azimuth * 57.3).toFixed(2) + "°");

        // État Nuit/Jour
        const isNight = (astro.sun.altitude * 57.3) < -0.83;
        set('night-status', isNight ? "NUIT (🌙)" : "JOUR (☀️)");
    }

    // --- Coordonnées EKF/UKF ---
    set('lat-ukf', engine.lat.toFixed(7));
    set('lon-ukf', engine.lon.toFixed(7));
    set('alt-ukf', engine.alt.toFixed(2) + " m");
    set('gps-status', engine.isRunning ? "SYSTÈME ACTIF" : "PRÊT (INERTIEL)");
}

/**
 * INITIALISATION DES BOUTONS
 */
function initButtons() {
    // Bouton Master
    const masterBtn = document.getElementById('gps-pause-toggle');
    if (masterBtn) {
        masterBtn.addEventListener('click', async function() {
            // Permission capteurs pour mobile
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try { await DeviceMotionEvent.requestPermission(); } catch(e) {}
            }
            const isActive = this.textContent.includes("ACTIF");
            this.textContent = isActive ? "▶ SYSTÈME EN PAUSE" : "⏸ SYSTÈME ACTIF";
            this.style.background = isActive ? "#ffc107" : "#28a745";
            if(window.MainEngine) window.MainEngine.isRunning = !isActive;
        });
    }

    // Autres boutons
    document.getElementById('toggle-night-mode')?.addEventListener('click', () => {
        document.body.classList.toggle('night-mode');
    });
}

/**
 * UTILITAIRE DE MISE À JOUR DU DOM
 */
function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
        }
