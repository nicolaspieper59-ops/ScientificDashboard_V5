// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL PROFESSIONNEL STABLE (V18)
// CORRECTION CRITIQUE: 
// 1. STABILISATION DU TEMPS : Suppression de la pseudo-NTP instable. 
// 2. STABILITÉ CPU : Réduction de la fréquence UKF/DOM de 20ms à 50ms.
// 3. LOGIQUE ASTRO : Ajout de logs si updateAstro est manquante.
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances critiques (Pour débogage) ---
    if (typeof math === 'undefined') console.warn("⚠️ ALERTE: math.js manquant. L'UKF sera désactivé.");
    if (typeof ProfessionalUKF === 'undefined') console.warn("⚠️ ALERTE: ProfessionalUKF n'est pas définie. Mode GPS/Capteur brut activé.");
    if (typeof updateAstro === 'undefined') console.warn("⚠️ ALERTE: astro.js manquant. Les calculs astronomiques seront désactivés.");

    // =================================================================
    // BLOC 1/4 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    // --- CONSTANTES SCIENTIFIQUES (SI) ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             // Conversion m/s -> km/h
    const C_L = 299792458;          // Vitesse lumière (m/s)
    const R_AIR = 287.058;          // Constante gaz parfait air (J/(kg·K))
    const RHO_SEA_LEVEL = 1.225;    // Densité par défaut (kg/m³)
    const TEMP_STD_K = 288.15;      // 15°C standard

    // --- VARIABLES D'ÉTAT CRITIQUES (Gestion des ressources) ---
    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let dt_prediction = 0.0; 
    let lastPredictionTime = new Date().getTime();

    // --- VARIABLES DE DONNÉES TEMPS RÉEL ---
    // <<< CORRECTION V18 >>> : Suppression des variables de temps non nécessaires
    
    let timeStartSession = null; 
    let timeMovementMs = 0; 
    
    // Position/Vitesse/Altitude 
    let currentPosition = { lat: 43.296400, lon: 5.369700, acc: 10.0, spd: 0.0 };
    let currentAltitudeM = 0.0;
    let currentSpeedMs = 0.0;   
    let rawSpeedMs = 0.0;       

    // Accélération/Forces (IMU)
    let currentAccelMs2_X = 0.0;
    let currentAccelMs2_Y = 0.0;
    let currentAccelMs2_Z = 0.0;
    
    // Taux Angulaires (Gyroscope)
    let currentGyroRadS_X = 0.0;
    let currentGyroRadS_Y = 0.0;
    let currentGyroRadS_Z = 0.0;

    // Distances
    let totalDistanceM = 0.0;
    let lastPosition = null;

    // Physique/Environnement
    let currentMass = 70.0;             
    let currentAirDensity = RHO_SEA_LEVEL;
    let currentSpeedOfSound = 340.29;   
    let currentG_Acc = 9.8067;          
    let lastKnownWeather = null;
    let maxSpeedMs = 0.0;
    let netherMode = false;
    let linearAccel = [0.0, 0.0, 0.0]; 
    
    let weatherUpdateCounter = 0; 

    // =================================================================
    // BLOC 2/4 : UTILITAIRES DE BASE, FORMATAGE ET PHYSIQUE
    // =================================================================

    const $ = id => document.getElementById(id);
    
    /** Formate un nombre, gère N/A. */
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
             val = 0.0;
        }
        if (typeof val === 'number') {
            return val.toFixed(decimals) + suffix;
        }
        return val;
    };
    
    /** Formate en notation scientifique ou normale. */
    const dataOrDefaultExp = (val, decimals) => {
        const value = (val === undefined || val === null || isNaN(val) || typeof val !== 'number') ? 0.0 : val;
        if (Math.abs(value) > 1e6 || Math.abs(value) < 1e-4) {
            return value.toExponential(decimals);
        }
        return value.toFixed(decimals);
    };

    /** Formate une distance en m ou km. */
    const formatDistance = (m) => {
        if (m === undefined || m === null || isNaN(m)) return '0.000 m'; 
        if (m < 1000) return dataOrDefault(m, 3, ' m'); 
        return dataOrDefault(m / 1000, 3, ' km');
    };
    
    /** Obtient la date/heure (simplifiée). */
    const getCDate = () => {
        // <<< CORRECTION V18 >>> : Utilise l'heure système stable.
        return new Date(); 
    };
    
    /** Synchro NTP simple. (Ne fait rien, car l'heure est toujours à jour) */
    const syncH = () => { /* No-op */ };
    
    /** Calcule la vitesse du son (m/s) à partir de la température T_K (Kelvin). */
    const getSpeedOfSound = (T_K) => {
        return 331.3 * Math.sqrt(T_K / 273.15); 
    };
    
    /** Calcule la gravité locale (g) WGS84. */
    if (typeof window.getGravity !== 'function') {
        window.getGravity = (latRad, alt) => {
            const G_E = 9.780327; 
            const sin2 = Math.sin(latRad)**2;
            const g_0 = G_E * (1 + 0.0053024 * sin2);
            return g_0 - 3.086e-6 * alt;
        };
    }
    
    /** Met à jour les valeurs d'environnement (densité, vitesse du son, gravité). */
    const updatePhysicalState = (weatherData = lastKnownWeather) => {
        let T_K = TEMP_STD_K; 
        if (weatherData && weatherData.main && weatherData.main.temp !== undefined) {
            T_K = weatherData.main.temp + 273.15;
            const P_Pa = weatherData.main.pressure * 100;
            currentAirDensity = P_Pa / (R_AIR * T_K);
        } else {
            currentAirDensity = RHO_SEA_LEVEL;
        }
        
        currentSpeedOfSound = getSpeedOfSound(T_K);
        currentG_Acc = window.getGravity(currentPosition.lat * D2R, currentAltitudeM);
    };
    
    /** Réinitialise les compteurs de distance. */
    const resetDistance = () => { totalDistanceM = 0.0; lastPosition = null; timeMovementMs = 0; };
    
    /** Réinitialise la vitesse max. */
    const resetVmax = () => { maxSpeedMs = 0.0; };

    /** Récupère les données météo (Proxy Vercel). */
    const fetchWeather = async (lat, lon) => {
        // ⚠️ Remplacez VOTRE_PROXY_URL par l'URL de votre déploiement Vercel
        const proxyUrl = 'VOTRE_PROXY_URL/api/weather'; 
        try {
            const response = await fetch(`${proxyUrl}?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error(`Erreur API: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Erreur lors de la récupération des données météo:', error);
            return null;
        }
    };
    

    // =================================================================
    // BLOC 3/4 : GESTIONNAIRES D'API (GPS, IMU)
    // =================================================================

    // --- A. IMU HANDLERS ---
    
    /** Traite les données brutes du capteur de mouvement. */
    const handleDeviceMotion = (event) => {
        // 1. Accélération BRUTE (Inclut G)
        const acc = event.accelerationIncludingGravity;
        currentAccelMs2_X = acc.x || 0.0;
        currentAccelMs2_Y = acc.y || 0.0;
        currentAccelMs2_Z = acc.z || 0.0;

        // 2. Gyroscope (Taux angulaires)
        const gyro = event.rotationRate;
        currentGyroRadS_X = (gyro.alpha || 0.0) * D2R; 
        currentGyroRadS_Y = (gyro.beta || 0.0) * D2R;
        currentGyroRadS_Z = (gyro.gamma || 0.0) * D2R;

        // 3. Stockage des valeurs brutes pour la prédiction UKF
        linearAccel[0] = currentAccelMs2_X; 
        linearAccel[1] = currentAccelMs2_Y;
        linearAccel[2] = currentAccelMs2_Z;
    };

    /** Démarre l'écoute des capteurs IMU et gère la permission. */
    const initIMU = () => {
        const imuStatusEl = $('imu-status');
        if (isIMUActive) return;

        const setIMUStatus = (status) => {
            if (imuStatusEl) imuStatusEl.textContent = status;
            isIMUActive = (status === 'Actif');
        };

        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) {
            DeviceMotionEvent.requestPermission().then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    setIMUStatus('Actif');
                } else {
                    setIMUStatus('Refusé');
                }
            }).catch(err => { setIMUStatus('Erreur'); });
        } else if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', handleDeviceMotion);
            setIMUStatus('Actif');
        } else {
            setIMUStatus('Non Supporté');
        }
    };

    // --- B. GPS HANDLERS ---

    /** Traite une position GPS reçue. */
    const handleGpsSuccess = (pos) => {
        const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
        
        currentPosition = { lat: latitude, lon: longitude, acc: accuracy, spd: speed || 0.0 };
        rawSpeedMs = speed || 0.0;
        currentAltitudeM = altitude || 0.0;

        // Calcul de la distance parcourue
        if (lastPosition && typeof turf !== 'undefined' && typeof turf.distance === 'function') {
            const distanceKM = turf.distance(turf.point([lastPosition.lon, lastPosition.lat]), turf.point([longitude, latitude]), { units: 'kilometers' });
            totalDistanceM += distanceKM * 1000;
        }
        lastPosition = { lat: latitude, lon: longitude };

        // Mise à jour de l'UKF/EKF - Le GPS corrige l'UKF (Correction)
        if (ukf && typeof ukf.update === 'function') {
            ukf.update(pos); 
        } else {
            // Mode Fallback (UKF désactivé) : Nous utilisons la vitesse brute
            currentSpeedMs = rawSpeedMs;
        }

        maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
        
        gpsStatusMessage = `Fix: ${dataOrDefault(accuracy, 1)}m`; 
    };

    /** Gère les erreurs GPS. */
    const handleGpsError = (error) => {
        console.error('Erreur GPS:', error.message);
        if (error.code === 1) {
            gpsStatusMessage = `Erreur: 1 (Permission refusée)`;
        } else {
            gpsStatusMessage = `Erreur: ${error.code} (${error.message})`;
        }
    };
    
    /** Démarre la surveillance GPS (Geolocation API). */
    const initGPS = () => {
        if (gpsWatchID !== null) return;

        if (navigator.geolocation) {
            // Timeout court pour la haute précision
            const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }; 
            
            gpsWatchID = navigator.geolocation.watchPosition(handleGpsSuccess, handleGpsError, options);
            
            gpsStatusMessage = 'Acquisition en cours...';

        } else {
            gpsStatusMessage = 'Non Supporté';
        }
    };


    /** Calcule et affiche le temps écoulé (Session et Mouvement). */
    const updateTimeCounters = () => {
        const now = getCDate();
        
        if (timeStartSession && now) {
            const elapsedTimeMs = now.getTime() - timeStartSession.getTime();

            // Mise à jour du temps de mouvement (cette boucle s'exécute à 1000ms)
            if (currentSpeedMs > 0.05 && !isGpsPaused) { 
                timeMovementMs += 1000; 
            }

            // Affichage du temps de session
            if ($('time-elapsed')) $('time-elapsed').textContent = dataOrDefault(elapsedTimeMs / 1000, 2, ' s');
            
            // Affichage du temps de mouvement
            if ($('time-movement')) $('time-movement').textContent = dataOrDefault(timeMovementMs / 1000, 2, ' s');
        } else if ($('time-elapsed')) {
             $('time-elapsed').textContent = '0.00 s';
             if ($('time-movement')) $('time-movement').textContent = '0.00 s';
        }
    };


    // =================================================================
    // BLOC 4/4 : CONTRÔLE, MISE À JOUR DOM ET INITIALISATION
    // =================================================================

    /** Met à jour les valeurs de l'interface du tableau de bord. */
    function updateDashboardDOM() {
        // --- 1. Contrôles et Système (Correction Heure Locale/UTC) ---
        const now = getCDate(); 
        if (now) { 
            // Heure Locale (NTP)
            if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR');
            
            // Affichage UTC/GMT (Logique de formatage stable)
            if ($('utc-datetime')) {
                const utcTime = now.toUTCString().split(' ')[4];
                $('utc-datetime').textContent = `${now.toISOString().slice(0, 10)} ${utcTime} (UTC)`;
            }
        }
        
        // --- 2. IMU (Accéléromètre/Gyroscope) ---
        if ($('imu-status')) $('imu-status').textContent = isIMUActive ? 'Actif' : 'Inactif';
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(currentAccelMs2_X, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(currentAccelMs2_Y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(currentAccelMs2_Z, 3, ' m/s²');

        // --- 3. Vitesse, Distance & Relativité (5 Décimales) ---
        const speedKmh = currentSpeedMs * KMH_MS; 
        
        // Vitesse Stable (km/h) : Application de 5 décimales
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 5, ' km/h'); 
        
        // Vitesse Stable (m/s) : Application de 5 décimales
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 5, ' m/s'); 
        
        // Vitesse Brute (m/s) : Application de 5 décimales
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 5, ' m/s');
        
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        // Physique & Relativité
        if ($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = dataOrDefault(currentSpeedOfSound, 4, ' m/s');
        const mach = currentSpeedMs / currentSpeedOfSound;
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 4);
        if ($('%speed-of-light')) $('%speed-of-light').textContent = dataOrDefaultExp(currentSpeedMs / C_L * 100, 2) + ' %';
        
        // Distance
        const displayTotalDistance = totalDistanceM * (netherMode ? (1/8) : 1);
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(displayTotalDistance);
        
        // --- 4. Météo & BioSVT ---
        if ($('air-density')) $('air-density').textContent = dataOrDefault(currentAirDensity, 4, ' kg/m³');
        if (lastKnownWeather && lastKnownWeather.main) {
            if ($('weather-status')) $('weather-status').textContent = 'Actif';
            if ($('air-temp')) $('air-temp').textContent = dataOrDefault(lastKnownWeather.main.temp, 1, '°C');
            if ($('pressure')) $('pressure').textContent = dataOrDefault(lastKnownWeather.main.pressure, 0, ' hPa');
            if ($('humidity')) $('humidity').textContent = dataOrDefault(lastKnownWeather.main.humidity, 0, '%');
        } else {
             if ($('weather-status')) $('weather-status').textContent = 'INACTIF';
             if ($('air-temp')) $('air-temp').textContent = 'N/A';
             if ($('pressure')) $('pressure').textContent = 'N/A';
             if ($('humidity')) $('humidity').textContent = 'N/A';
        }

        // --- 5. Dynamique & Forces ---
        if ($('gravity-local')) $('gravity-local').textContent = dataOrDefault(currentG_Acc, 4, ' m/s²');
        if ($('drag-force')) $('drag-force').textContent = dataOrDefault(0.5 * currentAirDensity * currentSpeedMs**2 * 0.5 * 1.0, 2, ' N'); 
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(0.5 * currentMass * currentSpeedMs**2, 2, ' J');
        
        // --- 6. Position & Astro ---
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(currentPosition.lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(currentPosition.lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = formatDistance(currentAltitudeM);
        if ($('precision-gps-acc')) $('precision-gps-acc').textContent = formatDistance(currentPosition.acc);
        
        // --- 7. Filtre EKF/UKF & Debug ---
        if ($('gps-status-acquisition')) { 
             $('gps-status-acquisition').textContent = gpsStatusMessage;
        } 
        
        if (ukf && typeof ukf.getStateCovariance === 'function') {
            if (typeof math !== 'undefined') {
                const P = ukf.getStateCovariance();
                if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(P.get([3, 3]) + P.get([4, 4])), 3, ' m/s');
                if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = dataOrDefault(Math.sqrt(P.get([2, 2])), 3, ' m');
            } else {
                if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = 'N/A';
                if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = 'N/A';
            }
            
            if ($('ekf-status')) $('ekf-status').textContent = ukf.isInitialized() ? 'Actif' : 'Initialisation...';
            
            const ukfState = ukf.getState();
            if ($('pitch')) $('pitch').textContent = dataOrDefault(ukfState.pitch, 1, '°');
            if ($('roll')) $('roll').textContent = dataOrDefault(ukfState.roll, 1, '°');

        } else {
            if ($('ekf-status')) $('ekf-status').textContent = 'INACTIF (UKF Manquant)';
            if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = 'N/A';
            if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = 'N/A';
        }
    }


    /** Bascule l'état de pause/marche et gère le démarrage/l'arrêt propre du GPS et de l'IMU. */
    const toggleGpsPause = () => {
        isGpsPaused = !isGpsPaused;
        const pauseBtn = $('gps-pause-toggle'); 

        if (isGpsPaused) {
            // --- ⏸️ MODE PAUSE : ARRÊT PROPRE ---
            if (pauseBtn) pauseBtn.textContent = '▶️ MARCHE GPS';
            
            if (gpsWatchID !== null) {
                navigator.geolocation.clearWatch(gpsWatchID);
                gpsWatchID = null; 
            }
            window.removeEventListener('devicemotion', handleDeviceMotion);
            isIMUActive = false;
            
            gpsStatusMessage = 'Arrêté (Pause)';

        } else {
            // --- ▶️ MODE REPRISE : DÉMARRAGE SYNCHRONISÉ ---
            if (pauseBtn) pauseBtn.textContent = '⏸️ PAUSE GPS';
            initGPS();
            initIMU(); 
            
            if (timeStartSession === null) {
                timeStartSession = new Date();
            }
            weatherUpdateCounter = 0; 
        }
        
        updateDashboardDOM(); 
    }


    /** Attache tous les événements aux éléments DOM. */
    function setupEventListeners() {
        const gpsToggleButton = $('gps-pause-toggle'); 
        if (gpsToggleButton) {
            gpsToggleButton.addEventListener('click', toggleGpsPause);
            gpsToggleButton.textContent = isGpsPaused ? "▶️ MARCHE GPS" : "⏸️ PAUSE GPS";
        }
        
        if ($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', resetDistance);
        if ($('reset-vmax-btn')) $('reset-vmax-btn').addEventListener('click', resetVmax);
        if ($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => {
             if(confirm("Êtes-vous sûr de vouloir tout réinitialiser?")) location.reload();
        });
        
        // Masse de l'objet
        if ($('mass-input')) {
            $('mass-input').addEventListener('input', (e) => {
                currentMass = parseFloat(e.target.value) || 70.0;
                if ($('mass-display')) $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
            });
        }
        
        // Mode Nether
        if ($('nether-toggle-btn')) {
            $('nether-toggle-btn').addEventListener('click', () => {
                netherMode = !netherMode;
                $('nether-toggle-btn').textContent = `Mode Nether: ${netherMode ? 'ACTIVÉ (1:8)' : 'DÉSACTIVÉ (1:1)'}`;
            });
        }
    }

    // --- INITIALISATION PRINCIPALE (ON LOAD) ---

window.addEventListener('load', () => {
    
    // 1. Initialisation des systèmes critiques
    if (typeof math !== 'undefined' && typeof ProfessionalUKF !== 'undefined') {
        ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentAltitudeM);
        console.log("UKF instancié et prêt pour la fusion.");
    } else {
        console.error("CRITIQUE: UKF ou dépendances (math.js) introuvables. Fusion désactivée.");
    }
    
    syncH(); 
    
    // 2. Attacher les événements utilisateur
    setupEventListeners();

    // 3. Boucles de rafraîchissement
    
    // ... (lignes précédentes)

    // Boucle rapide (Affichage/Prédiction UKF) - 50ms (20 Hz)
    setInterval(() => {
         // 1. Calculer le delta-t entre les ticks (dt)
         const currentTime = new Date().getTime();
         dt_prediction = (currentTime - lastPredictionTime) / 1000.0;
         lastPredictionTime = currentTime;

         // 2. PRÉDICTION UKF (Fusion complète IMU)
         if (!isGpsPaused && ukf && typeof ukf.predict === 'function' && dt_prediction > 0) {
             
             const rawAccels = [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z];
             const rawGyros = [currentGyroRadS_X, currentGyroRadS_Y, currentGyroRadS_Z];
             
             // <<< CORRECTION CRITIQUE V19 : Try...Catch pour la stabilité UKF >>>
             try {
                 ukf.predict(dt_prediction, rawAccels, rawGyros); 
             
                 // Succès: Récupération de la vitesse après prédiction
                 const ukfState = ukf.getState();
                 currentSpeedMs = ukfState.speed;
             } catch (e) {
                 // ÉCHEC CRITIQUE: Le filtre a rencontré une erreur mathématique (NaN, singularité).
                 console.error("🔴 ERREUR CRITIQUE UKF DANS LA PRÉDICTION. Réinitialisation du filtre.", e);
                 // 1. Réinitialiser l'UKF pour une tentative de redémarrage propre
                 if (typeof ukf.reset === 'function') ukf.reset(); 
                 // 2. Basculer en mode vitesse brute pour éviter le blocage
                 currentSpeedMs = rawSpeedMs; 
                 gpsStatusMessage = 'ERREUR UKF (Réinitialisation)';
             }
             // <<< FIN CORRECTION V19 >>>
         }

         // 3. Affichage : Doit toujours se rafraîchir pour le temps local et les statuts
         updateDashboardDOM(); 
         
    }, 50); // Fréquence finale: 20 Hz (50ms)

// ... (lignes suivantes) finale: 20 Hz (50ms)
    
    // Boucle lente (Météo/Astro/NTP/Physique) - 1000ms (1Hz)
    setInterval(() => {
        updateTimeCounters(); 
        
        if (!isGpsPaused && currentPosition.lat !== 0.0 && currentPosition.lon !== 0.0) {
             
             // ACTIVATION ASTRO
             if (typeof updateAstro === 'function') {
                 const now = getCDate();
                 updateAstro(currentPosition.lat, currentPosition.lon, currentAltitudeM, now);
             } else {
                 console.warn("La fonction updateAstro() est introuvable. Les données astronomiques ne seront pas mises à jour.");
             }

             // ACTIVATION MÉTÉO (Moins fréquente)
             if (weatherUpdateCounter % 60 === 0) { 
                 fetchWeather(currentPosition.lat, currentPosition.lon)
                     .then(data => { 
                         lastKnownWeather = data;
                         updatePhysicalState(data); 
                     })
                     .catch(err => console.error("Échec du fetch météo:", err));
                 weatherUpdateCounter = 0; 
             }
             weatherUpdateCounter++;

        }
         syncH(); 
         updatePhysicalState(); 
    }, 1000); 

    // 4. Afficher l'état initial
    updateDashboardDOM();   

});

})(window);
