// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (V41)
// INTÉGRATION: UKF/INS 21 États, GPS, IMU, Magnétomètre (Bobines d'induction), Astro, Physique/Relativité.
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances critiques ---
    if (typeof math === 'undefined') console.error("🔴 CRITIQUE: math.js manquant. La fusion UKF est désactivée.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 CRITIQUE: ProfessionalUKF non définie. Mode GPS brut.");

    // =================================================================
    // BLOC 1/5 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const C_L = 299792458;          
    const G_CONST = 6.67430e-11;    
    const R_AIR = 287.058;          
    const GAMMA = 1.4;              
    const P_SEA = 1013.25;          // Pression standard au niveau de la mer (hPa)
    const G_ACC_STD = 9.8067;       // Gravité de base (m/s²)
    
    // Variables d'état global
    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let isMagActive = false;    
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let lastPredictionTime = Date.now();
    let sessionStartTime = Date.now(); 
    
    // Position de référence (Marseille par défaut si pas de GPS)
    let currentPosition = { lat: 43.284585, lon: 5.358651, alt: 100.00, acc: NaN, speed: 0 }; 
    
    // État Capteurs IMU/Mag
    // 🛑 CORRECTION CRITIQUE: Fallback pour Accélération Z
    let curAcc = {x: 0, y: 0, z: G_ACC_STD}, curGyro = {x: 0, y: 0, z: 0};
    let curMag = { x: NaN, y: NaN, z: NaN }; // Bobines d'induction (Magnétomètre)
    
    // État Physique/Fusion
    let currentTemperatureC = 15.0; // Fallback pour les calculs physiques
    let currentPressureHpa = 1013.25; // Fallback pour les calculs physiques
    let currentDensityRho = 1.225; 
    let currentSoundSpeed = 340.0; 
    let objectMass = 70.0; 

    let fusionState = null;
    let currentSpeedMs = 0.0;   
    let totalDistanceM = 0.0; 
    let maxSpeedMs = 0.0; 
    let hasGpsFixOccurred = false; 
    let astroState = null; 
    let weatherUpdateCounter = 0;

    const $ = id => document.getElementById(id);
    
    // --- Utilitaires ---
    const dataOrDefault = (val, decimals, suffix = '', hideZero = false) => {
        if (val === undefined || val === null || isNaN(val) || typeof val !== 'number') return 'N/A';
        if (hideZero && val === 0) return 'N/A';
        return val.toFixed(decimals) + suffix;
    };
    
    function formatDistance(meters) {
         if (meters < 1000) return dataOrDefault(meters, 2) + ' m';
         return dataOrDefault(meters / 1000, 3) + ' km';
    }

    const getCDate = () => new Date();

    // =================================================================
    // BLOC 2/5 : HANDLERS DE CAPTEURS (IMU, MAG & GPS)
    // =================================================================

    const handleDeviceMotion = (event) => {
        isIMUActive = true;
        const acc = event.accelerationIncludingGravity;
        const rot = event.rotationRate;
        
        if (acc) {
            curAcc.x = curAcc.x * 0.8 + (acc.x || 0.0) * 0.2;
            curAcc.y = curAcc.y * 0.8 + (acc.y || 0.0) * 0.2;
            // Z contient la gravité. Filtrage + Fallback pour éviter les 0.
            curAcc.z = curAcc.z * 0.8 + (acc.z || G_ACC_STD) * 0.2; 
        }
        if (rot) {
            curGyro.x = (rot.alpha || 0.0) * D2R; 
            curGyro.y = (rot.beta || 0.0) * D2R;  
            curGyro.z = (rot.gamma || 0.0) * D2R; 
        }
    };
    
    const handleDeviceOrientation = (event) => {
        // NOTE: Nécessite un capteur magnétique (bobines d'induction) dans l'appareil.
        // Les champs bruts nécessitent généralement un événement 'ondeviceorientationabsolute' pour les données non-compensées.
        // Ici, nous simulons l'accès aux champs magnétiques [µT] si disponibles.
        
        if (event.magneticField) {
            isMagActive = true;
            curMag.x = event.magneticField.x;
            curMag.y = event.magneticField.y;
            curMag.z = event.magneticField.z;
        } else {
             // Si le champ magnétique n'est pas disponible (cas le plus courant)
             isMagActive = false;
             curMag.x = NaN; curMag.y = NaN; curMag.z = NaN;
        }
    };

    const requestMotionPermission = () => {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            // Logique de demande de permission pour iOS 13+
            Promise.all([
                 DeviceOrientationEvent.requestPermission(),
                 DeviceMotionEvent.requestPermission()
            ]).then(([orientationState, motionState]) => {
                if (motionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    isIMUActive = true;
                }
                if (orientationState === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation);
                    isMagActive = true;
                }
            }).catch(e => console.error("Erreur de permission IMU/Mag:", e));
        } else {
            // Android ou navigateurs plus anciens
            window.addEventListener('devicemotion', handleDeviceMotion);
            window.addEventListener('deviceorientation', handleDeviceOrientation);
            isIMUActive = true; // On assume l'activation
        }
    };
    
    const handleGpsSuccess = (pos) => {
        const c = pos.coords;
        currentPosition = { lat: c.latitude, lon: c.longitude, alt: c.altitude || 0, acc: c.accuracy, speed: c.speed || 0 };
        hasGpsFixOccurred = true; // Fix GPS reçu
        
        // 1. Initialisation de l'UKF au premier Fix si non initialisé
        if (ukf && !ukf.isInitialized()) {
             ukf.initialize(c.latitude, c.longitude, c.altitude || 0);
             fusionState = ukf.getState();
        }

        // 2. Correction GPS dans l'UKF
        if (ukf && ukf.isInitialized()) {
            try {
                ukf.update(pos); 
                gpsStatusMessage = `Fix: ${dataOrDefault(c.accuracy, 1)}m (UKF)`;

            } catch (e) {
                console.error("🔴 ERREUR UKF DANS LA CORRECTION GPS.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
            }
        } else {
             gpsStatusMessage = `Acquisition OK (Précision: ${dataOrDefault(c.accuracy, 1)}m)`;
        }
    };
    
    const startGpsTracking = () => {
        if (gpsWatchID !== null) return;
        if (navigator.geolocation) {
            const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }; 
            gpsWatchID = navigator.geolocation.watchPosition(handleGpsSuccess, 
                (error) => { gpsStatusMessage = `Erreur GPS: ${error.code}`; }, 
                options);
            gpsStatusMessage = 'Acquisition en cours...';
        } else {
            gpsStatusMessage = 'GPS Non Supporté';
        }
    };

    const stopGpsTracking = () => {
        if (gpsWatchID) navigator.geolocation.clearWatch(gpsWatchID);
        gpsWatchID = null;
        gpsStatusMessage = 'Arrêté (Pause)';
    };
    
    // =================================================================
    // BLOC 3/5 : FONCTIONS PHYSIQUE ET ASTRO
    // =================================================================

    const updateTimeCounters = () => {
        const now = getCDate();
        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString();
        if ($('utc-datetime')) $('utc-datetime').textContent = now.toISOString().replace('T', ' ').split('.')[0] + ' (UTC)';
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault((Date.now() - sessionStartTime)/1000, 2, ' s');
    };
    
    /**
     * Calcule et affiche tous les champs de Physique et Relativité.
     * 🛑 CORRECTION: Utilise des valeurs de repli (fallback) pour T/P si Météo N/A.
     */
    function updatePhysicalState(altMeters, latDeg) {
        
        // --- 1. Calcul de l'état de l'air (avec Fallback) ---
        const T_C = currentTemperatureC || 15.0; // 15°C par défaut
        const P_HPA = currentPressureHpa || 1013.25; // 1013.25 hPa par défaut

        const T_K = T_C + 273.15; 
        
        if (T_K > 273.15) { 
            currentDensityRho = (P_HPA * 100) / (R_AIR * T_K); 
            currentSoundSpeed = Math.sqrt(GAMMA * R_AIR * T_K);
        } else {
             currentDensityRho = NaN;
             currentSoundSpeed = NaN;
        }

        // --- 2. AFFICHAGE PHYSIQUE / RELATIVITÉ ---
        const speedMs = currentSpeedMs || 0.0; 
        const speedRatio = speedMs / (currentSoundSpeed || 1.0);
        
        // Vitesse du Son
        if ($('vitesse-son-locale')) $('vitesse-son-locale').textContent = dataOrDefault(currentSoundSpeed, 2, ' m/s');
        if ($('pct-vitesse-son')) $('pct-vitesse-son').textContent = dataOrDefault(speedRatio * 100, 2, ' %');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(speedRatio, 4);

        // Relativité
        const beta = speedMs / C_L;
        const gamma = 1 / Math.sqrt(Math.max(1 - beta**2, 1e-9)); 
        if ($('pct-vitesse-lumiere')) $('pct-vitesse-lumiere').textContent = dataOrDefault(beta * 100, 2, 'e+0 %');
        if ($('facteur-lorentz')) $('facteur-lorentz').textContent = dataOrDefault(gamma, 4);
        
        // --- 3. DYNAMIQUE & FORCES ---
        
        const acc_long = fusionState && fusionState.acc_long ? fusionState.acc_long : 0.0; 
        // 🛑 Utilisation de curAcc.z (Gravité incluse par défaut si IMU inactif)
        const acc_vert = curAcc.z; 
        
        // Gravité locale (Approximation WGS84)
        const local_g = G_ACC_STD * (1 - 0.0026373 * Math.cos(2 * latDeg * D2R)); 
        if ($('gravite-locale-g')) $('gravite-locale-g').textContent = dataOrDefault(local_g, 4, ' m/s²');
        
        // Force G Longitudinale
        if ($('force-g-long')) $('force-g-long').textContent = dataOrDefault(acc_long / local_g, 3);
        if ($('accel-long')) $('accel-long').textContent = dataOrDefault(acc_long, 3, ' m/s²');
        // Force G Verticale (Accélération nette: (Acc_Z - G) / G)
        if ($('accel-verticale-imu')) $('accel-verticale-imu').textContent = dataOrDefault(acc_vert, 3, ' m/s²');
        if ($('force-g-verticale')) $('force-g-verticale').textContent = dataOrDefault((acc_vert - local_g) / local_g, 3); 
        
        // Mécanique des Fluides
        const Cd = 1.2; 
        const frontalArea = 0.5; 
        const pressure_dyn = 0.5 * currentDensityRho * speedMs**2;
        const force_drag = pressure_dyn * frontalArea * Cd;
        
        if ($('densite-air-rho')) $('densite-air-rho').textContent = dataOrDefault(currentDensityRho, 3, ' kg/m³');
        if ($('pression-dynamique-q')) $('pression-dynamique-q').textContent = dataOrDefault(pressure_dyn, 2, ' Pa');
        if ($('force-trainee')) $('force-trainee').textContent = dataOrDefault(force_drag, 2, ' N');
        
        // Champs & Forces
        const kinetic_energy = 0.5 * objectMass * speedMs**2;
        if ($('energie-cinetique-j')) $('energie-cinetique-j').textContent = dataOrDefault(kinetic_energy, 2, ' J');
    }
    
    // --- WRAPPER ASTRO (Liaison avec astro.js) ---
    /**
     * 🛑 CRITIQUE: Assure la liaison entre astro.js (calcul) et le script principal (affichage).
     */
    const updateAstro = (lat, lon, alt, date) => {
        if (typeof calculateAstroDataHighPrec !== 'function' || typeof getMoonPhaseName !== 'function') {
            return null;
        }

        const astroData = calculateAstroDataHighPrec(date, lat, lon);
        
        // Ajout du nom de la phase lunaire
        astroData.moon.illumination.phase_name = getMoonPhaseName(astroData.moon.illumination.phase);
        
        // Formatage des heures locales pour le DOM (Date -> HH:MM)
        const formatTimeLocal = (d) => d ? d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : 'N/A';
        astroData.sun.rise_local = formatTimeLocal(astroData.sun.sunrise);
        astroData.sun.set_local = formatTimeLocal(astroData.sun.sunset);

        // Durée du jour (calcul simple si le lever et coucher sont des objets Date valides)
        if (astroData.sun.sunset && astroData.sun.sunrise) {
            const durationMs = astroData.sun.sunset.getTime() - astroData.sun.sunrise.getTime();
            astroData.sun.duration_hrs = dataOrDefault(durationMs / 3600000, 2);
        } else {
             astroData.sun.duration_hrs = 'N/A';
        }
        
        return astroData;
    };
    
    // --- MISE À JOUR DOM ASTRO ---
    const updateAstroDOM = (astroData) => {
        if (!astroData) return;
        
        // Position & Astro - Nuit/Crépuscule
        const sunAltDeg = astroData.sun.altitude * R2D;
        const isNight = sunAltDeg < -10; 
        if ($('night-status')) $('night-status').textContent = isNight ? 'Nuit (🌙)' : 'Jour (☀️)';

        // Temps Solaire & Sidéral
        if ($('date-astro')) $('date-astro').textContent = getCDate().toLocaleDateString() || 'N/A';
        if ($('heure-solaire-vraie')) $('heure-solaire-vraie').textContent = astroData.TST_HRS || 'N/A';
        if ($('heure-solaire-moyenne')) $('heure-solaire-moyenne').textContent = astroData.MST_HRS || 'N/A';
        if ($('noon-solar-utc')) $('noon-solar-utc').textContent = astroData.NOON_SOLAR_UTC ? astroData.NOON_SOLAR_UTC.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : 'N/A';
        if ($('equation-of-time')) $('equation-of-time').textContent = dataOrDefault(parseFloat(astroData.EOT_MIN), 2, ' min');
        // Note: Le TSLV en degrés n'est pas exposé directement par astro.js mais TST est une bonne approximation.
        if ($('true-sidereal-time')) $('true-sidereal-time').textContent = astroData.TST_HRS || 'N/A'; 
        if ($('longitude-ecliptique')) $('longitude-ecliptique').textContent = dataOrDefault(parseFloat(astroData.ECL_LONG), 2, '°');

        // Soleil
        if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(sunAltDeg, 2, '°');
        if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(astroData.sun.azimuth * R2D, 2, '°');
        if ($('day-duration')) $('day-duration').textContent = astroData.sun.duration_hrs;
        if ($('sun-rise')) $('sun-rise').textContent = astroData.sun.rise_local || 'N/A'; 
        if ($('sun-set')) $('sun-set').textContent = astroData.sun.set_local || 'N/A';

        // Lune
        if ($('moon-phase')) $('moon-phase').textContent = astroData.moon.illumination.phase_name || 'N/A';
        if ($('moon-illumination')) $('moon-illumination').textContent = dataOrDefault(astroData.moon.illumination.fraction * 100, 1, ' %');
        if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(astroData.moon.position.altitude * R2D, 2, '°');
        if ($('moon-azimuth')) $('moon-azimuth').textContent = dataOrDefault(astroData.moon.position.azimuth * R2D, 2, '°');
        if ($('moon-distance')) $('moon-distance').textContent = dataOrDefault(astroData.moon.position.distance / 1000, 0, ' km');
        
        // Le Cap (Direction) est mis à jour dans updateDashboardDOM
    };

    function updateSpiritLevel(pitchRad, rollRad) {
        const MAX_OFFSET_PX = 40; 
        const P_norm = Math.min(Math.max(pitchRad, -0.5), 0.5) / 0.5;
        const R_norm = Math.min(Math.max(rollRad, -0.5), 0.5) / 0.5;
        const dx = R_norm * MAX_OFFSET_PX * 1.5; 
        const dy = P_norm * MAX_OFFSET_PX * -1.5; 
        const bubble = $('bubble');
        if (bubble) bubble.style.transform = `translate(${dx}px, ${dy}px)`;
    };


    function updateDashboardDOM(ukfState, isFusionActive) {
        
        // --- 1. IMU BRUT et Magnétomètre (Bobines d'induction) ---
        if ($('acceleration-x')) $('acceleration-x').textContent = dataOrDefault(curAcc.x, 3, ' m/s²');
        if ($('acceleration-y')) $('acceleration-y').textContent = dataOrDefault(curAcc.y, 3, ' m/s²');
        // 🛑 Affichage de Z (Gravité)
        if ($('acceleration-z')) $('acceleration-z').textContent = isIMUActive ? dataOrDefault(curAcc.z, 3, ' m/s²') : 'N/A';

        // Magnétomètre
        if ($('champ-magnetique-x')) $('champ-magnetique-x').textContent = isMagActive ? dataOrDefault(curMag.x, 3) : 'N/A';
        if ($('champ-magnetique-y')) $('champ-magnetique-y').textContent = isMagActive ? dataOrDefault(curMag.y, 3) : 'N/A';
        if ($('champ-magnetique-z')) $('champ-magnetique-z').textContent = isMagActive ? dataOrDefault(curMag.z, 3) : 'N/A';


        // --- 2. Vitesse / Distance / Position ---
        const speedMs = ukfState ? ukfState.speed : currentPosition.speed;
        const speedKmh = speedMs * KMH_MS;
        currentSpeedMs = speedMs; 

        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 5, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(speedMs, 5, ' m/s'); 
        if ($('vitesse-brute-ms')) $('vitesse-brute-ms').textContent = dataOrDefault(currentPosition.speed, 2, ' m/s'); 
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(totalDistanceM); 

        const displayLat = ukfState ? ukfState.lat : currentPosition.lat;
        const displayLon = ukfState ? ukfState.lon : currentPosition.lon;
        const displayAlt = ukfState ? ukfState.alt : currentPosition.alt;

        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(displayLat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(displayLon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = dataOrDefault(displayAlt, 2, ' m');
        if ($('acc-gps')) $('acc-gps').textContent = dataOrDefault(currentPosition.acc, 2, ' m'); 
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage;

        // --- 3. État Fusion et Niveau à Bulle ---
        // 🛑 CORRECTION LOGIQUE CRITIQUE: Statut EKF
        let fusionStatusText = 'Initialisation (UKF dormant)...';
        let pitchRad = 0;
        let rollRad = 0;
        let yawDeg = 'N/A'; // Cap (Yaw)

        if (ukf) {
            if (isFusionActive) {
                 fusionStatusText = 'Actif (INS 50Hz)'; 
            } else if (!isGpsPaused) {
                 fusionStatusText = 'Initialisation (Attente GPS)...';
            }
        }
        
        if (isFusionActive && ukfState) {
            $('ekf-status').textContent = fusionStatusText;
            pitchRad = ukfState.pitch; 
            rollRad = ukfState.roll;
            yawDeg = dataOrDefault(ukfState.yaw * R2D, 1, '°'); // Yaw vient de l'UKF (corrigé par Mag)
            if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(ukfState.cov_vel), 3, ' m/s');
        } else {
             $('ekf-status').textContent = fusionStatusText;
             // Fall back pour le niveau à bulle (IMU brut: doit être activé ou reste 0)
             if (isIMUActive) {
                rollRad = Math.atan2(curAcc.y, curAcc.z);
                pitchRad = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y**2 + curAcc.z**2));
             }
             if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = 'N/A';
        }
        
        if ($('inclinaison-pitch')) $('inclinaison-pitch').textContent = dataOrDefault(pitchRad * R2D, 1, '°');
        if ($('roulis-roll')) $('roulis-roll').textContent = dataOrDefault(rollRad * R2D, 1, '°');
        if ($('cap-direction')) $('cap-direction').textContent = yawDeg;

        updateSpiritLevel(pitchRad, rollRad); 
    }
    
    // =================================================================
    // BLOC 4/5 : BOUCLE PRINCIPALE (50 Hz) - PRÉDICTION INS & CORRECTION MAG
    // =================================================================
    
    setInterval(() => {
         
         if (isGpsPaused) {
             updateDashboardDOM(fusionState, ukf && ukf.isInitialized() && hasGpsFixOccurred); 
             return;
         }
         
         const now = Date.now();
         let dt_prediction = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         let isFusionActive = ukf && ukf.isInitialized() && hasGpsFixOccurred;
         
         // 1. PRÉDICTION UKF (INS - Propagation Inertielle)
         if (isFusionActive && dt_prediction > 0) {
             try {
                 ukf.predict(dt_prediction, [curAcc.x, curAcc.y, curAcc.z], [curGyro.x, curGyro.y, curGyro.z]);
                 fusionState = ukf.getState();
                 currentSpeedMs = fusionState.speed; 
                 
                 // 2. CORRECTION UKF : MAGNÉTOMÈTRE (Bobines d'Induction)
                 if (isMagActive && !isNaN(curMag.x)) {
                     ukf.update_Mag(curMag); 
                 }
                 
                 // Intégration de la distance
                 if (currentSpeedMs * KMH_MS > 0.1) { 
                    totalDistanceM += currentSpeedMs * dt_prediction;
                 }
                 
             } catch (e) {
                 console.error("🔴 ERREUR UKF CRITIQUE DANS LA PRÉDICTION/CORRECTION.", e);
                 // Fall back au GPS brut
                 isFusionActive = false; 
                 fusionState = null;
                 currentSpeedMs = currentPosition.speed;
             }
         } else {
             // Mode Fall Back GPS brut (pour distance et vitesse)
             currentSpeedMs = currentPosition.speed;
             fusionState = null;
             if(currentSpeedMs * KMH_MS > 0.1) totalDistanceM += currentSpeedMs * dt_prediction;
         }
         
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         updateDashboardDOM(fusionState, isFusionActive); 
         
    }, 20); // 50 Hz

    // =================================================================
    // BLOC 5/5 : INITIALISATION ET CONTRÔLES (1 Hz)
    // =================================================================
    
    setInterval(() => {
        updateTimeCounters(); 

        // Récupérer la position la plus fiable
        const fusionLat = ukf && ukf.isInitialized() ? ukf.getState().lat : currentPosition.lat;
        const fusionLon = ukf && ukf.isInitialized() ? ukf.getState().lon : currentPosition.lon;
        const fusionAlt = ukf && ukf.isInitialized() ? ukf.getState().alt : currentPosition.alt;

        // --- Logique Météo/Astro (conditionnée au Fix GPS) ---
        if (!isGpsPaused && hasGpsFixOccurred) {
            
            // 1. MÉTÉO (Simulation d'appel API toutes les 60 secondes)
            if (weatherUpdateCounter % 60 === 0) {
                 // Votre fonction réelle de fetchWeather doit mettre à jour: 
                 // currentTemperatureC et currentPressureHpa
                 console.log("Mise à jour météo simulée...");
             }
             weatherUpdateCounter = (weatherUpdateCounter + 1) % 60;

             // 2. ASTRO (Calculs et Affichage)
             if (typeof updateAstro === 'function') {
                 try {
                     astroState = updateAstro(fusionLat, fusionLon, fusionAlt, getCDate()); 
                     updateAstroDOM(astroState); 
                 } catch (e) {
                     console.error("🔴 ERREUR ASTRO : Échec de la mise à jour astronomique.", e);
                 }
             }
        }
        
        // --- 3. MISE À JOUR DE L'ÉTAT PHYSIQUE (toujours exécutée) ---
        // 🛑 CRITIQUE: Toujours appeler cette fonction pour utiliser les valeurs de repli (fallback)
         updatePhysicalState(fusionAlt, fusionLat); 

    }, 1000); 

    const togglePause = () => {
        isGpsPaused = !isGpsPaused;
        const btn = $('gps-pause-toggle');
        
        if (!isGpsPaused) {
            btn.textContent = '⏸️ PAUSE GPS';
            sessionStartTime = Date.now(); 
            requestMotionPermission(); // Demande de permission IMU/Mag ici
            startGpsTracking();
        } else {
            btn.textContent = '▶️ MARCHE GPS';
            stopGpsTracking();
        }
    };

    window.addEventListener('load', () => {
        const btn = $('gps-pause-toggle');
        if (btn) btn.addEventListener('click', togglePause);
        
        // --- Initialisation UKF ---
        if (typeof ProfessionalUKF !== 'undefined' && !ukf) {
            const refPos = currentPosition; 
            ukf = new ProfessionalUKF(refPos.lat, refPos.lon, refPos.alt);
            // L'initialisation complète se fera au premier fix GPS dans handleGpsSuccess
            fusionState = ukf.getState(); 
        }
        
        // Liaison des boutons de réinitialisation (DOIT correspondre aux IDs de votre tableau de bord)
        if($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', () => totalDistanceM = 0);
        if($('reset-max-btn')) $('reset-max-btn').addEventListener('click', () => maxSpeedMs = 0);
        if($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => { 
             totalDistanceM = 0; maxSpeedMs = 0; fusionState = null; 
             hasGpsFixOccurred = false;
             if(ukf) ukf.reset(currentPosition.lat, currentPosition.lon, currentPosition.alt);
        });
        
        updateDashboardDOM(fusionState, false); 
    });

})(window);
