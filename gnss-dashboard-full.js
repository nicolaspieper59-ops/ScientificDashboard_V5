/**
 * GNSS SpaceTime Dashboard - Moteur de Contrôle Final
 * Version Haute Précision : Fusion UKF 21-états & VSOP2013
 */

(function() {
    "use strict";

    // --- VARIABLES D'ÉTAT ---
    let engine;
    let utcOffset = 0; 
    const C = 299792458; // Vitesse de la lumière (m/s)

    // Utilitaire de mise à jour sécurisée du DOM
    const safeSet = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    /**
     * 1. SYNCHRONISATION GMT RÉELLE
     * Interroge un serveur de temps pour calibrer l'astronomie
     */
    async function synchronizeTime() {
        try {
            const start = Date.now();
            const response = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC");
            const data = await response.json();
            const serverTime = new Date(data.utc_datetime).getTime();
            const latency = (Date.now() - start) / 2;
            
            utcOffset = serverTime - (Date.now() - latency);
            console.log(`🕒 Synchro GMT : Offset ${utcOffset}ms`);
            safeSet('clock-accuracy', `± ${Math.abs(utcOffset).toFixed(0)}ms`);
        } catch (e) {
            console.warn("⚠️ Synchro GMT impossible, repli sur heure locale.");
        }
    }

    /**
     * 2. INITIALISATION DU SYSTÈME
     */
    function init() {
        // Initialisation du moteur physique
        if (typeof ProfessionalUKF !== 'undefined') {
            engine = window.MainEngine = new ProfessionalUKF();
            // Marseille par défaut
            engine.lat = 43.2965;
            engine.lon = 5.3698;
        } else {
            console.error("❌ Moteur UKF introuvable.");
            return;
        }

        synchronizeTime();

        // Gestionnaire du bouton Start/Pause
        const btn = document.getElementById('gps-pause-toggle');
        if (btn) {
            btn.onclick = () => {
                engine.isRunning = !engine.isRunning;
                btn.textContent = engine.isRunning ? "⏸️ STOP ENGINE" : "▶️ START ENGINE";
                btn.style.background = engine.isRunning ? "#3a1a1a" : "#1a3a2a";
                
                // Permission capteurs pour mobile
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
            };
        }

        // Boucle principale à 20Hz (50ms)
        setInterval(updateDashboard, 50);
    }

    /**
     * 3. BOUCLE DE CALCUL ET RENDU
     */
    function updateDashboard() {
        if (!engine) return;

        // --- A. GESTION DU TEMPS ---
        const exactNow = new Date(Date.now() + utcOffset);
        const jd = (exactNow.getTime() / 86400000) + 2440587.5; // Date Julienne
        
        // --- B. MISE À JOUR PHYSIQUE (UKF) ---
        engine.update(0.05); // dt = 50ms
        
        const state = engine.state; 
        const v = Math.sqrt(state.vel.x**2 + state.vel.y**2 + state.vel.z**2); // m/s
        const altitude = engine.alt || 0;

        // --- C. CALCULS ASTRONOMIQUES ---
        const astro = (typeof engine.getAstro === 'function') ? engine.getAstro(jd) : null;

        // --- D. PHYSIQUE ET RELATIVITÉ ---
        // 1. Mach (vitesse du son variable selon altitude)
        const speedSound = 331.3 + 0.606 * (15 - 0.0065 * altitude);
        const mach = v / speedSound;

        // 2. Facteur de Lorentz (Gamma)
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / C, 2));

        // 3. Pression Dynamique
        const rho = 1.225 * Math.exp(-altitude / 8500); 
        const q = 0.5 * rho * v**2;

        // --- E. MISE À JOUR DU HTML (IDs) ---
        
        // Navigation
        safeSet('speed-main-display', (v * 3.6).toFixed(2));
        safeSet('vel-z', state.vel.z.toFixed(2) + " m/s");
        safeSet('alt-display', altitude.toFixed(2) + " m");
        const distKm = Math.sqrt(state.pos.x**2 + state.pos.y**2 + state.pos.z**2) / 1000;
        safeSet('total-distance-3d', distKm.toFixed(6) + " km");

        // Astronomie (VSOP2013)
        if (astro) {
            safeSet('tslv', astro.tslv ? astro.tslv.toFixed(4) + " h" : "N/A");
            safeSet('ecl-long', astro.sunLon ? astro.sunLon.toFixed(2) + "°" : "N/A");
            safeSet('sun-alt', astro.sunAlt ? astro.sunAlt.toFixed(2) + "°" : "N/A");
            safeSet('sun-azimuth', astro.sunAz ? astro.sunAz.toFixed(2) + "°" : "N/A");
            safeSet('moon-distance', astro.moonDist ? Math.round(astro.moonDist).toLocaleString() + " km" : "N/A");
        }

        // Physique Avancée
        safeSet('mach-number', mach.toFixed(5));
        safeSet('lorentz-factor', gamma.toFixed(9));
        safeSet('dyn-pressure', q.toFixed(2) + " Pa");
        safeSet('kinetic-energy', (0.5 * (engine.mass || 75) * v**2).toLocaleString() + " J");
        safeSet('time-dilation', ((gamma - 1) * 1e9).toFixed(4) + " ns/s");

        // Système & Temps
        safeSet('gmt-time-display', exactNow.toUTCString().split(' ')[4] + "." + String(exactNow.getUTCMilliseconds()).padStart(3,'0'));
        safeSet('julian-date', jd.toFixed(6));
        
        const filterStatus = document.getElementById('filter-status');
        if (filterStatus) {
            filterStatus.textContent = engine.isRunning ? "ACTIF (FUSION 21-E)" : "VEILLE";
            filterStatus.style.color = engine.isRunning ? "#00ff66" : "#ffcc00";
        }
    }

    // Lancement au chargement de la page
    window.addEventListener('load', init);

})();
