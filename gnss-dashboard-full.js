// =================================================================
// FICHIER : gnss-dashboard-full.js (VERSION FINALE HARMONISÉE)
// CORRECTION: Harmonisation complète des IDs avec index (19).html.
// CORRECTION: Restauration des fonctions NTP, Minecraft Time et Master Switch.
// =================================================================

((window) => {
    "use strict";

    // --- FONCTIONS UTILITAIRES GLOBALES (Récupérées de V7.2 et adaptées) ---
    const $ = id => document.getElementById(id);

    const dataOrDefault = (val, decimals, suffix = '', fallback = 'N/A', forceZero = false) => {
        if (val === undefined || val === null || isNaN(val) || (typeof val === 'number' && Math.abs(val) < 1e-18)) {
            if (fallback !== 'N/A') return fallback;
            if (forceZero) {
                return (0).toFixed(decimals).replace('.', ',') + suffix;
            }
            return 'N/A';
        }
        return val.toFixed(decimals).replace('.', ',') + suffix;
    };

    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val) || Math.abs(val) < 1e-30) {
            const zeroExp = (0).toExponential(decimals).replace('.', ',');
            return zeroExp.replace('e+0', 'e+00') + suffix; // Format 'e+00'
        }
        return val.toExponential(decimals).replace('.', ',') + suffix;
    };


    // --- CONSTANTES PHYSIQUES HAUTE PRÉCISION ---
    const C = 299792458.0;              // Vitesse de la lumière (m/s)
    const G_STD = 9.8067;               // Gravité standard (m/s²)
    const RHO_AIR_ISA = 1.225;          // Densité de l'air ISA (kg/m³)
    const V_SOUND_ISA = 340.29;         // Vitesse du son ISA (m/s)
    const R2D = 180 / Math.PI;          // Radian -> Degré
    const KMH_MS = 3.6;                 // m/s -> km/h

    // =================================================================
    // BLOC 1: CONFIGURATION & ÉTAT
    // =================================================================
    
    // État Système Maître (Utilise la logique Master Switch)
    let isSystemActive = false;
    let ntpOffsetMs = 0; // Décalage NTP (ms)
    
    let ukf = null; 
    let currentMass = 70.0;             
    
    // Position et IMU (Valeurs initiales)
    let currentUKFState = { 
        lat: 43.284572, lon: 5.358710, alt: 100.00, 
        speed: 0.0, 
    };

    // Mouvement/Temps
    let currentMaxSpeed_ms = 0.0;    
    let currentSessionTime = 0.00;       
    let currentMovementTime = 0.00;
    let lastTime = performance.now();
    
    // --- VÉRIFICATION ET FALLBACKS DES DÉPENDANCES ASTRO ---
    // Assure que ces fonctions existent si astro.js est chargé
    const formatHours = window.formatHours || ((h) => dataOrDefault(h, 2));
    const getMoonPhaseName = window.getMoonPhaseName || ((p) => 'N/A');
    const getSolarData = window.getSolarData || ((d, lat, lon, alt) => null);


    // =========================================================
    // BLOC 2 : GESTION DU SYSTÈME (Master Switch)
    // =========================================================

    const updateButtonUI = (isActive) => {
        const btn = $('gps-pause-toggle');
        if (btn) {
            btn.textContent = isActive ? '⏸️ PAUSE SYSTÈME' : '▶️ DÉMARRER SYSTÈME';
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('inactive', !isActive);
        }
    };
    
    const toggleSystem = () => {
        isSystemActive = !isSystemActive;
        updateButtonUI(isSystemActive);

        if (isSystemActive) {
            console.log("✅ Système démarré. Boucles de calcul actives.");
        } else {
            console.log("🛑 Système en pause. Boucles de calcul stoppées.");
        }
    };

    // =========================================================
    // BLOC 3 : GESTION DU TEMPS (syncH, NTP, Minecraft)
    // =========================================================

    // Implémentation NTP simulée (à remplacer par un appel réseau si nécessaire)
    const updateNtpOffset = () => {
        const start = Date.now();
        const serverTimeMs = start + Math.floor(Math.random() * 50) - 25; 
        ntpOffsetMs = serverTimeMs - start;
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(ntpOffsetMs, 0, ' ms'); 
    };

    // NOUVEAU: Logique de calcul du temps Minecraft
    const updateMinecraftTime = (totalElapsedTimeSec) => {
        const MINECRAFT_DAY_SECONDS = 1200; 
        const cycleTimeSec = totalElapsedTimeSec % MINECRAFT_DAY_SECONDS; 
        const hoursInCycle = (cycleTimeSec / MINECRAFT_DAY_SECONDS) * 24;
        const totalHours = (hoursInCycle + 6) % 24; // Décalage: 0.0h cycle = 6h00 Minecraft
        
        const hours = Math.floor(totalHours);
        const minutes = Math.floor((totalHours - hours) * 60);

        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        
        // ID harmonisé : time-minecraft
        if ($('time-minecraft')) $('time-minecraft').textContent = timeString; 
    };


    function syncH() {
        const now = performance.now();
        const deltaTime = (now - lastTime) / 1000.0; 
        lastTime = now;
        
        if (isSystemActive) {
            currentSessionTime += deltaTime;
            if (currentUKFState.speed > 0.01) { currentMovementTime += deltaTime; } 
        }

        const localTime = new Date(Date.now() + ntpOffsetMs); // Utilisation de l'heure NTP corrigée
        
        // --- MISE À JOUR DU TEMPS ---
        // ID harmonisé : local-time
        if ($('local-time')) $('local-time').textContent = localTime.toLocaleTimeString('fr-FR', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        // ID harmonisé : utc-datetime
        const utcDatePart = localTime.toLocaleDateString('fr-FR', {
            year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
        }).replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$1-$2-$3'); 
        
        const utcTimePart = localTime.toLocaleTimeString('fr-FR', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC'
        });

        if ($('utc-datetime')) {
            $('utc-datetime').textContent = utcDatePart + ' ' + utcTimePart + ' UTC/GMT';
        }


        // Temps écoulé (ID harmonisés : elapsed-time, time-motion)
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault(currentSessionTime, 2, ' s'); 
        if ($('time-motion')) $('time-motion').textContent = dataOrDefault(currentMovementTime, 2, ' s');
        
        updateMinecraftTime(currentSessionTime); // Mise à jour Minecraft
    }

    // =========================================================
    // BLOC 4 : LOGIQUE DE CALCUL CRITIQUE (UKF/Physique/Astro)
    // =========================================================

    function updateDashboard() {
        
        // 1. DÉFINITION DE L'ÉTAT ACTUEL
        const V_ms = isSystemActive ? (currentUKFState.speed || 0.0) : 0.0; 
        const M = currentMass;           
        const speed_kmh = V_ms * KMH_MS; 
        
        // 2. CALCULS PHYSIQUES & RELATIVISTES 
        const v_ratio_c = V_ms / C; 
        const gamma = 1 / Math.sqrt(1 - v_ratio_c * v_ratio_c);
        const dynamic_pressure = 0.5 * RHO_AIR_ISA * V_ms * V_ms; 
        const kinetic_energy = 0.5 * M * V_ms * V_ms; 
        const mach_number = V_ms / V_SOUND_ISA; 
        
        // 3. CALCULS ASTRO 
        const today = new Date(Date.now() + ntpOffsetMs);
        let astroData = null;
        if (isSystemActive && typeof window.getSolarData === 'function') {
            try {
                astroData = window.getSolarData(today, currentUKFState.lat, currentUKFState.lon, currentUKFState.alt);
            } catch (e) {
                // Laisse astroData à null
            }
        }
        
        // --- MISE À JOUR DOM : VITESSE & RELATIVITÉ ---
        
        // Vitesse (IDs harmonisés : speed-stable-kmh, speed-stable-ms)
        const speedFallback = 'N/A';
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speed_kmh, 1, ' km/h', speedFallback); 
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speed_kmh, 1, ' km/h', speedFallback); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(V_ms, 2, ' m/s', speedFallback); 
        
        // Vitesse Max (mise à jour)
        currentMaxSpeed_ms = Math.max(currentMaxSpeed_ms, V_ms);
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(currentMaxSpeed_ms * KMH_MS, 1, ' km/h');

        // Physique & Relativité (IDs harmonisés)
        if ($('perc-speed-sound')) $('perc-speed-sound').textContent = dataOrDefault(V_ms / V_SOUND_ISA * 100, 2, ' %'); 
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach_number, 4);
        if ($('pct-speed-of-light')) $('pct-speed-of-light').textContent = dataOrDefaultExp(v_ratio_c * 100, 2, ' %'); 
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(gamma, 4);
        if ($('local-gravity')) $('local-gravity').textContent = dataOrDefault(G_STD, 4, ' m/s²'); 
        
        // Mécanique des Fluides & Champs
        if ($('dynamic-pressure')) $('dynamic-pressure').textContent = dataOrDefault(dynamic_pressure, 2, ' Pa');
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(kinetic_energy, 2, ' J'); 
        
        // --- MISE À JOUR DOM : EKF DEBUG ---
        
        // Filtre EKF/UKF & Debug (ID harmonisé : gps-status-acquisition)
        const gpsStatusText = isSystemActive ? 'ATTENTE SIGNAL' : 'INACTIF';
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusText; 
        if ($('ekf-status')) $('ekf-status').textContent = isSystemActive ? 'ACQUISITION' : 'INACTIF';
        
        // --- MISE À JOUR DOM : POSITION & ASTRO ---
        
        // Position (IDs harmonisés : lat-ekf, lon-ekf, alt-ekf)
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(currentUKFState.lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(currentUKFState.lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = dataOrDefault(currentUKFState.alt, 2, ' m'); 

        // Astro
        if (astroData) {
            // TST/MST (IDs harmonisés)
            if ($('tst-time')) $('tst-time').textContent = formatHours(astroData.TST_HRS);
            if ($('mst-time')) $('mst-time').textContent = formatHours(astroData.MST_HRS);
            if ($('equation-of-time')) $('equation-of-time').textContent = dataOrDefault(astroData.EOT_MIN, 2, ' min'); 
            
            // Soleil (IDs harmonisés)
            if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(astroData.sun.position.altitude * R2D, 2, '°');
            if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(astroData.sun.position.azimuth * R2D, 2, '°'); 
            
            // Lune (IDs harmonisés)
            if ($('moon-phase-name')) $('moon-phase-name').textContent = getMoonPhaseName(astroData.moon.illumination.phase);
            if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(astroData.moon.position.altitude * R2D, 2, '°');
            if ($('moon-azimuth')) $('moon-azimuth').textContent = dataOrDefault(astroData.moon.position.azimuth * R2D, 2, '°'); 
            if ($('moon-distance')) $('moon-distance').textContent = dataOrDefault(astroData.moon.distance / 1000, 0, ' km');
        } else if (isSystemActive) {
             // Afficher des tirets si le système est actif mais les données astro n'arrivent pas
             if ($('tst-time')) $('tst-time').textContent = '--:--';
             if ($('mst-time')) $('mst-time').textContent = '--:--';
             // ... autres champs Astro ...
        } else {
             // Afficher N/A si le système est inactif
             // Les fallbacks par défaut des fonctions s'appliquent ici.
        }
    } // Fin de updateDashboard

    // =========================================================
    // BLOC 5 : INITIALISATION ET BOUCLE UNIQUE (60Hz)
    // =========================================================

    window.addEventListener('load', () => {
        
        // 1. Initialisation UKF (doit se faire après le chargement)
        if (typeof window.ProfessionalUKF === 'function') { 
            ukf = new ProfessionalUKF();
            ukf.initialize(currentUKFState.lat, currentUKFState.lon, currentUKFState.alt);
        }

        // 2. Synchro NTP (une seule fois au chargement)
        updateNtpOffset();
        
        // 3. Binding du Master Switch (ID harmonisé : gps-pause-toggle)
        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) btnToggle.addEventListener('click', toggleSystem);

        // 4. État initial (INACTIF)
        isSystemActive = false;
        updateButtonUI(isSystemActive);
        
        // 5. Boucle d'exécution à haute fréquence (60Hz)
        setInterval(() => {
            syncH(); // Temps et Minecraft toujours mis à jour
            if (isSystemActive) {
                // Ici, vous ajouteriez la logique UKF/IMU/GPS si isSystemActive est TRUE
                // Pour l'instant, on laisse l'état UKF sur les valeurs par défaut
            }
            updateDashboard(); // Mise à jour de tous les autres éléments du DOM
        }, 1000 / 60); 

    });

})(window);
