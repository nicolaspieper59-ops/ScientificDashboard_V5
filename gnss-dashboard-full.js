// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL PROFESSIONNEL STABLE (V26)
// ARCHITECTURE 50 HZ (IMU/UKF), COMPATIBLE ASTRO.JS & TABLEAU SCIENTIFIQUE COMPLET
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances critiques ---
    if (typeof math === 'undefined') console.warn("⚠️ ALERTE: math.js manquant. L'UKF sera désactivé.");
    if (typeof ProfessionalUKF === 'undefined') console.warn("⚠️ ALERTE: ProfessionalUKF n'est pas définie. Mode GPS/Capteur brut activé.");
    if (typeof updateAstro === 'undefined') console.warn("⚠️ ALERTE: astro.js manquant. Les calculs astronomiques seront désactivés.");

    // --- CONSTANTES SCIENTIFIQUES (SI) ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const P_SEA_LEVEL = 1013.25; // Pression standard au niveau de la mer (hPa)
    const T_LAPSE = 0.0065;      // Taux de déperdition de température (K/m)
    const R_AIR = 287.058;       // Constante gaz parfait air (J/(kg·K))
    const GAMMA = 1.4;           // Indice adiabatique de l'air
    const G_ACC = 9.8067;        // Gravité standard (m/s²)
    const ACCEL_THRESHOLD = 0.5; 
    const GYRO_THRESHOLD = 0.05 * D2R; 

    // --- VARIABLES D'ÉTAT CRITIQUES ---
    let ukf = null;             
    let isGpsPaused = true;     
    let lastPredictionTime = new Date().getTime();
    let dt_prediction = 0.0;
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let currentNTPOffsetMs = 0; // Décalage NTP (à implémenter via une requête externe)
    let currentPressureHpa = P_SEA_LEVEL;
    let currentTemperatureC = 15; // Température de référence

    let currentPosition = { lat: 0.0, lon: 0.0, alt: 0.0, acc: 10.0, spd: 0.0, time: 0 }; 
    let currentAccelMs2_X = 0.0, currentAccelMs2_Y = 0.0, currentAccelMs2_Z = G_ACC; 
    let currentGyroRadS_X = 0.0, currentGyroRadS_Y = 0.0, currentGyroRadS_Z = 0.0;
    let currentMagnetometer = { x: 0.0, y: 0.0, z: 0.0 };
    let isBaroActive = false;
    let isMagActive = false;
    let currentSpeedMs = 0.0; 
    
    // --- Utils DOM ---
    const $ = id => document.getElementById(id);
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
            return (decimals === 0 ? 'N/A' : 'N/A') + suffix;
        }
        return val.toFixed(decimals) + suffix;
    };
    
    // =========================================================
    // UTILS TEMPS & SYNCHRONISATION
    // =========================================================
    
    /** Renvoie la date corrigée par le biais NTP */
    const getCDate = () => new Date(new Date().getTime() + currentNTPOffsetMs);

    /** Placeholder pour la synchronisation NTP */
    const syncH = () => {
        // Logique de requête NTP réelle à insérer ici
        // Pour l'instant, on suppose une synchro parfaite (offset = 0)
    };

    /** Mise à jour des compteurs de temps et de l'heure GPS/NTP */
    const updateTimeCounters = () => {
        const now = getCDate();
        const now_local = new Date();
        const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        
        if ($('time-local')) $('time-local').textContent = now_local.toLocaleTimeString('fr-FR', options);
        if ($('time-ntp')) $('time-ntp').textContent = now.toLocaleTimeString('fr-FR', options);
        
        if ($('time-gps') && ukf && ukf.isInitialized()) {
            const ukfBias = ukf.getState().clockBias; 
            const timeMs = now_local.getTime() + ukfBias * 1000;
            $('time-gps').textContent = new Date(timeMs).toLocaleTimeString('fr-FR', options);
            if ($('clock-bias')) $('clock-bias').textContent = dataOrDefault(ukfBias * 1000, 2, ' ms');
        } else {
            if ($('time-gps')) $('time-gps').textContent = 'N/A (UKF)';
        }
        
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(currentNTPOffsetMs, 0, ' ms');
    };


    // =========================================================
    // LOGIQUE DU TABLEAU SCIENTIFIQUE (PHYSIQUE)
    // =========================================================

    /** Calcule la densité de l'air (rho) à partir de l'altitude (m) et de la température (°C) */
    const calculateAirDensity = (alt, tempC) => {
        const T_local = tempC + 273.15; // Température en Kelvin
        // Modèle de l'atmosphère standard (Simplifié pour la troposphère)
        const T_sea_level = 288.15; // 15°C en K
        const RHO_SEA_LEVEL = 1.225; // kg/m³
        const pressure_ratio = Math.pow(1 - (T_LAPSE * alt / T_sea_level), G_ACC / (R_AIR * T_LAPSE));
        
        // Formule de la densité (simplifiée pour la même altitude)
        const density = RHO_SEA_LEVEL * pressure_ratio * (T_sea_level / T_local);
        return density;
    };
    
    /** Calcule l'altitude barométrique corrigée (Modèle de l'atmosphère standard) */
    const calculateBarometricAltitude = () => {
        const T_ref = currentTemperatureC + 273.15; // Kelvin
        const P_local = currentPressureHpa * 100; // Pascal
        const P_ref = P_SEA_LEVEL * 100; // Pascal
        
        // Formule de l'altitude :
        return ((T_ref / T_LAPSE) * (1 - Math.pow(P_local / P_ref, (R_AIR * T_LAPSE) / G_ACC)));
    };
    
    /** Mise à jour du Tableau Scientifique */
    const updatePhysicalState = (fusionAlt) => {
        const tempK = currentTemperatureC + 273.15;
        
        // 1. Vitesse du Son (m/s)
        const speedOfSound = Math.sqrt(GAMMA * R_AIR * tempK); // (V = sqrt(γRT))
        
        // 2. Densité de l'Air (kg/m³)
        const airDensity = calculateAirDensity(fusionAlt, currentTemperatureC);
        
        // 3. Altitude Barométrique (m) - Calculé à partir de la pression brute
        const baroAltitude = calculateBarometricAltitude(); 
        
        // 4. Pression dynamique (Pa) - Basée sur la vitesse de l'UKF
        const dynamicPressure = 0.5 * airDensity * currentSpeedMs**2;
        
        // --- MISE À JOUR DOM DU TABLEAU SCIENTIFIQUE ---
        
        // Météo/Air (Placeholders pour un fetch météo réel)
        if ($('air-temp')) $('air-temp').textContent = dataOrDefault(currentTemperatureC, 1, ' °C');
        if ($('air-pressure')) $('air-pressure').textContent = dataOrDefault(currentPressureHpa, 2, ' hPa');
        
        // Données Physique
        if ($('speed-of-sound')) $('speed-of-sound').textContent = dataOrDefault(speedOfSound, 3, ' m/s');
        if ($('air-density')) $('air-density').textContent = dataOrDefault(airDensity, 4, ' kg/m³');
        if ($('dyn-pressure')) $('dyn-pressure').textContent = dataOrDefault(dynamicPressure, 2, ' Pa');
        if ($('baro-alt')) $('baro-alt').textContent = dataOrDefault(baroAltitude, 2, ' m');
        
        // Vitesse (Mach)
        const mach = currentSpeedMs / speedOfSound;
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 3);
    };

    // =========================================================
    // CAPTEURS BRUTS & GPS
    // =========================================================

    const handleDeviceMotion = (event) => {
        const acc = event.accelerationIncludingGravity;
        currentAccelMs2_X = acc.x || 0.0;
        currentAccelMs2_Y = acc.y || 0.0;
        currentAccelMs2_Z = acc.z || 0.0;

        const gyro = event.rotationRate;
        currentGyroRadS_X = (gyro.alpha || 0.0) * D2R; 
        currentGyroRadS_Y = (gyro.beta || 0.0) * D2R;
        currentGyroRadS_Z = (gyro.gamma || 0.0) * D2R;
    };
    
    const handleMagnetometer = (event) => {
        currentMagnetometer.x = event.magneticFieldX || 0.0; 
        currentMagnetometer.y = event.magneticFieldY || 0.0;
        currentMagnetometer.z = event.magneticFieldZ || 0.0;
        isMagActive = true;
    };
    
    const handleBarometer = (event) => {
        currentPressureHpa = event.pressure || P_SEA_LEVEL;
        isBaroActive = true;
    };
    
    /** Détection heuristique ZUUV (Vitesse et Taux Angulaire Zéro) */
    const isZeroVelocityDetected = () => {
        const accelMag = Math.sqrt(
            currentAccelMs2_X**2 + currentAccelMs2_Y**2 + 
            (currentAccelMs2_Z - G_ACC)**2 
        );
        const gyroMag = Math.sqrt(
            currentGyroRadS_X**2 + currentGyroRadS_Y**2 + currentGyroRadS_Z**2
        );
        return accelMag < ACCEL_THRESHOLD && gyroMag < GYRO_THRESHOLD;
    };


    const handleGpsSuccess = (pos) => {
        const { latitude, longitude, altitude, accuracy } = pos.coords;
        currentPosition = { lat: latitude, lon: longitude, alt: altitude || 0.0, acc: accuracy, spd: pos.coords.speed || 0.0, time: pos.timestamp };

        if (ukf) {
            try {
                if (!ukf.isInitialized()) {
                    ukf.initialize(latitude, longitude, altitude || 0.0);
                }
                ukf.update(pos); 
                gpsStatusMessage = `Fix: ${accuracy.toFixed(1)}m`;
                isGpsPaused = false;
            } catch (e) {
                console.error("🔴 ERREUR CRITIQUE UKF DANS LA CORRECTION GPS.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
                // Réinitialisation de l'UKF en cas d'erreur fatale
                ukf.reset(latitude, longitude, altitude || 0.0);
            }
        } else {
            gpsStatusMessage = `Fix: ${accuracy.toFixed(1)}m`;
        }
    };
    
    const handleGpsError = (err) => {
        console.warn(`GPS ERROR(${err.code}): ${err.message}`);
        isGpsPaused = true;
        gpsStatusMessage = `GNSS-Denied (Erreur ${err.code})`;
    };
    
    function initGPS() {
        if (!navigator.geolocation) {
            gpsStatusMessage = 'GNSS-Denied (Navigateur)';
            return;
        }
        navigator.geolocation.watchPosition(handleGpsSuccess, handleGpsError, {
            enableHighAccuracy: true,
            maximumAge: 500,
            timeout: 5000 
        });
    }

    // =========================================================
    // BOUCLE PRINCIPALE DE FUSION (50 Hz)
    // =========================================================

    function startFusionLoop() {
        // Boucle rapide (Prediction UKF, IMU, Affichage) - 50 Hz
        setInterval(() => {
             const currentTime = new Date().getTime();
             dt_prediction = (currentTime - lastPredictionTime) / 1000.0;
             lastPredictionTime = currentTime;

             if (ukf && ukf.isInitialized() && dt_prediction > 0) {
                 try {
                     const rawAccels = [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z];
                     const rawGyros = [currentGyroRadS_X, currentGyroRadS_Y, currentGyroRadS_Z];
                     
                     // 1. PRÉDICTION UKF (INS)
                     ukf.predict(dt_prediction, rawAccels, rawGyros); 

                     // 2. CORRECTIONS HAUTE FRÉQUENCE
                     
                     if (isZeroVelocityDetected()) {
                         ukf.updateZUUV();
                         gpsStatusMessage = isGpsPaused ? 'INS Souterrain (ZUUV)' : gpsStatusMessage;
                     } else if (isGpsPaused) {
                         gpsStatusMessage = 'INS Pur (Dérive)';
                     }
                     
                     if (isMagActive) {
                          ukf.updateMag(currentMagnetometer);
                     }
                     
                     if (isBaroActive) {
                         const correctedAltitude = calculateBarometricAltitude();
                         ukf.updateBaro(correctedAltitude);
                     }
                     
                     const ukfState = ukf.getState();
                     currentSpeedMs = ukfState.speed;

                     // Mise à jour de l'état physique à 50Hz (utilise l'altitude fusionnée)
                     updatePhysicalState(ukfState.alt);

                 } catch (e) {
                     console.error("🔴 ERREUR CRITIQUE UKF:", e);
                     currentSpeedMs = currentPosition.spd; 
                     updatePhysicalState(currentPosition.alt); // Fallback physique
                 }
             } else {
                 currentSpeedMs = currentPosition.spd; 
                 updatePhysicalState(currentPosition.alt); // Mise à jour physique en mode brut
             }

             updateDashboardDOM(); 
        }, 20); // Fréquence finale: 50 Hz (20ms)
        
        // Boucle lente (Astro/Météo/Temps) - 1 Hz
        setInterval(() => {
            syncH(); // Synchronisation NTP/Horloge
            updateTimeCounters(); 
            
            // Mise à jour des données astronomiques (Liaison astro.js)
            if (typeof updateAstro === 'function' && !isGpsPaused) {
                 try {
                     const now = getCDate();
                     const ukfState = ukf && ukf.isInitialized() ? ukf.getState() : currentPosition;
                     
                     // Passage des états fusionnés (Lat/Lon/Alt/Heure)
                     updateAstro(ukfState.lat, ukfState.lon, ukfState.alt, now);
                 } catch (e) {
                     console.error("🔴 ERREUR ASTRO : Échec de la mise à jour astronomique (vérifiez astro.js).", e);
                 }
            }

        }, 1000); 
    }

    // =========================================================
    // MISE À JOUR DOM ET AFFICHAGE (50 Hz)
    // =========================================================
    
    function updateDashboardDOM() {
        // --- Affichage GPS Brut ---
        if ($('latitude-gps')) $('latitude-gps').textContent = dataOrDefault(currentPosition.lat, 6);
        if ($('longitude-gps')) $('longitude-gps').textContent = dataOrDefault(currentPosition.lon, 6);
        if ($('altitude-gps')) $('altitude-gps').textContent = dataOrDefault(currentPosition.alt, 3, ' m');

        // --- UKF FUSION & DEBUG ---
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage;

        if (ukf && ukf.isInitialized()) {
            const ukfState = ukf.getState();
            const P = ukf.getStateCovariance();
            
            // État fusionné (Espace)
            if ($('latitude-ekf')) $('latitude-ekf').textContent = dataOrDefault(ukfState.lat, 6);
            if ($('longitude-ekf')) $('longitude-ekf').textContent = dataOrDefault(ukfState.lon, 6);
            if ($('altitude-ekf')) $('altitude-ekf').textContent = dataOrDefault(ukfState.alt, 3, ' m');
            if ($('vitesse-stable-ms-ekf')) $('vitesse-stable-ms-ekf').textContent = dataOrDefault(ukfState.speed, 5, ' m/s');
            
            // Attitude (Espace)
            if ($('pitch')) $('pitch').textContent = dataOrDefault(ukfState.pitch, 1, '°');
            if ($('roll')) $('roll').textContent = dataOrDefault(ukfState.roll, 1, '°');
            if ($('yaw-ekf')) $('yaw-ekf').textContent = dataOrDefault(ukfState.yaw, 1, '°');

            // Incertitudes (Covariance P)
            if ($('uncertainty-pos-sigma')) $('uncertainty-pos-sigma').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(0, 0)) + P.subset(math.index(1, 1))), 2, ' m');
            if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(2, 2))), 3, ' m'); 
            
            // Biais et Statut
            if ($('gyro-bias-mag')) $('gyro-bias-mag').textContent = dataOrDefault(Math.sqrt(ukfState.gyroBias.reduce((s, b) => s + b*b, 0)), 5, ' rad/s');
            if ($('ekf-status')) $('ekf-status').textContent = 'Actif (21 États)';
        } else {
             if ($('ekf-status')) $('ekf-status').textContent = 'INACTIF / Initialisation';
        }
    }

    // =========================================================
    // INITIALISATION PRINCIPALE (ON LOAD)
    // =========================================================

    window.addEventListener('load', () => {
        if (typeof ProfessionalUKF !== 'undefined' && typeof math !== 'undefined') {
            ukf = new ProfessionalUKF();
        } 
        
        // 1. Initialisation des Event Listeners pour tous les capteurs
        if (window.DeviceMotionEvent) window.addEventListener('devicemotion', handleDeviceMotion, true);
        if (window.DeviceOrientationEvent) window.addEventListener('deviceorientation', handleMagnetometer, true);
        if ('ondevicepressurechange' in window) window.addEventListener('devicepressurechange', handleBarometer, true); 
        
        // 2. Démarrage de la géolocalisation
        initGPS();
        
        // 3. Démarrage de la boucle de fusion UKF
        startFusionLoop();
    });

})(window);
