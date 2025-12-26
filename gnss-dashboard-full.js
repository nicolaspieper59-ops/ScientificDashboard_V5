/**
 * GNSS SpaceTime Dashboard - Moteur de Contrôle Final
 * Fusion Sensorielle UKF 21-états & Astronomie VSOP2013
 */

(function() {
    "use strict";

    // --- CONFIGURATION & VARIABLES GLOBALES ---
    let engine;
    let utcOffset = 0; // Décalage millisecondes entre local et GMT réel
    const C = 299792458; // Vitesse de la lumière (m/s)

    // Utilitaire de mise à jour sécurisée du DOM
    const safeSet = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    /**
     * SYNCHRONISATION GMT RÉELLE (NTP-like)
     * Récupère le temps atomique pour calibrer l'astronomie et la physique
     */
    async function synchronizeTime() {
        try {
            const start = Date.now();
            const response = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC");
            const data = await response.json();
            const serverUtcTime = new Date(data.utc_datetime).getTime();
            const latency = (Date.now() - start) / 2;
            
            // Calcul du décalage exact
            utcOffset = serverUtcTime - (Date.now() - latency);
            
            console.log(`🕒 Synchro GMT réussie. Offset: ${utcOffset}ms`);
            safeSet('clock-accuracy', `± ${Math.abs(utcOffset).toFixed(0)}ms`);
        } catch (e) {
            console.warn("⚠️ Échec synchro GMT, repli sur heure système locale.");
        }
    }

    /**
     * INITIALISATION DU SYSTÈME
     */
    function init() {
        // 1. Initialiser le moteur UKF (doit être chargé via ukf-lib.js)
        if (typeof ProfessionalUKF !== 'undefined') {
            engine = window.MainEngine = new ProfessionalUKF();
        } else {
            console.error("❌ Erreur: ProfessionalUKF non trouvé dans ukf-lib.js");
            return;
        }

        // 2. Synchroniser le temps immédiatement
        synchronizeTime();

        // 3. Gestionnaire du bouton Start/Pause
        const btn = document.getElementById('gps-pause-toggle');
        if (btn) {
            btn.onclick = () => {
                engine.isRunning = !engine.isRunning;
                btn.textContent = engine.isRunning ? "⏸️ STOP ENGINE" : "▶️ START ENGINE";
                btn.style.background = engine.isRunning ? "#3a1a1a" : "#1a3a2a";
                
                // Demander permission capteurs (iOS/Android récents)
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
            };
        }

        // 4. BOUCLE DE TRAITEMENT HAUTE FRÉQUENCE (20 Hz / 50ms)
        setInterval(mainLoop, 50);
    }

    /**
     * BOUCLE PRINCIPALE (Physique + Astro + DOM)
     */
    function mainLoop() {
        if (!engine) return;

        // --- A. GESTION DU TEMPS RÉEL GMT ---
        const exactNow = new Date(Date.now() + utcOffset);
        const jd = (exactNow.getTime() / 86400000) + 2440587.5; // Date Julienne
        
        // --- B. MISE À JOUR DU MOTEUR PHYSIQUE ---
        engine.update(50); // dt = 50ms
        
        // Extraction des vecteurs d'état
        const state = engine.state; // {pos: {x,y,z}, vel: {x,y,z}, acc: {x,y,z}}
        const v = Math.sqrt(state.vel.x**2 + state.vel.y**2 + state.vel.z**2); // Vitesse scalaire m/s
        const altitude = engine.alt || 0;

        // --- C. CALCULS ASTRONOMIQUES (VSOP2013) ---
        // On injecte le temps réel dans le module ephem.js
        const astro = (typeof engine.getAstro === 'function') ? engine.getAstro(jd) : null;

        // --- D. PHYSIQUE AVANCÉE & RELATIVITÉ ---
        // 1. Facteur de Lorentz (Dilatation temporelle)
        const beta = v / C;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        const timeDilation = (gamma - 1) * 1e9; // nanosecondes de retard par seconde

        // 2. Aérodynamique (Mach)
        const speedSound = 331.3 + 0.606 * (15 - 0.0065 * altitude); // Approx ISA
        const mach = v / speedSound;

        // 3. Pression Dynamique Q = 1/2 * rho * v²
        const rho = 1.225 * Math.exp(-altitude / 8500); // Modèle atmosphérique simplifié
        const dynPressure = 0.5 * rho * v**2;

        // --- E. MISE À JOUR DE L'INTERFACE (DOM) ---
        
        // 1. Navigation & Vitesse
        safeSet('speed-main-display', (v * 3.6).toFixed(2));
        safeSet('vel-z', state.vel.z.toFixed(2) + " m/s");
        safeSet('alt-display', altitude.toFixed(2) + " m");
        
        const distKm = Math.sqrt(state.pos.x**2 + state.pos.y**2 + state.pos.z**2) / 1000;
        safeSet('total-distance-3d', distKm.toFixed(6) + " km");

        // 2. Astronomie
        if (astro) {
            safeSet('tslv', astro.tslv ? astro.tslv.toFixed(4) + " h" : "N/A");
            safeSet('ecl-long', astro.sunLon ? astro.sunLon.toFixed(2) + "°" : "N/A");
            safeSet('sun-alt', astro.sunAlt ? astro.sunAlt.toFixed(2) + "°" : "N/A");
            safeSet('sun-azimuth', astro.sunAz ? astro.sunAz.toFixed(2) + "°" : "N/A");
            safeSet('moon-distance', astro.moonDist ? astro.moonDist.toLocaleString() + " km" : "N/A");
            safeSet('moon-phase', astro.moonPhase ? (astro.moonPhase * 100).toFixed(1) + "%" : "N/A");
        }

        // 3. Physique & Relativité
        safeSet('mach-number', mach.toFixed(5));
        safeSet('lorentz-factor', gamma.toFixed(8));
        safeSet('dyn-pressure', dynPressure.toFixed(2) + " Pa");
        safeSet('kinetic-energy', (0.5 * engine.mass * v**2).toLocaleString() + " J");
        safeSet('time-dilation', timeDilation.toFixed(3) + " ns/s");

        // 4. Temps & Système
        safeSet('julian-date', jd.toFixed(6));
        if (engine.bias) {
            const b = Math.sqrt(engine.bias.x**2 + engine.bias.y**2 + engine.bias.z**2) * 1000;
            safeSet('acc-bias', b.toFixed(3) + " mg");
        }
    }

    // Lancer l'initialisation au chargement
    window.addEventListener('load', init);

})();
