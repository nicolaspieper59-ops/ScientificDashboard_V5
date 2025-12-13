// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL PROFESSIONNEL (V30)
// MISE À JOUR CRITIQUE V30: Intégration de la Distance 3D et des Coordonnées (Lat/Lon/Alt) 
// basée UNIQUEMENT sur la prédiction UKF à 50 Hz pour un réalisme continu.
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances critiques ---
    if (typeof math === 'undefined') console.error("🔴 math.js n'a pas pu être chargé. UKF désactivé.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 ProfessionalUKF n'est pas définie. Mode GPS brut.");

    // =================================================================
    // BLOC 1/4 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    // --- CONSTANTES SCIENTIFIQUES (SI) ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const C_L = 299792458;          // Vitesse lumière (m/s)
    const G_CONST = 6.67430e-11;    // Constante Gravitationnelle Universelle (G)
    const R_AIR = 287.058;          // Constante gaz parfait air (J/(kg·K))
    const GAMMA = 1.4;              // Indice adiabatique de l'air
    const P_SEA = 1013.25;          // Pression standard (hPa)
    const T_LAPSE = 0.0065;         // Gradient thermique (K/m)
    const G_ACC_STD = 9.8067;       // Gravité standard (m/s²)
    const RHO_SEA = 1.225;          // Densité air niveau mer (kg/m³)

    // --- VARIABLES D'ÉTAT CRITIQUES ---
    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let dt_prediction = 0.0; 
    let lastPredictionTime = Date.now();
    let lastGpsUpdateTime = 0; 

    // Position/Vitesse/Altitude (GPS Brutes pour le fallback et l'initialisation)
    let currentPosition = { lat: 43.296400, lon: 5.369700, acc: 10.0, spd: 0.0, alt: 0.0 };
    let currentSpeedMs = 0.0;   // Vitesse FUSIONNÉE (UKF)
    let rawSpeedMs = 0.0;       // Vitesse BRUTE (GPS)

    // Accélération/Forces (IMU) - Stockage pour UKF
    let curAcc = {x:0, y:0, z:G_ACC_STD}, curGyro = {x:0, y:0, z:0};
    
    // Distances
    let totalDistanceM = 0.0; // Distance intégrée UKF (3D, haute fréquence)
    let lastPosition = null;
    let timeMovementMs = 0; 
    let timeStartSession = null;
    
    // Physique/Environnement/Temps
    let currentMass = 70.0;             
    let currentAirDensity = RHO_SEA;
    let currentSpeedOfSound = 340.29;   
    let currentG_Acc = G_ACC_STD;          
    let lastKnownWeather = null;
    let maxSpeedMs = 0.0; 
    let netherMode = false;
    let currentPressureHpa = P_SEA;
    let currentTemperatureC = 15.0;
    
    // Synchronisation NTP (Temps Réel)
    let currentNTPOffsetMs = 0; 
    let lastNTPSyncTime = 0;
    
    let weatherUpdateCounter = 0; 
    
    // =================================================================
    // BLOC 2/4 : UTILITAIRES MATHS, PHYSIQUE ET TEMPS
    // =================================================================

    const $ = id => document.getElementById(id);
    
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) return 'N/A';
        if (typeof val === 'number') return val.toFixed(decimals) + suffix;
        return val;
    };
    
    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        const value = (val === undefined || val === null || isNaN(val) || typeof val !== 'number') ? 0.0 : val;
        if (Math.abs(value) > 1e6 || (Math.abs(value) < 1e-4 && value !== 0)) {
            return value.toExponential(decimals) + suffix;
        }
        return value.toFixed(decimals) + suffix;
    };

    const formatDistance = (m) => {
        if (m === undefined || m === null || isNaN(m)) return '0.000 m'; 
        if (m < 1000) return dataOrDefault(m, 2, ' m'); 
        return `${dataOrDefault(m / 1000, 3, ' km')} | ${dataOrDefault(m, 2, ' m')}`;
    };
    
    /** Synchronise l'heure avec un serveur de temps atomique. */
    const syncH = async () => {
        const now = Date.now();
        if (now - lastNTPSyncTime < 300000 && lastNTPSyncTime !== 0) return;

        try {
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            if (response.ok) {
                const data = await response.json();
                const serverTime = new Date(data.utc_datetime).getTime();
                currentNTPOffsetMs = serverTime - now;
                lastNTPSyncTime = now;
            }
        } catch (e) {
            console.warn("⚠️ Échec Synchro NTP (Mode hors ligne/local conservé).");
        }
    };

    /** Obtient la date/heure actuelle corrigée par le NTP. */
    const getCDate = () => new Date(Date.now() + currentNTPOffsetMs);
    
    /** Calcule l'altitude barométrique (m). */
    const calculateBarometricAltitude = (P_hPa, T_C) => {
        const T_K = T_C + 273.15;
        const P_ratio = P_hPa / P_SEA;
        if (P_ratio > 1.0) return 0.0; 
        return (T_K / T_LAPSE) * (1 - Math.pow(P_ratio, (R_AIR * T_LAPSE) / G_ACC_STD));
    };
    
    // Fonction de Gravité Locale
    const getGravity = (latRad, alt) => {
        const G_E = 9.780327; 
        const sin2 = Math.sin(latRad)**2;
        const g_0 = G_E * (1 + 0.0053024 * sin2);
        return g_0 - 3.086e-6 * alt;
    };
    
    /** Met à jour l'état physique (1 Hz). */
    const updatePhysicalState = (fusionAlt, fusionLat) => {
        const T_K = currentTemperatureC + 273.15;
        
        // Physique des Fluides
        currentAirDensity = (currentPressureHpa * 100) / (R_AIR * T_K); 
        currentSpeedOfSound = Math.sqrt(GAMMA * R_AIR * T_K);
        
        currentG_Acc = getGravity(fusionLat * D2R, fusionAlt);
        
        const dynamicPressure = 0.5 * currentAirDensity * currentSpeedMs**2;
        const dragForce = 0.5 * currentAirDensity * currentSpeedMs**2 * 0.5; // (Cd*A = 0.5)
        const dragPowerKw = (dragForce * currentSpeedMs) / 1000;
        
        if ($('air-density')) $('air-density').textContent = dataOrDefault(currentAirDensity, 4, ' kg/m³');
        if ($('pression-dynamique')) $('pression-dynamique').textContent = dataOrDefault(dynamicPressure, 2, ' Pa');
        if ($('drag-force')) $('drag-force').textContent = dataOrDefault(dragForce, 2, ' N'); 
        if ($('drag-power-kw')) $('drag-power-kw').textContent = dataOrDefault(dragPowerKw, 2, ' kW'); 
        if ($('altitude-corrigee-baro')) $('altitude-corrigee-baro').textContent = dataOrDefault(calculateBarometricAltitude(currentPressureHpa, currentTemperatureC), 2, ' m'); 
    };

    /** Met à jour la Relativité/Forces (50 Hz). */
    const updateRelativityAndForces = (ukfState) => {
        const alt = ukfState.alt || currentPosition.alt;
        const lat = ukfState.lat || currentPosition.lat;
        const speed = currentSpeedMs;
        const mass = currentMass;
        
        // Vitesse du Son & Mach
        const speedOfSound = currentSpeedOfSound; 
        const mach = speed / speedOfSound;
        
        // Relativité Restreinte
        const beta = speed / C_L;
        const beta_sq = beta**2;
        const lorentzFactor = (beta_sq < 1) ? 1.0 / Math.sqrt(1.0 - beta_sq) : 1.0; 
        
        const SECONDS_PER_DAY = 86400;
        const timeDilationVelocity = (lorentzFactor - 1.0) * (SECONDS_PER_DAY * 1e9); // ns/j
        
        // Relativité Complète
        const restEnergy = mass * C_L**2; 
        const totalEnergy = lorentzFactor * restEnergy;
        const momentum = lorentzFactor * mass * speed;
        const kineticEnergy = (lorentzFactor - 1.0) * restEnergy; 
        const schwarzschildRadius = (2 * G_CONST * mass) / C_L**2; 

        // Forces Inertielles
        const omega_e = 7.2921159e-5; // Vitesse angulaire Terre
        const CoriolisForce = 2 * mass * omega_e * Math.sin(lat * D2R) * currentSpeedMs;
        
        // Affichage DOM
        if ($('percent-speed-light')) $('percent-speed-light').textContent = dataOrDefaultExp(beta * 100, 2) + ' %';
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentzFactor, 9);
        if ($('time-dilation-vel')) $('time-dilation-vel').textContent = dataOrDefault(timeDilationVelocity, 4, ' ns/j');
        
        // ENERGIES CORRIGÉES
        if ($('energy-rel')) $('energy-rel').textContent = dataOrDefaultExp(totalEnergy, 2) + ' J'; 
        if ($('energy-rest')) $('energy-rest').textContent = dataOrDefaultExp(restEnergy, 2) + ' J'; 
        if ($('quantite-mouvement')) $('quantite-mouvement').textContent = dataOrDefaultExp(momentum, 2) + ' kg·m/s'; 
        if ($('schwarzschild-radius')) $('schwarzschild-radius').textContent = dataOrDefaultExp(schwarzschildRadius, 2) + ' m'; 
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(kineticEnergy, 2, ' J'); 
        
        if ($('gravity-local')) $('gravity-local').textContent = dataOrDefault(currentG_Acc, 4, ' m/s²');
        if ($('coriolis-force')) $('coriolis-force').textContent = dataOrDefault(CoriolisForce, 4, ' N');

        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 4);
        if ($('vitesse-lumiere')) $('vitesse-lumiere').textContent = dataOrDefault(C_L, 0, ' m/s');
    };

    /** Récupère les données météo (Proxy). */
    const fetchWeather = async (lat, lon) => {
        // ⚠️ REMPLACER CETTE URL PAR VOTRE URL DE PROXY MÉTÉO RÉELLE
        const proxyUrl = 'VOTRE_PROXY_URL/api/weather'; 
        try {
            const response = await fetch(`${proxyUrl}?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error(`Erreur API: ${response.status}`);
            const data = await response.json();
            
            // Mise à jour des valeurs globales
            lastKnownWeather = data;
            currentTemperatureC = data.main.temp;
            currentPressureHpa = data.main.pressure;
            
            // Affichage DOM Météo
            if ($('weather-status')) $('weather-status').textContent = 'Actif';
            if ($('temp-air')) $('temp-air').textContent = dataOrDefault(currentTemperatureC, 1, ' °C');
            if ($('pressure')) $('pressure').textContent = dataOrDefault(currentPressureHpa, 2, ' hPa');
            if ($('humidity')) $('humidity').textContent = dataOrDefault(data.main.humidity, 0, ' %');
        } catch (error) {
            console.error("Météo échec (Vérifiez votre proxyUrl)", error);
            if ($('weather-status')) $('weather-status').textContent = 'INACTIF (Proxy non configuré?)';
        }
    };
    
    // =================================================================
    // BLOC 3/4 : GESTIONNAIRES D'API (GPS, IMU)
    // =================================================================

    // --- A. IMU HANDLERS ---
    
    const handleDeviceMotion = (event) => {
        const acc = event.accelerationIncludingGravity;
        if(acc) { curAcc.x=acc.x; curAcc.y=acc.y; curAcc.z=acc.z; }
        const gyro = event.rotationRate;
        // Conversion en radians/seconde (obligatoire pour l'UKF)
        if(gyro) { curGyro.x=(gyro.alpha || 0.0) * D2R; curGyro.y=(gyro.beta || 0.0) * D2R; curGyro.z=(gyro.gamma || 0.0) * D2R; }
        isIMUActive = true;
    };
    
    // --- B. GPS HANDLERS (AVEC GESTION UKF) ---

    const handleGpsSuccess = (pos) => {
        const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
        
        currentPosition = { lat: latitude, lon: longitude, acc: accuracy, spd: speed || 0.0, alt: altitude || 0.0 };
        rawSpeedMs = speed || 0.0;
        lastGpsUpdateTime = Date.now(); 

        // Mise à jour de la dernière position brute (utile pour la carte ou le fallback, mais pas pour la distance 3D)
        lastPosition = { lat: latitude, lon: longitude };

        // --- GESTION UKF (Correction de dérive) ---
        if (ukf) {
            try {
                if (!ukf.isInitialized()) {
                    ukf.initialize(latitude, longitude, altitude || 0.0);
                    ukf.initialized = true; 
                    gpsStatusMessage = 'Fix GPS (UKF Init OK)';
                }
                ukf.update(pos); // Correction UKF (GPS Update)
                gpsStatusMessage = `Fix: ${dataOrDefault(accuracy, 1)}m`; 
                
            } catch (e) {
                console.error("🔴 ERREUR CRITIQUE UKF DANS LA CORRECTION GPS. UKF en mode Fallback.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
                currentSpeedMs = rawSpeedMs;
            }
        } else {
            currentSpeedMs = rawSpeedMs; // Mode Fallback
        }
    };

    const initGPS = () => {
        if (gpsWatchID !== null) return;
        if (navigator.geolocation) {
            const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }; 
            gpsWatchID = navigator.geolocation.watchPosition(handleGpsSuccess, 
                (error) => gpsStatusMessage = `Erreur GPS: ${error.code} (${error.message})`, 
                options);
            gpsStatusMessage = 'Acquisition en cours...';
        } else {
            gpsStatusMessage = 'Non Supporté';
        }
    };
    
    // =================================================================
    // BLOC 4/4 : CONTRÔLE, MISE À JOUR DOM ET INITIALISATION
    // =================================================================

    /** Met à jour les valeurs de l'interface du tableau de bord. */
    function updateDashboardDOM(ukfState, isFusionActive) {
        
        // --- 1. Temps (Synchro NTP) ---
        const now = getCDate(); 
        const now_local = new Date(); 
        
        if ($('local-time')) $('local-time').textContent = now_local.toLocaleTimeString('fr-FR');
        if ($('utc-datetime')) $('utc-datetime').textContent = `${now.toISOString().slice(0, 10)} ${now.toUTCString().split(' ')[4]} (UTC)`;
        
        // --- 2. IMU & Forces Brutes ---
        if ($('imu-status')) $('imu-status').textContent = isIMUActive ? 'Actif' : 'Inactif';
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 3, ' m/s²');
        
        // --- 3. Vitesse & Distance ---
        const speedKmh = currentSpeedMs * KMH_MS; 
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 5, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 5, ' m/s'); 
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 5, ' m/s');
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        const displayTotalDistance = totalDistanceM * (netherMode ? (1/8) : 1);
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(displayTotalDistance);
        
        // --- 4. Position & Astro (Utilise l'état UKF si actif) ---
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(ukfState.lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(ukfState.lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = formatDistance(ukfState.alt);
        if ($('precision-gps-acc')) $('precision-gps-acc').textContent = formatDistance(currentPosition.acc); // Affichage de l'ACC GPS (pour information)
        
        // --- 5. Filtre EKF/UKF ---
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage;
        
        if (isFusionActive) {
            if ($('ekf-status')) $('ekf-status').textContent = 'Actif (ZUUV/INS)';
            if ($('pitch')) $('pitch').textContent = dataOrDefault(ukfState.pitch * R2D, 1, '°');
            if ($('roll')) $('roll').textContent = dataOrDefault(ukfState.roll * R2D, 1, '°');
            
            try {
                const P = ukf.getStateCovariance();
                // Incertitude Vitesse Horizontale (Vx, Vy)
                if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(3, 3)) + P.subset(math.index(4, 4))), 3, ' m/s');
                // Incertitude Altitude (Z)
                if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(2, 2))), 3, ' m');
            } catch(e) {
                 if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = 'N/A';
                 if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = 'N/A';
            }
        } else {
             if ($('ekf-status')) $('ekf-status').textContent = 'Initialisation...';
             if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = 'N/A';
             if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = 'N/A';
        }
    }

    /** Met à jour les compteurs de temps. */
    const updateTimeCounters = () => {
        if (!isGpsPaused && ukf && ukf.isInitialized() && currentSpeedMs > 0.05) {
            timeMovementMs += 1000;
        }
        if ($('elapsed-session-time')) $('elapsed-session-time').textContent = dataOrDefault((Date.now() - (timeStartSession || Date.now())) / 1000, 2, ' s');
        if ($('movement-time')) $('movement-time').textContent = dataOrDefault(timeMovementMs / 1000, 2, ' s');
    };
    
    /** Bascule l'état de pause/marche. */
    const toggleGpsPause = () => {
        isGpsPaused = !isGpsPaused;
        const pauseBtn = $('gps-pause-toggle'); 
        if (isGpsPaused) {
            if (pauseBtn) pauseBtn.textContent = '▶️ MARCHE GPS';
            if (gpsWatchID !== null) navigator.geolocation.clearWatch(gpsWatchID);
            window.removeEventListener('devicemotion', handleDeviceMotion);
            gpsStatusMessage = 'Arrêté (Pause)';
        } else {
            if (pauseBtn) pauseBtn.textContent = '⏸️ PAUSE GPS';
            initGPS();
            // L'IMU est essentiel pour l'UKF/INS
            window.addEventListener('devicemotion', handleDeviceMotion); 
            syncH();
            timeStartSession = timeStartSession || Date.now();
        }
    }

    /** Attache les événements. */
    function setupEventListeners() {
        const gpsToggleButton = $('gps-pause-toggle'); 
        if (gpsToggleButton) {
            gpsToggleButton.addEventListener('click', toggleGpsPause);
        }
        if ($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', () => { totalDistanceM = 0; lastPosition = null; timeMovementMs = 0; });
        if ($('reset-vmax-btn')) $('reset-vmax-btn').addEventListener('click', () => { maxSpeedMs = 0; });
        if ($('mass-input')) {
            $('mass-input').addEventListener('input', (e) => {
                currentMass = parseFloat(e.target.value) || 70.0;
                if ($('mass-display')) $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
            });
        }
    }

    // --- INITIALISATION PRINCIPALE (ON LOAD) ---

window.addEventListener('load', () => {
    
    // 1. Initialisation des systèmes critiques
    if (typeof ProfessionalUKF !== 'undefined') {
        ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentPosition.alt);
    }
    
    setupEventListeners();

    // 2. Boucle rapide (50 Hz) - Coeur de la fusion/prédiction
    setInterval(() => {
         const now = Date.now();
         dt_prediction = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         let ukfState = { lat: currentPosition.lat, lon: currentPosition.lon, alt: currentPosition.alt, speed: rawSpeedMs, pitch:0, roll:0 }; 
         let isFusionActive = false;

         // PRÉDICTION UKF (INS)
         if (!isGpsPaused && ukf && typeof ukf.predict === 'function' && dt_prediction > 0 && ukf.isInitialized()) {
             try {
                 // Prédire l'état en utilisant les données IMU brutes corrigées des biais estimés
                 ukf.predict(dt_prediction, [curAcc.x, curAcc.y, curAcc.z], [curGyro.x, curGyro.y, curGyro.z]);
                 ukfState = ukf.getState(); 
                 currentSpeedMs = ukfState.speed; // Vitesse fusionnée 3D
                 isFusionActive = true;
                 
                 // LOGIQUE DEAD RECKONING / ZUUV (Solution pour micro-mouvements/grottes)
                 if ((now - lastGpsUpdateTime > 2000)) {
                     // Si perte de GPS (>2s)
                     if (currentSpeedMs < 0.2) {
                          ukf.updateZUUV(); // Correction de la dérive des biais IMU (ZUUV)
                          gpsStatusMessage = "INS (ZUUV Actif)";
                     } else {
                          gpsStatusMessage = "⚠️ PERTE GPS - MODE INERTIEL"; // Mode pure Dead Reckoning
                     }
                 } else {
                     gpsStatusMessage = `Fix: ${dataOrDefault(currentPosition.acc, 1)}m (GPS/UKF)`;
                 }
                 
             } catch (e) {
                 // Évite le crash en boucle
                 console.error("🔴 ERREUR UKF PREDICT. Réinitialisation du vecteur d'état.", e);
                 ukf.reset(currentPosition.lat, currentPosition.lon, currentPosition.alt);
                 currentSpeedMs = rawSpeedMs; 
                 gpsStatusMessage = 'ERREUR UKF (Reset)';
             }
         } else if (!isGpsPaused) {
             currentSpeedMs = rawSpeedMs; // Mode GPS brut si UKF non initialisé/non supporté
         }
         
         // ⚠️ NOUVEAU V30 : Intégration de la Distance 3D (Haute Fréquence IMU/UKF)
         if (!isGpsPaused && currentSpeedMs > 0.05) { // Évite l'accumulation de bruit à l'arrêt
            totalDistanceM += currentSpeedMs * dt_prediction;
         }

         // Mise à jour des calculs de physique/relativité (50Hz)
         updateRelativityAndForces(ukfState); 

         // Mise à jour du Record de Vitesse (50Hz)
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);

         // Affichage
         updateDashboardDOM(ukfState, isFusionActive); 
         
    }, 20); // 50 Hz
    
    // 3. Boucle lente (1 Hz) - Météo/Astro/NTP
    setInterval(() => {
        updateTimeCounters(); 
        
        // Les variables fusionnées doivent être utilisées pour les calculs astro/météo
        const fusionAlt = (ukf && ukf.isInitialized() ? ukf.getState().alt : currentPosition.alt);
        const fusionLat = (ukf && ukf.isInitialized() ? ukf.getState().lat : currentPosition.lat);
        
        if (!isGpsPaused && fusionLat !== 0.0) {
             
             // Astro
             if (typeof updateAstro === 'function') {
                 try {
                     updateAstro(fusionLat, fusionLat, fusionAlt, getCDate());
                 } catch (e) { console.error("🔴 ERREUR ASTRO : Échec de la mise à jour astronomique.", e); }
             }

             // Météo (Toutes les 60s)
             if (weatherUpdateCounter % 60 === 0) { 
                 fetchWeather(fusionLat, fusionLat);
                 weatherUpdateCounter = 0; 
             }
             weatherUpdateCounter++;

        }
         syncH(); 
         updatePhysicalState(fusionAlt, fusionLat); 
    }, 1000); 
    
    toggleGpsPause(); // Démarrage par défaut en mode PAUSE
});

})(window);
