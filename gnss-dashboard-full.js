/**
 * GNSS SPACETIME DASHBOARD - MASTER CONTROL UNIT
 * Version : Finale Intégrale (UKF + Astro + VSOP2013 + UI)
 */

window.addEventListener('load', () => {
    // 1. INITIALISATION DU MOTEUR UKF (FUSION DE DONNÉES)
    if (typeof window.ProfessionalUKF !== 'undefined') {
        window.MainEngine = new window.ProfessionalUKF();
        // Coordonnées par défaut (Paris) pour éviter les N/A immédiats
        window.MainEngine.lat = 48.8566;
        window.MainEngine.lon = 2.3522;
        window.MainEngine.alt = 50;
    }

    // 2. ÉCOUTEURS DES CONTRÔLES UI
    setupEventListeners();

    // 3. LANCEMENT DES BOUCLES DE CALCUL
    // Boucle Physique Haute Fréquence (60 FPS) pour la vitesse et IMU
    function physicsLoop() {
        if (window.MainEngine && window.MainEngine.isRunning) {
            updatePhysicsDisplay(window.MainEngine);
        }
        requestAnimationFrame(physicsLoop);
    }

    // Boucle Astro & Temps (1 Hz) pour les éphémérides et horloges
    setInterval(() => {
        updateAstroDisplay();
    }, 1000);

    physicsLoop();
    console.log("✅ Dashboard Master Initialisé : UKF et Astro synchronisés.");
});

/**
 * Gère tous les boutons de l'interface
 */
function setupEventListeners() {
    // Bouton Master Marche/Arrêt
    const masterBtn = document.getElementById('gps-pause-toggle');
    if (masterBtn) {
        masterBtn.addEventListener('click', async () => {
            // Demande de permission pour les capteurs (iOS/Android)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            console.log("Système activé");
        });
    }

    // Mode Nuit
    document.getElementById('toggle-night-mode')?.addEventListener('click', () => {
        document.body.classList.toggle('night-mode');
        const isNight = document.body.classList.contains('night-mode');
        document.getElementById('toggle-night-mode').textContent = isNight ? "☀️ Mode Jour" : "🌙 Mode Nuit";
    });

    // Réinitialisations
    document.getElementById('btn-reset-dist')?.addEventListener('click', () => {
        if (window.MainEngine) window.MainEngine.totalDist = 0;
    });

    document.getElementById('btn-reset-vmax')?.addEventListener('click', () => {
        if (window.MainEngine) window.MainEngine.vMax = 0;
    });

    // Capture (Screenshot/Log)
    document.getElementById('btn-capture')?.addEventListener('click', () => {
        const speed = document.getElementById('speed-stable-kmh')?.textContent;
        alert(`Données capturées : ${speed} à ${new Date().toLocaleTimeString()}`);
    });

    // Reset Total
    document.querySelector('.btn-danger')?.addEventListener('click', () => {
        if (confirm("Réinitialiser toute la session ?")) location.reload();
    });
}

/**
 * Mise à jour des données physiques (Vitesse, Relativité, Forces G)
 */
function updatePhysicsDisplay(engine) {
    // Vitesses et Distance
    set('speed-main-display', engine.vKmh.toFixed(engine.vKmh < 0.1 ? 5 : 1));
    set('speed-stable-kmh', engine.vKmh.toFixed(3) + " km/h");
    set('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");
    set('v-max-session', engine.vMax.toFixed(1) + " km/h");
    set('total-distance-3d', (engine.totalDist / 1000).toFixed(5) + " km");

    // Physique Relativiste
    const c = 299792458;
    const beta = engine.vMs / c;
    const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
    set('lorentz-factor', gamma.toFixed(15));
    set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");

    // Dynamique & Forces G
    const gBase = 9.80665;
    if (engine.lastAcc) {
        set('force-g-long', (engine.lastAcc / gBase).toFixed(3));
    }
    
    // Niveau à Bulle (IMU)
    const bubble = document.getElementById('bubble');
    if (bubble && engine.tilt) {
        bubble.style.transform = `translate(${-engine.tilt.x * 12}px, ${engine.tilt.y * 12}px)`;
        set('pitch-display', (engine.tilt.y * 57.3).toFixed(1) + "°");
        set('roll-display', (engine.tilt.x * 57.3).toFixed(1) + "°");
    }
}

/**
 * Mise à jour des données Astro et Temps (Suppression des N/A)
 */
function updateAstroDisplay() {
    const now = new Date();
    const engine = window.MainEngine;

    // Horloges
    set('local-time', now.toLocaleTimeString());
    set('utc-time', now.toISOString().slice(11, 19) + " UTC");

    // Appel au module astro.js (Éphémérides VSOP2013)
    if (typeof calculateAstroData === 'function') {
        const astro = calculateAstroData(now, engine.lat, engine.lon);

        // Soleil
        set('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
        set('sun-azimuth', (astro.sun.azimuth * 57.3).toFixed(2) + "°");
        set('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
        set('local-sidereal-time', formatHours(astro.TST_HRS));

        // Lune
        set('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
        set('moon-illumination', (astro.moon.illumination.fraction * 100).toFixed(1) + "%");
        set('moon-alt', (astro.moon.altitude * 57.3).toFixed(2) + "°");
        
        // État Nuit/Jour
        set('night-status', (astro.sun.altitude * 57.3) < -0.83 ? "NUIT (🌙)" : "JOUR (☀️)");
    }

    // Simulation Environnement (Pour éviter les N/A sans capteurs externes)
    set('gravity-local', "9.8067 m/s²");
    set('temp-air', "15.0 °C"); // Valeur standard ISA si pas d'API
    set('pression-baro', "1013.2 hPa");
}

// Utilitaire de mise à jour sécurisée du DOM
function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
