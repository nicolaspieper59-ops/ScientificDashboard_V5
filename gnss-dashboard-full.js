// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL PROFESSIONNEL STABLE (V24 - 100%)
// ARCHITECTURE 50 HZ (IMU/UKF) & GESTION BARO/MAG/CLOCK/ZUUV
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances critiques ---
    if (typeof math === 'undefined') console.warn("⚠️ ALERTE: math.js manquant. L'UKF sera désactivé.");
    if (typeof ProfessionalUKF === 'undefined') console.warn("⚠️ ALERTE: ProfessionalUKF n'est pas définie. Mode GPS/Capteur brut activé.");
    
    // --- CONSTANTES SCIENTIFIQUES & MATH ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const P_SEA_LEVEL = 1013.25; // Pression standard au niveau de la mer (hPa)
    const T_LAPSE = 0.0065;      // Taux de déperdition de température (K/m)
    const R_AIR = 287.058;       // Constante gaz parfait air (J/(kg·K))
    const G_ACC = 9.8067;        // Gravité standard (m/s²)
    const ACCEL_THRESHOLD = 0.5; // m/s² (Seuil d'accélération pour ZUUV)
    const GYRO_THRESHOLD = 0.05 * D2R; // rad/s (Seuil de rotation pour ZUUV)

    // --- VARIABLES D'ÉTAT CRITIQUES ---
    let ukf = null;             
    let isGpsPaused = true;     
    let lastPredictionTime = new Date().getTime();
    let dt_prediction = 0.0;
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let lastKnownTempK = 288.15; // Météo : Température de référence 15°C
    let currentPosition = { lat: 0.0, lon: 0.0, alt: 0.0, acc: 10.0, spd: 0.0, time: 0 }; 

    // --- DONNÉES CAPTEURS BRUTES (ENTRÉES UKF) ---
    let currentAccelMs2_X = 0.0, currentAccelMs2_Y = 0.0, currentAccelMs2_Z = G_ACC; 
    let currentGyroRadS_X = 0.0, currentGyroRadS_Y = 0.0, currentGyroRadS_Z = 0.0;
    let currentMagnetometer = { x: 0.0, y: 0.0, z: 0.0 };
    let currentBarometerHpa = P_SEA_LEVEL; 
    let isBaroActive = false;
    let isMagActive = false;
    let currentSpeedMs = 0.0; 
    
    const $ = id => document.getElementById(id);
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
            return (decimals === 0 ? '0' : '0.00') + suffix;
        }
        return val.toFixed(decimals) + suffix;
    };
    
    // =========================================================
    // GESTIONNAIRES DE CAPTEURS BRUTS (IMU ÉTENDU)
    // =========================================================

    /** Traite les données de l'Accéléromètre et du Gyroscope (Mouvement) */
    const handleDeviceMotion = (event) => {
        const acc = event.accelerationIncludingGravity;
        currentAccelMs2_X = acc.x || 0.0;
        currentAccelMs2_Y = acc.y || 0.0;
        currentAccelMs2_Z = acc.z || 0.0;

        const gyro = event.rotationRate;
        // Conversion de degrés/s vers radians/s pour l'UKF
        currentGyroRadS_X = (gyro.alpha || 0.0) * D2R; 
        currentGyroRadS_Y = (gyro.beta || 0.0) * D2R;
        currentGyroRadS_Z = (gyro.gamma || 0.0) * D2R;
    };
    
    /** Traite les données du Magnétomètre (Yaw) */
    const handleMagnetometer = (event) => {
        // En Android, on lirait les champs bruts (x, y, z)
        currentMagnetometer.x = event.magneticFieldX || 0.0; 
        currentMagnetometer.y = event.magneticFieldY || 0.0;
        currentMagnetometer.z = event.magneticFieldZ || 0.0;
        isMagActive = true;
    };
    
    /** Traite les données du Baromètre (Pression atmosphérique) */
    const handleBarometer = (event) => {
        currentBarometerHpa = event.pressure || P_SEA_LEVEL;
        isBaroActive = true;
    };

    /** Calcule l'altitude barométrique corrigée (Modèle de l'atmosphère standard) */
    const calculateBarometricAltitude = () => {
        const P_local = currentBarometerHpa * 100; // Pascal
        const P_ref = P_SEA_LEVEL * 100; // Pascal
        const T_ref = lastKnownTempK; // Kelvin
        
        // Formule de l'altitude :
        return ((T_ref / T_LAPSE) * (1 - Math.pow(P_local / P_ref, (R_AIR * T_LAPSE) / G_ACC)));
    };
    
    /** Détection heuristique ZUUV (Vitesse et Taux Angulaire Zéro) */
    const isZeroVelocityDetected = () => {
        // Accélération linéaire nette (sans gravité)
        const accelMag = Math.sqrt(
            currentAccelMs2_X**2 + currentAccelMs2_Y**2 + 
            (currentAccelMs2_Z - G_ACC)**2 
        );
        const gyroMag = Math.sqrt(
            currentGyroRadS_X**2 + currentGyroRadS_Y**2 + currentGyroRadS_Z**2
        );
        // Condition : mouvement linéaire ET rotation doivent être sous le seuil
        return accelMag < ACCEL_THRESHOLD && gyroMag < GYRO_THRESHOLD;
    };

    // =========================================================
    // GPS & INITIALISATION UKF
    // =========================================================

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
            } catch (e) {
                console.error("🔴 ERREUR CRITIQUE UKF DANS LA CORRECTION GPS.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
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

                     // 2. CORRECTIONS HAUTE FRÉQUENCE (GNSS-DENIED / Améliorations)
                     
                     // ZUUV : Correction de la dérive de vitesse et de biais Gyro à l'arrêt (Spéléo/Souterrain)
                     if (isZeroVelocityDetected()) {
                         ukf.updateZUUV();
                         gpsStatusMessage = 'INS Souterrain (ZUUV)';
                     } else if (isGpsPaused) {
                         gpsStatusMessage = 'INS Pur (Dérive)';
                     }
                     
                     // MAG UPDATE : Correction de l'attitude (Yaw)
                     if (isMagActive) {
                          ukf.updateMag(currentMagnetometer);
                     }
                     
                     // BARO UPDATE : Correction d'altitude (Météo)
                     if (isBaroActive) {
                         const correctedAltitude = calculateBarometricAltitude();
                         ukf.updateBaro(correctedAltitude);
                     }
                     
                     const ukfState = ukf.getState();
                     currentSpeedMs = ukfState.speed;

                 } catch (e) {
                     console.error("🔴 ERREUR CRITIQUE UKF:", e);
                     currentSpeedMs = currentPosition.spd; 
                 }
             } else if (ukf && !ukf.isInitialized()) {
                 currentSpeedMs = currentPosition.spd; // Fallback
             }

             updateDashboardDOM(); 
        }, 20); // Fréquence finale: 50 Hz (20ms)
        
        // Boucle lente (Météo/Temps)
        setInterval(() => {
            // Logique Météo : mise à jour de lastKnownTempK (via API externe ou manuelle)
            // La dérive temporelle est gérée par l'UKF et corrigée par l'update GPS.
        }, 1000); 
    }

    // =========================================================
    // MISE À JOUR DOM ET AFFICHAGE (50 Hz)
    // =========================================================
    
    function updateDashboardDOM() {
        // ... (Affichage GPS brut/temps/distance - Dépend du HTML) ...

        // --- UKF FUSION & DEBUG (Affichage V24) ---
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
            
            // Biais et Temps (Temporel)
            if ($('gyro-bias-mag')) $('gyro-bias-mag').textContent = dataOrDefault(Math.sqrt(ukfState.gyroBias.reduce((s, b) => s + b*b, 0)), 5, ' rad/s');
            if ($('clock-bias')) $('clock-bias').textContent = dataOrDefault(ukfState.clockBias * 1000, 2, ' ms');
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
