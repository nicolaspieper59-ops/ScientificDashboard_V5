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
    const C_L = 299792458;          // Vitesse lumière (m/s)
    const G_CONST = 6.67430e-11;    // Constante Gravitationnelle Universelle (G)
    const KMH_MS = 3.6;             
    const P_SEA_LEVEL = 1013.25;    // Pression standard au niveau de la mer (hPa)
    const T_LAPSE = 0.0065;         // Taux de déperdition de température (K/m)
    const R_AIR = 287.058;          // Constante gaz parfait air (J/(kg·K))
    const GAMMA = 1.4;              // Indice adiabatique de l'air
    const G_ACC = 9.8067;           // Gravité standard (m/s²)
    const ACCEL_THRESHOLD = 0.5; 
    const GYRO_THRESHOLD = 0.05 * D2R; 

    // --- VARIABLES D'ÉTAT CRITIQUES ---
    let ukf = null;             
    let isGpsPaused = true;     
    let lastPredictionTime = new Date().getTime();
    let dt_prediction = 0.0;
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let currentNTPOffsetMs = 0; 
    let currentPressureHpa = P_SEA_LEVEL;
    let currentTemperatureC = 15; // Température de référence
    let objectMassKg = 70.0; // Masse de l'objet (kg)

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
            // Le HTML utilise "N/A" pour la plupart des valeurs initiales
            return (decimals === 0 ? 'N/A' : 'N/A') + suffix;
        }
        // Formatage spécial pour l'exponentielle si la valeur est trop petite
        if (Math.abs(val) < 1e-4 && val !== 0 && decimals > 0) {
            return val.toExponential(decimals - 1) + suffix;
        }
        return val.toFixed(decimals) + suffix;
    };
    
    // =========================================================
    // UTILS TEMPS & SYNCHRONISATION
    // =========================================================
    
    const getCDate = () => new Date(new Date().getTime() + currentNTPOffsetMs);
    const syncH = () => { /* Logique de requête NTP réelle à insérer ici */ };

    const updateTimeCounters = () => {
        const now = getCDate();
        const now_local = new Date();
        const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        const date_options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        
        // Contrôles & Système
        if ($('time-local')) $('time-local').textContent = now_local.toLocaleTimeString('fr-FR', options);
        if ($('time-ntp')) $('time-ntp').textContent = now.toLocaleTimeString('fr-FR', options);
        if ($('date-astro')) $('date-astro').textContent = now.toLocaleDateString('fr-FR', date_options); // Date (Astro)

        if ($('time-gps') && ukf && ukf.isInitialized()) {
            const ukfBias = ukf.getState().clockBias; 
            const timeMs = now_local.getTime() + ukfBias * 1000;
            $('time-gps').textContent = new Date(timeMs).toLocaleTimeString('fr-FR', options);
            if ($('clock-bias')) $('clock-bias').textContent = dataOrDefault(ukfBias * 1000, 2, ' ms');
        } else {
            if ($('time-gps')) $('time-gps').textContent = 'N/A (UKF)';
        }
        
        // Réinitialisation des compteurs simples (Temps écoulé, Temps de Mouvement - Si implémentés)
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault((now.getTime() - lastPredictionTime) / 1000, 2, ' s'); // Exemple: Temps depuis la dernière prédiction
        
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(currentNTPOffsetMs, 0, ' ms');
    };

    // =========================================================
    // LOGIQUE PHYSIQUE & RELATIVITÉ
    // =========================================================

    /** Calcule la gravité locale (WGS84) */
    const getGravity = (lat, alt) => {
        // Constantes WGS84 simplifiées (Basées sur les constantes de l'UKF)
        const G_E = 9.780327;          
        const sin_lat = Math.sin(lat * D2R);
        const g_0 = G_E * (1 + 0.0053024 * sin_lat * sin_lat);
        return g_0 - 3.086e-6 * alt; 
    };

    /** Mise à jour du Tableau Scientifique (Météo/Air/Mécanique des Fluides) */
    const updatePhysicalState = (fusionAlt, speedOfSound) => {
        const tempK = currentTemperatureC + 273.15;
        
        // 1. Densité de l'Air (kg/m³)
        const T_sea_level = 288.15; // 15°C en K
        const RHO_SEA_LEVEL = 1.225; // kg/m³
        const pressure_ratio = Math.pow(1 - (T_LAPSE * fusionAlt / T_sea_level), G_ACC / (R_AIR * T_LAPSE));
        const airDensity = RHO_SEA_LEVEL * pressure_ratio * (T_sea_level / tempK);
        
        // 2. Altitude Barométrique (m) - Calculé à partir de la pression brute
        const baroAltitude = (tempK / T_LAPSE) * (1 - Math.pow((currentPressureHpa * 100) / (P_SEA_LEVEL * 100), (R_AIR * T_LAPSE) / G_ACC));
        
        // 3. Pression dynamique (Pa)
        const dynamicPressure = 0.5 * airDensity * currentSpeedMs**2;
        
        // --- MISE À JOUR DOM : Météo & Mécanique des Fluides ---
        if ($('air-temp')) $('air-temp').textContent = dataOrDefault(currentTemperatureC, 1, ' °C');
        if ($('air-pressure')) $('air-pressure').textContent = dataOrDefault(currentPressureHpa, 2, ' hPa');
        if ($('air-density')) $('air-density').textContent = dataOrDefault(airDensity, 4, ' kg/m³');
        if ($('baro-alt')) $('baro-alt').textContent = dataOrDefault(baroAltitude, 2, ' m'); // Altitude Corrigée (Baro)
        if ($('dyn-pressure')) $('dyn-pressure').textContent = dataOrDefault(dynamicPressure, 2, ' Pa');
    };
    
    /** Mise à jour des valeurs de Relativité et Forces */
    const updateRelativityAndForces = (ukfState) => {
        const alt = ukfState.alt;
        const lat = ukfState.lat;
        const speed = currentSpeedMs;
        const mass = objectMassKg;
        
        // --- Vitesse du Son ---
        const tempK = currentTemperatureC + 273.15;
        const speedOfSound = Math.sqrt(GAMMA * R_AIR * tempK); 
        const mach = speed / speedOfSound;
        const speedOfSoundPercent = (speed / speedOfSound) * 100;

        if ($('speed-of-sound')) $('speed-of-sound').textContent = dataOrDefault(speedOfSound, 3, ' m/s');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 3);
        if ($('percent-speed-sound')) $('percent-speed-sound').textContent = dataOrDefault(speedOfSoundPercent, 2, ' %'); // % Vitesse du Son
        
        // --- Relativité ---
        const v_c_ratio = speed / C_L;
        const lorentzFactor = 1.0 / Math.sqrt(1.0 - v_c_ratio**2);
        const timeDilationVelocity = (lorentzFactor - 1.0) * (365.25 * 24 * 3600 * 1e9); // ns/an (ns/j)
        
        const restEnergy = mass * C_L**2; 
        const kineticEnergy = (lorentzFactor - 1) * restEnergy;
        const totalEnergy = lorentzFactor * restEnergy;

        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 3);
        if ($('percent-speed-light')) $('percent-speed-light').textContent = dataOrDefault(v_c_ratio * 100, 2, ' %');
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentzFactor, 4);
        if ($('time-dilation-vel')) $('time-dilation-vel').textContent = dataOrDefault(timeDilationVelocity, 2, ' ns/j');
        if ($('energy-rel')) $('energy-rel').textContent = dataOrDefault(totalEnergy, 2, ' J'); // Énergie Relativiste (E)
        if ($('energy-rest')) $('energy-rest').textContent = dataOrDefault(restEnergy, 2, ' J'); // Énergie de Masse au Repos (E₀)
        if ($('quantite-mouvement')) $('quantite-mouvement').textContent = dataOrDefault(lorentzFactor * mass * speed, 2, ' kg·m/s'); // Quantité de Mouvement (p)
        
        // Affichage des constantes
        if ($('vitesse-lumiere')) $('vitesse-lumiere').textContent = dataOrDefault(C_L, 0, ' m/s');
        if ($('G-universelle')) $('G-universelle').textContent = dataOrDefault(G_CONST, 12, ' m³/kg/s²'); 
        
        // --- Gravité & Forces ---
        const g_local = getGravity(lat, alt); 
        const omega_e = 7.2921159e-5; // Vitesse angulaire Terre rad/s
        const CoriolisForce = 2 * mass * omega_e * Math.sin(lat * D2R) * currentSpeedMs;

        if ($('gravity-local')) $('gravity-local').textContent = dataOrDefault(g_local, 4, ' m/s²');
        if ($('coriolis-force')) $('coriolis-force').textContent = dataOrDefault(CoriolisForce, 2, ' N');
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(kineticEnergy, 2, ' J'); // Énergie Cinétique
        if ($('mass-object')) $('mass-object').textContent = dataOrDefault(mass, 3, ' kg');

        updatePhysicalState(alt, speedOfSound); // Met à jour le reste du tableau physique
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
             
             let fusionState = { lat: currentPosition.lat, lon: currentPosition.lon, alt: currentPosition.alt, speed: currentPosition.spd, pitch: 0.0, roll: 0.0, yaw: 0.0 };

             if (ukf && ukf.isInitialized() && dt_prediction > 0) {
                 try {
                     const rawAccels = [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z];
                     const rawGyros = [currentGyroRadS_X, currentGyroRadS_Y, currentGyroRadS_Z];
                     
                     ukf.predict(dt_prediction, rawAccels, rawGyros); 

                     if (isZeroVelocityDetected()) ukf.updateZUUV();
                     if (isMagActive) ukf.updateMag(currentMagnetometer);
                     if (isBaroActive) ukf.updateBaro(calculateBarometricAltitude());
                     
                     fusionState = ukf.getState();
                     currentSpeedMs = fusionState.speed;

                 } catch (e) {
                     console.error("🔴 ERREUR CRITIQUE UKF:", e);
                     currentSpeedMs = currentPosition.spd; 
                 }
             } else {
                 currentSpeedMs = currentPosition.spd;
             }
             
             // Mise à jour complète du DOM à chaque tick (50Hz)
             updateDashboardDOM(fusionState); 
             updateRelativityAndForces(fusionState); // Met à jour tout le tableau scientifique
             
        }, 20); // Fréquence finale: 50 Hz (20ms)
        
        // Boucle lente (Astro/Météo/Temps) - 1 Hz
        setInterval(() => {
            syncH(); 
            updateTimeCounters(); 
            
            // Mise à jour des données astronomiques (Liaison astro.js)
            if (typeof updateAstro === 'function' && !isGpsPaused) {
                 try {
                     const now = getCDate();
                     const ukfState = ukf && ukf.isInitialized() ? ukf.getState() : currentPosition;
                     
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
    
    function updateDashboardDOM(fusionState) {
        
        // --- Statuts et IMU (Affichage des données brutes en temps réel) ---
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage;
        
        // IMU
        if ($('accel-x-raw')) $('accel-x-raw').textContent = dataOrDefault(currentAccelMs2_X, 3, ' m/s²'); // Accélération X
        if ($('accel-y-raw')) $('accel-y-raw').textContent = dataOrDefault(currentAccelMs2_Y, 3, ' m/s²'); // Accélération Y
        if ($('accel-z-raw')) $('accel-z-raw').textContent = dataOrDefault(currentAccelMs2_Z, 3, ' m/s²'); // Accélération Z (IMU)
        if ($('gyro-mag-raw')) $('gyro-mag-raw').textContent = dataOrDefault(Math.sqrt(currentGyroRadS_X**2 + currentGyroRadS_Y**2 + currentGyroRadS_Z**2) * R2D, 1, ' °/s'); // Vitesse Angulaire (Gyro)
        
        // --- Vitesse et Distance ---
        if ($('vitesse-stable-ms-ekf')) $('vitesse-stable-ms-ekf').textContent = dataOrDefault(fusionState.speed, 5, ' m/s');
        if ($('vitesse-stable-kmh-ekf')) $('vitesse-stable-kmh-ekf').textContent = dataOrDefault(fusionState.speed * KMH_MS, 1, ' km/h');
        
        // --- Filtre EKF/UKF & Position ---
        if (ukf && ukf.isInitialized()) {
            const P = ukf.getStateCovariance();
            
            // Position fusionnée
            if ($('latitude-ekf')) $('latitude-ekf').textContent = dataOrDefault(fusionState.lat, 6);
            if ($('longitude-ekf')) $('longitude-ekf').textContent = dataOrDefault(fusionState.lon, 6);
            if ($('altitude-ekf')) $('altitude-ekf').textContent = dataOrDefault(fusionState.alt, 3, ' m');
            
            // Attitude
            if ($('pitch')) $('pitch').textContent = dataOrDefault(fusionState.pitch, 1, '°');
            if ($('roll')) $('roll').textContent = dataOrDefault(fusionState.roll, 1, '°');
            if ($('yaw-ekf')) $('yaw-ekf').textContent = dataOrDefault(fusionState.yaw, 1, '°');

            // Incertitudes
            if ($('uncertainty-pos-sigma')) $('uncertainty-pos-sigma').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(0, 0)) + P.subset(math.index(1, 1))), 2, ' m');
            if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(2, 2))), 3, ' m'); 
            if ($('ekf-status')) $('ekf-status').textContent = 'Actif (21 États)';
            
            // Vitesse Verticale
            if ($('vitesse-verticale-ekf')) $('vitesse-verticale-ekf').textContent = dataOrDefault(-fusionState.vel_D, 3, ' m/s'); // vel_D est 'Bas', on veut 'Haut'
            
        } else {
             if ($('ekf-status')) $('ekf-status').textContent = 'INACTIF / Initialisation';
             // Affichage des valeurs GPS brutes si UKF inactif
             if ($('latitude-ekf')) $('latitude-ekf').textContent = dataOrDefault(fusionState.lat, 6);
             if ($('longitude-ekf')) $('longitude-ekf').textContent = dataOrDefault(fusionState.lon, 6);
             if ($('altitude-ekf')) $('altitude-ekf').textContent = dataOrDefault(fusionState.alt, 3, ' m');
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
