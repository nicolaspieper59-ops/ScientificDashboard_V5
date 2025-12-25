/**
 * GNSS SPACETIME DASHBOARD - CONTRÔLEUR FINAL 
 * Synchronisé avec index (30).html
 */

window.addEventListener('load', () => {
    // 1. Initialisation du moteur UKF
    if (typeof window.ProfessionalUKF !== 'undefined') {
        window.MainEngine = new window.ProfessionalUKF();
        // Coordonnées de secours (Paris) pour éviter les N/A immédiats
        window.MainEngine.lat = 48.8566;
        window.MainEngine.lon = 2.3522;
        window.MainEngine.alt = 50;
    }

    // 2. Initialisation des contrôles (Boutons)
    initDashboardControls();

    // 3. Boucles de mise à jour
    // Physique & Relativité (60Hz pour la fluidité)
    function fastLoop() {
        if (window.MainEngine && window.MainEngine.isRunning) {
            updatePhysicsAndRelativity(window.MainEngine);
        }
        requestAnimationFrame(fastLoop);
    }

    // Astro, Temps & Système (1Hz pour économiser les ressources)
    setInterval(() => {
        updateAstroAndSystem();
    }, 1000);

    fastLoop();
    console.log("🚀 Dashboard GNSS SpaceTime : Liaison ID HTML terminée.");
});

/**
 * Mappage des IDs pour la Physique et la Relativité
 */
function updatePhysicsAndRelativity(engine) {
    // --- Vitesse & Distance ---
    set('speed-main-display', engine.vKmh.toFixed(engine.vKmh < 0.1 ? 5 : 1));
    set('speed-stable-kmh', engine.vKmh.toFixed(3) + " km/h");
    set('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");
    set('speed-raw-ms', engine.vMs.toFixed(5) + " m/s"); // ID du HTML
    set('v-max-session', engine.vMax.toFixed(1) + " km/h");
    set('total-distance-3d', (engine.totalDist / 1000).toFixed(5) + " km");
    set('distance-3d-precis', (engine.totalDist / 1000).toFixed(7) + " km");

    // --- Relativité (IDs exacts du HTML) ---
    const C = 299792458;
    const beta = engine.vMs / C;
    const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
    
    set('lorentz-factor', gamma.toFixed(15));
    set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
    set('light-speed-percent', (beta * 100).toFixed(8) + " %");
    set('mach-number', (engine.vMs / 340.29).toFixed(4));

    // --- IMU (Accéléromètres) ---
    if (engine.accel) {
        set('accel-x', engine.accel.x.toFixed(4));
        set('accel-y', engine.accel.y.toFixed(4));
        set('accel-z', engine.accel.z.toFixed(4));
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
 * Mappage des IDs pour l'Astro et le Système (Suppression des N/A)
 */
function updateAstroAndSystem() {
    const now = new Date();
    const engine = window.MainEngine || { lat: 48.8566, lon: 2.3522, alt: 50 };

    // --- Temps & Système ---
    set('local-time', now.toLocaleTimeString());
    set('utc-time', now.toISOString().slice(11, 19) + " UTC");
    set('session-elapsed-time', ((now - window.startTime) / 1000 || 0).toFixed(2) + " s");

    // --- Calculs Astronomiques (Liaison avec lib/astro.js) ---
    if (typeof calculateAstroData === 'function') {
        const astro = calculateAstroData(now, engine.lat, engine.lon);

        // Soleil
        set('sun-alt', (astro.sun.altitude * 57.2958).toFixed(2) + "°");
        set('sun-azimuth', (astro.sun.azimuth * 57.2958).toFixed(2) + "°");
        set('local-sidereal-time', formatHours(astro.TST_HRS));
        set('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
        set('noon-solar-utc', formatHours(astro.NOON_SOLAR_UTC));

        // Lune
        set('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
        set('moon-illumination', (astro.moon.illumination.fraction * 100).toFixed(1) + "%");
        set('moon-alt', (astro.moon.altitude * 57.2958).toFixed(2) + "°");
        set('moon-azimuth', (astro.moon.azimuth * 57.2958).toFixed(2) + "°");
        
        // État Nuit/Jour
        set('night-status', (astro.sun.altitude * 57.3) < -0.83 ? "NUIT (🌙)" : "JOUR (☀️)");
    }

    // --- Coordonnées EKF/UKF ---
    set('lat-ukf', engine.lat.toFixed(7));
    set('lon-ukf', engine.lon.toFixed(7));
    set('alt-ukf', engine.alt.toFixed(2) + " m");
}

/**
 * Initialisation des boutons du Dashboard
 */
function initDashboardControls() {
    window.startTime = new Date();

    // Bouton Master
    document.getElementById('gps-pause-toggle')?.addEventListener('click', function() {
        const isActive = this.textContent.includes("ACTIF");
        this.textContent = isActive ? "▶ SYSTÈME EN PAUSE" : "⏸ SYSTÈME ACTIF";
        this.style.background = isActive ? "#ffc107" : "#28a745";
    });

    // Mode Nuit
    document.getElementById('toggle-night-mode')?.addEventListener('click', () => {
        document.body.classList.toggle('night-mode');
    });

    // Reset Distance
    document.getElementById('btn-reset-dist')?.addEventListener('click', () => {
        if(window.MainEngine) window.MainEngine.totalDist = 0;
    });
}

// Utilitaire de mise à jour sécurisée
function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
                              }
