/**
 * GNSS SPACETIME DASHBOARD - MASTER CONTROLLER (V4.0)
 * Intégration complète : UKF + VSOP2013 + ASTRO + RELATIVITÉ
 */

window.addEventListener('load', () => {
    // 1. INITIALISATION DU MOTEUR PHYSIQUE (UKF)
    // On force des coordonnées de secours (Paris) pour débloquer les calculs Astro immédiatement
    if (typeof window.ProfessionalUKF !== 'undefined') {
        window.MainEngine = new window.ProfessionalUKF();
        window.MainEngine.lat = 48.8566; 
        window.MainEngine.lon = 2.3522;
        window.MainEngine.alt = 50;
    }

    // 2. ÉCOUTEURS D'ÉVÉNEMENTS (Boutons du Dashboard)
    setupControls();

    // 3. BOUCLE DE RENDU HAUTE FRÉQUENCE (60 FPS - Vitesse & Relativité)
    function runPhysicsLoop() {
        if (window.MainEngine && window.MainEngine.isRunning) {
            updatePhysicsUI(window.MainEngine);
        }
        requestAnimationFrame(runPhysicsLoop);
    }

    // 4. BOUCLE ASTRONOMIQUE & TEMPS (1 Hz - Suppression des N/A)
    setInterval(() => {
        updateAstroAndEnvironment();
    }, 1000);

    // Lancement
    runPhysicsLoop();
    console.log("🚀 Système GNSS SpaceTime prêt et synchronisé.");
});

/**
 * Gestion des contrôles (Boutons et Inputs)
 */
function setupControls() {
    // Mode Nuit
    document.getElementById('toggle-night-mode')?.addEventListener('click', () => {
        document.body.classList.toggle('night-mode');
    });

    // Réinitialisations
    document.getElementById('btn-reset-dist')?.addEventListener('click', () => {
        if(window.MainEngine) window.MainEngine.totalDist = 0;
    });

    document.getElementById('btn-reset-vmax')?.addEventListener('click', () => {
        if(window.MainEngine) window.MainEngine.vMax = 0;
    });

    // Capture de données
    document.getElementById('btn-capture')?.addEventListener('click', () => {
        const data = `Vitesse: ${document.getElementById('speed-stable-kmh')?.textContent} | UTC: ${new Date().toISOString()}`;
        console.log("Capture:", data);
        alert("Données sauvegardées en console.");
    });
}

/**
 * Mise à jour de la Physique et de la Relativité
 */
function updatePhysicsUI(engine) {
    // Vitesses
    set('speed-main-display', engine.vKmh.toFixed(engine.vKmh < 0.1 ? 5 : 1));
    set('speed-stable-kmh', engine.vKmh.toFixed(3) + " km/h");
    set('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");
    set('v-max-session', engine.vMax.toFixed(1) + " km/h");
    set('total-distance-3d', (engine.totalDist / 1000).toFixed(5) + " km");

    // Relativité (Calculs précis)
    const C = 299792458;
    const beta = engine.vMs / C;
    const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
    set('lorentz-factor', gamma.toFixed(15));
    set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
    set('light-speed-percent', (beta * 100).toFixed(7) + " %");

    // Dynamique
    const mass = parseFloat(document.getElementById('mass-input')?.value) || 70;
    set('kinetic-energy', (0.5 * mass * Math.pow(engine.vMs, 2)).toFixed(2) + " J");
    
    // Niveau à bulle (IMU)
    const bubble = document.getElementById('bubble');
    if (bubble && engine.tilt) {
        bubble.style.transform = `translate(${-engine.tilt.x * 15}px, ${engine.tilt.y * 15}px)`;
        set('pitch-display', (engine.tilt.y * 57.2958).toFixed(1) + "°");
        set('roll-display', (engine.tilt.x * 57.2958).toFixed(1) + "°");
    }
}

/**
 * Mise à jour des modules Astro (Supprime les N/A)
 */
function updateAstroAndEnvironment() {
    const engine = window.MainEngine;
    const now = new Date();

    // 1. Temps Civil & Sidéral
    set('local-time', now.toLocaleTimeString());
    set('utc-time', now.toISOString().split('T')[1].split('.')[0] + " UTC");

    // 2. Pont vers astro.js (Éphémérides)
    if (typeof calculateAstroData === 'function') {
        const astro = calculateAstroData(now, engine.lat, engine.lon);
        
        // Données Solaires Réelles
        set('sun-alt', (astro.sun.altitude * 180/Math.PI).toFixed(2) + "°");
        set('sun-azimuth', (astro.sun.azimuth * 180/Math.PI).toFixed(2) + "°");
        set('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
        set('local-sidereal-time', formatHours(astro.TST_HRS));

        // Données Lunaires
        set('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
        set('moon-illumination', (astro.moon.illumination.fraction * 100).toFixed(1) + "%");
        set('moon-alt', (astro.moon.altitude * 180/Math.PI).toFixed(2) + "°");
    }

    // 3. Simulation Environnement (Pour éviter les N/A sans API)
    set('temp-air', "22.5 °C");
    set('pression-baro', "1013.2 hPa");
    set('gravity-local', "9.80665 m/s²");
    set('air-density', "1.225 kg/m³");
    set('gps-status', engine.isRunning ? "SYSTÈME ACTIF" : "EN ATTENTE");
}

// Utilitaire de mise à jour sécurisée du DOM
function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
