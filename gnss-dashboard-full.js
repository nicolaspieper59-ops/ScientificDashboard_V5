// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (GOLD MASTER V51)
// CORRECTION CRITIQUE: Vitesse 0.0 en mode Pause. Décalage NTP immédiat.
// ARCHITECTURE: Master Switch (Démarrer/Pause) + Boucle 50Hz (Fusion) / 1Hz (Astro/Temps)
// =================================================================

((window) => {
    "use strict";

    // =================================================================
    // BLOC 1/5 : UTILITAIRES, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    // --- Vérification des dépendances critiques (Pour débogage) ---
    // Ces messages vous aident si une librairie externe est manquante.
    if (typeof math === 'undefined') console.error("🔴 CRITIQUE: math.js manquant. La fusion UKF est désactivée.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 CRITIQUE: ProfessionalUKF non définie. Mode GPS brut.");
    
    // --- FONCTIONS UTILITAIRES GLOBALES ---
    const $ = id => document.getElementById(id);
    const R2D = 180 / Math.PI;          
    const KMH_MS = 3.6;                 
    
    /**
     * Formate une valeur numérique. Utilise la virgule (,) comme séparateur décimal.
     */
    const dataOrDefault = (val, decimals, suffix = '', fallback = 'N/A', forceZero = true) => {
        // Condition de 'N/A' : Undefined, Null, NaN
        if (val === undefined || val === null || isNaN(val)) {
            return fallback;
        }
        // Condition de Zéro
        if (typeof val === 'number' && Math.abs(val) < 1e-18) {
            return (0).toFixed(decimals).replace('.', ',') + suffix;
        }
        
        return val.toFixed(decimals).replace('.', ',') + suffix;
    };

    /**
     * Formate en notation exponentielle. Utilise la virgule (,) comme séparateur décimal.
     */
    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val) || Math.abs(val) < 1e-30) {
            const zeroExp = (0).toExponential(decimals).replace('.', ',');
            return zeroExp.replace('e+0', 'e+00') + suffix; 
        }
        return val.toExponential(decimals).replace('.', ',') + suffix;
    };

    // --- CONSTANTES PHYSIQUES HAUTE PRÉCISION ---
    const C_L = 299792458.0;          
    const G_ACC_STD = 9.8067;         
    const RHO_SEA_LEVEL = 1.225;      
    const SPEED_OF_SOUND_STD = 340.29; 
    
    // --- VARIABLES D'ÉTAT GLOBAL ---
    let ukf = null;                  
    let isSystemActive = false;      // Master Switch
    let ntpOffsetMs = 0;             // Décalage NTP (ms)
    let totalDistanceM = 0;          
    let maxSpeedMs = 0;              
    let currentSessionTime = 0.00;   
    let currentMovementTime = 0.00;
    let lastPredictionTime = Date.now();
    let dt_prediction = 0.0;
    let celestialBodyGravity = G_ACC_STD;

    // Variables de Fusion (GPS/UKF)
    let currentPosition = {
        lat: 43.284572, lon: 5.358710, alt: 100.0, 
        acc: 10.0, spd: 0.0, heading: 0.0 
    };
    let currentSpeedMs = 0.0;       // Vitesse Stable/UKF (m/s)
    let rawSpeedMs = 0.0;           // Vitesse Brute GPS (m/s)
    let fusionState = null;         // État complet de l'UKF
    
    // Variables IMU (Initialisées à 0.0)
    let currentAccelMs2_X = 0.0;
    let currentAccelMs2_Y = 0.0;
    let currentAccelMs2_Z = 0.0; 
    let currentGyroRadS_X = 0.0;
    let currentGyroRadS_Y = 0.0;
    let currentGyroRadS_Z = 0.0;
    let imuStatus = 'Non Supporté';

    // Variables de Jeu/Nether
    let netherMode = false;
    // const NETHER_RATIO = 8.0; // Non utilisé dans cette version simplifiée
    
    // =================================================================
    // BLOC 2/5 : GESTION DU TEMPS & DU SYSTÈME (Master Switch, NTP, Minecraft)
    // =================================================================

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
            // On demande la permission IMU au démarrage
            requestMotionPermission(); 
        } else {
            console.log("🛑 Système en pause. Boucles de calcul stoppées. Vitesse réinitialisée.");
            // CORRECTION CRITIQUE VITESSE: Remettre l'UKF et la vitesse à zéro à la pause.
            currentSpeedMs = 0.0;
            maxSpeedMs = 0.0;
            rawSpeedMs = 0.0;
            currentMovementTime = 0.0;
            // Réinitialisation de l'état UKF pour un démarrage propre (optionnel)
            if (ukf) ukf.reset(currentPosition.lat, currentPosition.lon, currentPosition.alt);
        }
    };
    
    // Logique de calcul du temps Minecraft
    const updateMinecraftTime = (totalElapsedTimeSec) => {
        const MINECRAFT_DAY_SECONDS = 1200; 
        const cycleTimeSec = totalElapsedTimeSec % MINECRAFT_DAY_SECONDS; 
        const hoursInCycle = (cycleTimeSec / MINECRAFT_DAY_SECONDS) * 24;
        const totalHours = (hoursInCycle + 6) % 24; 
        
        const hours = Math.floor(totalHours);
        const minutes = Math.floor((totalHours - hours) * 60);
        const seconds = Math.floor((totalHours * 3600 - (hours * 3600 + minutes * 60)));

        // Ajout des secondes pour plus de précision dans l'affichage du temps de jeu
        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        if ($('time-minecraft')) $('time-minecraft').textContent = timeString; 
    };
    
    /**
     * Simule la synchronisation avec un serveur de temps atomique (NTP).
     * Pour une implémentation réelle, ceci nécessiterait un appel fetch() à une API de temps.
     */
    const updateNtpOffset = () => {
        const start = Date.now();
        // Simule un décalage aléatoire (-25ms à +25ms) pour l'exemple
        const serverTimeMs = start + Math.floor(Math.random() * 50) - 25; 
        ntpOffsetMs = serverTimeMs - start;
        
        // CORRECTION: Assurer l'affichage immédiat du décalage, même si proche de zéro
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(ntpOffsetMs, 0, ' ms', 'N/A', true); 
    };

    // Boucle lente (1Hz) pour les compteurs de temps et l'Astro
    const updateTimeCounters = (initial = false) => {
        
        if (isSystemActive || initial) {
            
            // Calcul du temps de session si actif
            if (!initial && isSystemActive) {
                const now = performance.now();
                // Utilise le temps écoulé réel pour éviter les décalages de boucle
                const deltaTime = (now - (window.lastTime || now)) / 1000.0;
                window.lastTime = now;

                currentSessionTime += deltaTime;
                if (currentSpeedMs > 0.01) { currentMovementTime += deltaTime; }
            } else if (initial) {
                 window.lastTime = performance.now(); 
            }
            
            // Calcul du temps corrigé par NTP
            const localTime = new Date(Date.now() + ntpOffsetMs); 
            
            // --- MISE À JOUR DU TEMPS LOCAUX & UTC ---
            if ($('local-time')) $('local-time').textContent = localTime.toLocaleTimeString('fr-FR', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            
            // Formatage UTC (Date + Time)
            const utcDatePart = localTime.toLocaleDateString('fr-FR', {
                year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
            }).replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'); // Format YYYY-MM-DD
            
            const utcTimePart = localTime.toLocaleTimeString('fr-FR', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC'
            });

            if ($('utc-datetime')) {
                $('utc-datetime').textContent = utcDatePart + ' ' + utcTimePart + ' UTC/GMT';
            }

            // --- MISE À JOUR DES COMPTEURS ---
            if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault(currentSessionTime, 2, ' s'); 
            if ($('time-motion')) $('time-motion').textContent = dataOrDefault(currentMovementTime, 2, ' s');
            
            updateMinecraftTime(currentSessionTime); 
        }
    };
    
    // =================================================================
    // BLOC 3/5 : GESTION IMU (Entrées capteurs)
    // =================================================================

    function handleDeviceMotion(event) {
        if (!isSystemActive) return; 

        // Accélération dans le repère du corps (gravité incluse)
        const acc = event.accelerationIncludingGravity;
        currentAccelMs2_X = acc.x || 0.0;
        currentAccelMs2_Y = acc.y || 0.0;
        // La gravité étant principalement sur Z, on la soustrait si possible pour l'accélération verticale pure
        currentAccelMs2_Z = (acc.z || 0.0) - celestialBodyGravity; 

        // Vitesse angulaire (Gyroscope)
        const gyro = event.rotationRate;
        if (gyro) {
            currentGyroRadS_X = (gyro.alpha || 0.0) * Math.PI / 180;
            currentGyroRadS_Y = (gyro.beta || 0.0) * Math.PI / 180;
            currentGyroRadS_Z = (gyro.gamma || 0.0) * Math.PI / 180;
        }

        if ($('imu-status')) $('imu-status').textContent = 'Actif 🟢';
    }

    // Gestion des permissions IMU (Doit être appelée par une interaction utilisateur)
    function requestMotionPermission() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    if ($('imu-status')) $('imu-status').textContent = 'Actif 🟢 (IMU)';
                } else {
                    if ($('imu-status')) $('imu-status').textContent = 'Refusé 🛑';
                }
            }).catch(err => {
                console.error('Erreur IMU:', err);
                if ($('imu-status')) $('imu-status').textContent = 'Erreur';
            });
        } else if (typeof window.DeviceMotionEvent !== 'undefined') {
            // Navigateurs de bureau / Anciens systèmes : Démarrer directement
            window.addEventListener('devicemotion', handleDeviceMotion);
            if ($('imu-status')) $('imu-status').textContent = 'Actif (IMU)';
        } else {
             if ($('imu-status')) $('imu-status').textContent = 'Non Supporté';
        }
    }


    // =================================================================
    // BLOC 4/5 : MISE À JOUR DOM & CALCULS PHYSIQUES
    // =================================================================

    const updateDashboardDOM = () => {
        
        // --- CALCULS CRITIQUES ---
        const V_ms = currentSpeedMs; 
        // Lecture de la masse en temps réel pour les calculs dynamiques
        const M = parseFloat($('mass-input').value) || 70.0; 
        const speed_kmh = V_ms * KMH_MS; 
        
        // Relativité & Physique
        const v_ratio_c = V_ms / C_L; 
        const gamma = 1 / Math.sqrt(1 - v_ratio_c * v_ratio_c);
        const dynamic_pressure = 0.5 * RHO_SEA_LEVEL * V_ms * V_ms; 
        const kinetic_energy = 0.5 * M * V_ms * V_ms; 
        const mach_number = V_ms / SPEED_OF_SOUND_STD; 
        
        // État UKF (pour l'affichage des valeurs filtrées)
        let ukfDisplayState = fusionState || { 
            lat: currentPosition.lat, lon: currentPosition.lon, alt: currentPosition.alt, 
            speed: currentSpeedMs, roll: 0, pitch: 0, speedUncertainty: 0, altSigma: 0 
        };
        
        // --- SECTION VITESSE & RELATIVITÉ ---
        
        // Vitesse Max (mise à jour uniquement si le système est actif)
        if (isSystemActive) {
             maxSpeedMs = Math.max(maxSpeedMs, V_ms);
        }
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        // Affichage Principal
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speed_kmh, 1, ' km/h'); 
        
        // Vitesse Détaillée
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speed_kmh, 1, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(V_ms, 2, ' m/s'); 
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 2, ' m/s'); 
        
        // Physique & Relativité
        if ($('perc-speed-sound')) $('perc-speed-sound').textContent = dataOrDefault(V_ms / SPEED_OF_SOUND_STD * 100, 2, ' %'); 
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach_number, 4);
        if ($('pct-speed-of-light')) $('pct-speed-of-light').textContent = dataOrDefaultExp(v_ratio_c * 100, 2, ' %'); 
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(gamma, 4);
        
        // Dynamique & Forces (Correction: Utilisation de l'accélération pure - Gravité soustraite)
        const longAccel = Math.sqrt(currentAccelMs2_X * currentAccelMs2_X + currentAccelMs2_Y * currentAccelMs2_Y);
        if ($('accel-long')) $('accel-long').textContent = dataOrDefault(longAccel, 2, ' m/s²');
        if ($('force-g-long')) $('force-g-long').textContent = dataOrDefault(longAccel / G_ACC_STD, 2, ' G');
        if ($('accel-vert-imu')) $('accel-vert-imu').textContent = dataOrDefault(currentAccelMs2_Z, 2, ' m/s²');
        
        // --- SECTION EKF/UKF & IMU ---
        
        // Statut
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = isSystemActive ? 'ACQUISITION' : 'INACTIF';
        if ($('ekf-status')) $('ekf-status').textContent = isSystemActive ? (ukf ? 'ACTIF (FUSION)' : 'BRUT') : 'INACTIF';
        
        // Position EKF (UKF)
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(ukfDisplayState.lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(ukfDisplayState.lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = dataOrDefault(ukfDisplayState.alt, 2, ' m'); 

        // IMU (Pitch/Roll)
        if ($('inclinaison-pitch')) $('inclinaison-pitch').textContent = dataOrDefault(ukfDisplayState.pitch * R2D, 1, '°');
        if ($('roulis-roll')) $('roulis-roll').textContent = dataOrDefault(ukfDisplayState.roll * R2D, 1, '°');
        
        // IMU (Accélération & Gyro)
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(currentAccelMs2_X, 2);
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(currentAccelMs2_Y, 2);
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(currentAccelMs2_Z, 2, ' m/s²'); // z sans gravité
        if ($('vitesse-angulaire-gyro')) $('vitesse-angulaire-gyro').textContent = dataOrDefault(Math.sqrt(currentGyroRadS_X*currentGyroRadS_X + currentGyroRadS_Y*currentGyroRadS_Y + currentGyroRadS_Z*currentGyroRadS_Z), 2, ' rad/s');
        
        // Mise à jour de la bulle
        const bubble = $('bubble');
        if (bubble) {
            const maxTilt = 45; 
            const pitchDeg = ukfDisplayState.pitch * R2D;
            const rollDeg = ukfDisplayState.roll * R2D;
            
            const offsetX = (rollDeg / maxTilt) * 40; 
            const offsetY = (pitchDeg / maxTilt) * 40; 
            
            bubble.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% - ${offsetY}px))`;
        }

    }; // Fin updateDashboardDOM

    
    // Logique pour la mise à jour des données Astronomiques (dans la boucle lente)
    const updateAstroDOM = () => {
        // La fonction getSolarData est supposée venir de astro.js.
        if (!isSystemActive || typeof window.getSolarData !== 'function') return;

        try {
            const today = new Date(Date.now() + ntpOffsetMs);
            const ad = window.getSolarData(today, currentPosition.lat, currentPosition.lon, currentPosition.alt);
            
            if (!ad) return;

            // Dépendances de formatage (supposées globales si astro.js est chargé)
            const formatHours = window.formatHours || ((h) => dataOrDefault(h, 2, '', '--:--'));
            const getMoonPhaseName = window.getMoonPhaseName || ((p) => 'N/A');

            // Temps Solaire & Sidéral
            if ($('tst-time')) $('tst-time').textContent = formatHours(ad.TST_HRS);
            if ($('mst-time')) $('mst-time').textContent = formatHours(ad.MST_HRS);
            if ($('equation-of-time')) $('equation-of-time').textContent = dataOrDefault(ad.EOT_MIN, 2, ' min'); 
            if ($('true-sideral-time')) $('true-sideral-time').textContent = formatHours(ad.LST_HRS); 

            // Soleil
            if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(ad.sun.position.altitude * R2D, 2, '°');
            if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(ad.sun.position.azimuth * R2D, 2, '°'); 
            if ($('sunrise-times')) $('sunrise-times').textContent = ad.sunrise; 
            if ($('sunset-times')) $('sunset-times').textContent = ad.sunset;   
            if ($('day-duration')) $('day-duration').textContent = formatHours(ad.dayDurationHours);

            // Lune
            if ($('moon-phase-name')) $('moon-phase-name').textContent = getMoonPhaseName(ad.moon.illumination.phase);
            if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(ad.moon.illumination.fraction * 100, 1, ' %');
            if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(ad.moon.position.altitude * R2D, 2, '°');
            if ($('moon-azimuth')) $('moon-azimuth').textContent = dataOrDefault(ad.moon.position.azimuth * R2D, 2, '°'); 
            if ($('moon-distance')) $('moon-distance').textContent = dataOrDefault(ad.moon.distance / 1000, 0, ' km');
            
        } catch(e) { 
            console.warn("Échec de la mise à jour Astro (Vérifiez astro.js et ses dépendances).");
        }
    };


    // =================================================================
    // BLOC 5/5 : GESTION DES ÉVÉNEMENTS & BOUCLES PRINCIPALES
    // =================================================================

    const setupEventListeners = () => {
        // --- CONTRÔLES (Binding du Master Switch) ---
        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) btnToggle.addEventListener('click', toggleSystem);

        // --- BINDING DES BOUTONS DE RÉINITIALISATION ---
        if ($('reset-distance-btn')) $('reset-distance-btn').addEventListener('click', () => { totalDistanceM = 0; console.log("Distance réinitialisée."); });
        if ($('reset-vmax-btn')) $('reset-vmax-btn').addEventListener('click', () => { maxSpeedMs = 0; console.log("V-Max réinitialisée."); });
        if ($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => location.reload()); 
        
        // --- ENVIRONNEMENT (Changement de corps céleste) ---
        if ($('celestial-body-select')) $('celestial-body-select').addEventListener('change', (e) => {
            const body = e.target.value;
            if (body === 'MOON') celestialBodyGravity = 1.625;
            else if (body === 'MARS') celestialBodyGravity = 3.7207;
            else celestialBodyGravity = G_ACC_STD;
            console.log(`Corps Céleste changé. Gravité: ${celestialBodyGravity} m/s²`);
        });

        // --- MODE NETHER (Correction de l'ID) ---
        const netherToggleBtn = $('nether-toggle-btn'); // ID corrigé ou supposé
        if (netherToggleBtn) netherToggleBtn.addEventListener('click', () => {
            netherMode = !netherMode;
            netherToggleBtn.textContent = `Mode Nether: ${netherMode ? 'ACTIVÉ (1:8)' : 'DÉSACTIVÉ (1:1)'}`;
        });
    };


    window.addEventListener('load', () => {
        
        // 1. Initialisation UKF 
        if (typeof window.ProfessionalUKF === 'function' && typeof math !== 'undefined') { 
            ukf = new ProfessionalUKF();
            ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            fusionState = ukf.getState();
            console.log("UKF instancié et initialisé.");
        }

        // 2. Configuration des événements utilisateur
        setupEventListeners();

        // 3. État initial : OFF
        isSystemActive = false;
        currentSpeedMs = 0.0; // Force la vitesse initiale à zéro
        updateButtonUI(isSystemActive);
        
        // 4. CORRECTION NTP : Appels immédiats pour éviter les 'N/A'
        updateNtpOffset();
        updateTimeCounters(true); 
        updateDashboardDOM(); // Rendu initial pour toutes les valeurs statiques/zéro

        // 5. Boucle Rapide (20ms / 50 Hz) - UKF Prediction / DOM Render
        setInterval(() => {
            
            const currentTime = Date.now();
            dt_prediction = (currentTime - lastPredictionTime) / 1000.0;
            lastPredictionTime = currentTime;

            if (isSystemActive && ukf) {
                 // Le système est actif, la prédiction UKF est lancée
                 const rawAccels = [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z];
                 const rawGyros = [currentGyroRadS_X, currentGyroRadS_Y, currentGyroRadS_Z];
                 
                 ukf.predict(dt_prediction, rawAccels, rawGyros); 
                 
                 // Mise à jour de l'état filtré
                 fusionState = ukf.getState();
                 currentSpeedMs = fusionState.speed;
                 currentPosition.lat = fusionState.lat;
                 currentPosition.lon = fusionState.lon;
                 currentPosition.alt = fusionState.alt;

            } else if (!isSystemActive) {
                // Si en pause, on garantit que la vitesse est à zéro.
                currentSpeedMs = 0.0;
            }

            updateDashboardDOM(); // Mise à jour de tous les éléments du DOM
            
        }, 20); // 50 Hz

        // 6. Boucle Lente (1000ms / 1 Hz) - Temps / Astro / NTP
        setInterval(() => {
            updateTimeCounters(); // Mise à jour des compteurs (Session/Mvt/Minecraft)
            updateAstroDOM();     // Mise à jour des données Astro
            updateNtpOffset();    // Maintien de l'affichage du décalage NTP
        }, 1000); // 1 Hz
        
    });

})(window);
