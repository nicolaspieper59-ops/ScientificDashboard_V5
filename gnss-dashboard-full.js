// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL PROFESSIONNEL (V35)
// CORRECTION CRITIQUE V35: Ajout de la gestion des permissions DeviceMotion
// (Gère l'exception iOS et fonctionne directement sur Android).
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances critiques (Pour diagnostic) ---
    if (typeof math === 'undefined') console.error("🔴 CRITIQUE: math.js n'a pas pu être chargé. UKF sera désactivé.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 CRITIQUE: ProfessionalUKF n'est pas définie. Mode GPS brut.");

    // =================================================================
    // BLOC 1/5 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const C_L = 299792458;          
    const G_CONST = 6.67430e-11;    
    const R_AIR = 287.058;          
    const GAMMA = 1.4;              
    const P_SEA = 1013.25;          
    const T_LAPSE = 0.0065;         
    const G_ACC_STD = 9.8067;       
    const RHO_SEA = 1.225;          

    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let dt_prediction = 0.0; 
    let lastPredictionTime = Date.now();
    let lastGpsUpdateTime = 0; 
    
    let currentPosition = { lat: 43.296400, lon: 5.369700, acc: 10.0, spd: 0.0, alt: 0.0 };
    let currentSpeedMs = 0.0;   
    let rawSpeedMs = 0.0;       
    let curAcc = {x:0, y:0, z:G_ACC_STD}, curGyro = {x:0, y:0, z:0};
    let currentLongForceG = 0.0; 
    let currentVertForceG = 1.0; 
    let totalDistanceM = 0.0; 
    let timeMovementMs = 0; 
    let timeStartSession = null;
    let currentMass = 70.0;             
    let currentSpeedOfSound = 340.29;   
    let currentG_Acc = G_ACC_STD;          
    let currentPressureHpa = P_SEA;
    let currentTemperatureC = 15.0;
    let maxSpeedMs = 0.0; 
    let currentNTPOffsetMs = 0; 
    let weatherUpdateCounter = 0; 
    
    const $ = id => document.getElementById(id);
    
    // --- Utilitaires d'Affichage ---
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
    const getCDate = () => new Date(Date.now() + currentNTPOffsetMs);
    
    // =================================================================
    // BLOC 2/5 : HANDLERS DE CAPTEURS (API ROBUSUTE ET COMPATIBLE)
    // =================================================================

    /** Handler pour les données IMU (Accéléromètre et Gyroscope) */
    const handleDeviceMotion = (event) => {
        isIMUActive = true;
        
        const acc = event.accelerationIncludingGravity;
        const rot = event.rotationRate;
        
        curAcc = {
            x: acc.x || 0.0,
            y: acc.y || 0.0,
            z: acc.z || G_ACC_STD 
        };
        curGyro = {
            x: rot.alpha * D2R || 0.0, 
            y: rot.beta * D2R || 0.0,  
            z: rot.gamma * D2R || 0.0  
        };
        if ($('angular-speed')) $('angular-speed').textContent = dataOrDefault(Math.sqrt(curGyro.x**2 + curGyro.y**2 + curGyro.z**2), 3, ' rad/s');
    };

    /** Gestion de permission DeviceMotion (essentiel pour iOS, ignoré sur Android) */
    const requestMotionPermission = () => {
        // Cette API est spécifique à iOS/Safari pour des raisons de sécurité.
        // Sur Android et Chrome, elle est ignorée et le 'else' est exécuté.
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('devicemotion', handleDeviceMotion);
                        console.log("✅ Permission DeviceMotion accordée et IMU connecté.");
                    } else {
                        console.error("🔴 Permission DeviceMotion refusée par l'utilisateur.");
                        alert("Veuillez autoriser l'accès aux capteurs de mouvement (IMU) pour activer la fusion UKF.");
                        isIMUActive = false;
                    }
                })
                .catch(error => {
                    console.error("🔴 Erreur lors de la demande de permission DeviceMotion:", error);
                    alert("Erreur de permission de capteur.");
                });
        } else {
            // Chemin d'exécution Android : connexion directe de l'API robuste.
            window.addEventListener('devicemotion', handleDeviceMotion);
            console.log("✅ IMU connecté (connexion directe: Android ou non-iOS).");
        }
    };
    
    /** Handler de Succès GPS (API Geolocation Standard) */
    const handleGpsSuccess = (pos) => {
        const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
        currentPosition = { lat: latitude, lon: longitude, acc: accuracy, spd: speed || 0.0, alt: altitude || 0.0 };
        rawSpeedMs = speed || 0.0;
        lastGpsUpdateTime = Date.now(); 

        if (ukf) {
            try {
                if (!ukf.isInitialized()) {
                    ukf.initialize(latitude, longitude, altitude || 0.0);
                    gpsStatusMessage = 'Fix GPS (UKF Init OK)';
                }
                ukf.update(pos); 
                gpsStatusMessage = `Fix: ${dataOrDefault(accuracy, 1)}m`; 
            } catch (e) {
                console.error("🔴 ERREUR CRITIQUE UKF DANS LA CORRECTION GPS. UKF en mode Fallback.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
                currentSpeedMs = rawSpeedMs;
            }
        } else {
            currentSpeedMs = rawSpeedMs; 
        }
    };
    
    /** Handler d'Erreur GPS */
    const handleGpsError = (error) => {
        gpsStatusMessage = `Erreur GPS: ${error.code} (${error.message})`;
        console.error("🔴 ERREUR GPS:", error);
    };

    const initGPS = () => {
        if (gpsWatchID !== null) return;
        if (navigator.geolocation) {
            const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }; 
            gpsWatchID = navigator.geolocation.watchPosition(handleGpsSuccess, 
                handleGpsError, 
                options);
            gpsStatusMessage = 'Acquisition en cours...';
        } else {
            gpsStatusMessage = 'Non Supporté';
        }
    };

    /** Placeholder pour la fonction Météo */
    const fetchWeather = (lat, lon) => {
        return new Promise((resolve) => {
            resolve({ temp: 15.0, pressure: 1013.25, humidity: 50.0, status: 'Clair' });
        });
    };
    
    // =================================================================
    // BLOC 3/5 : LOGIQUE PHYSIQUE & DYNAMIQUE (UKF DÉRIVÉ)
    // =================================================================
    
    const calculateBarometricAltitude = (P_hPa, T_C) => {
        const T_K = T_C + 273.15;
        const P_ratio = P_hPa / P_SEA;
        if (P_ratio > 1.0) return 0.0; 
        return (T_K / T_LAPSE) * (1 - Math.pow(P_ratio, (R_AIR * T_LAPSE) / G_ACC_STD));
    };
    const getGravity = (latRad, alt) => {
        const G_E = 9.780327; 
        const sin2 = Math.sin(latRad)**2;
        const g_0 = G_E * (1 + 0.0053024 * sin2);
        return g_0 - 3.086e-6 * alt;
    };
    
    const updatePhysicalState = (fusionAlt, fusionLat) => {
        const T_K = currentTemperatureC + 273.15;
        const currentAirDensity = (currentPressureHpa * 100) / (R_AIR * T_K); 
        currentSpeedOfSound = Math.sqrt(GAMMA * R_AIR * T_K);
        currentG_Acc = getGravity(fusionLat * D2R, fusionAlt);
        
        const dynamicPressure = 0.5 * currentAirDensity * currentSpeedMs**2;
        const dragForce = 0.5 * currentAirDensity * currentSpeedMs**2 * 0.5; 
        const dragPowerKw = (dragForce * currentSpeedMs) / 1000;
        
        if ($('air-density')) $('air-density').textContent = dataOrDefault(currentAirDensity, 4, ' kg/m³');
        if ($('dynamic-pressure')) $('dynamic-pressure').textContent = dataOrDefault(dynamicPressure, 2, ' Pa');
        if ($('drag-force')) $('drag-force').textContent = dataOrDefault(dragForce, 2, ' N'); 
        if ($('drag-power-kw')) $('drag-power-kw').textContent = dataOrDefault(dragPowerKw, 2, ' kW'); 
        if ($('alt-corrected-baro')) $('alt-corrected-baro').textContent = dataOrDefault(calculateBarometricAltitude(currentPressureHpa, currentTemperatureC), 2, ' m'); 
    };
    
    const calculateGForces = (ukfState, rawAccels) => {
        if (typeof math === 'undefined' || typeof ukf.quaternionToRotationMatrix !== 'function') return;
        
        const q = [ukfState.q_w, ukfState.q_x, ukfState.q_y, ukfState.q_z]; 
        const R_mat_arr = ukf.quaternionToRotationMatrix(q).toArray(); 
        const R_mat_T = math.matrix([
            [R_mat_arr[0][0], R_mat_arr[1][0], R_mat_arr[2][0]],
            [R_mat_arr[0][1], R_mat_arr[1][1], R_mat_arr[2][1]],
            [R_mat_arr[0][2], R_mat_arr[1][2], R_mat_arr[2][2]]
        ]);
        const G_LTF_vector = math.matrix([[0], [0], [currentG_Acc]]);
        const A_body_vector = math.matrix([[rawAccels[0]], [rawAccels[1]], [rawAccels[2]]]); 
        const G_body_vector = math.multiply(R_mat_T, G_LTF_vector);
        const Net_F_body = math.subtract(A_body_vector, G_body_vector); 

        const Accel_Long_Ms2 = Net_F_body.subset(math.index(1, 0)); 
        const Accel_Vert_Ms2 = Net_F_body.subset(math.index(2, 0)); 

        currentLongForceG = Accel_Long_Ms2 / G_ACC_STD;
        currentVertForceG = Accel_Vert_Ms2 / G_ACC_STD + 1.0; 
        
        if ($('acceleration-long')) $('acceleration-long').textContent = dataOrDefault(Accel_Long_Ms2, 3, ' m/s²');
        if ($('acceleration-vert-imu')) $('acceleration-vert-imu').textContent = dataOrDefault(Accel_Vert_Ms2, 3, ' m/s²'); 
    };

    const updateRelativityAndForces = (ukfState) => {
        const alt = ukfState.alt || currentPosition.alt;
        const lat = ukfState.lat || currentPosition.lat;
        const speed = currentSpeedMs;
        const mass = currentMass;
        
        const speedOfSound = currentSpeedOfSound; 
        const mach = speed / speedOfSound;
        const beta = speed / C_L;
        const beta_sq = beta**2;
        const lorentzFactor = (beta_sq < 1) ? 1.0 / Math.sqrt(1.0 - beta_sq) : 1.0; 
        const SECONDS_PER_DAY = 86400;
        const timeDilationVelocity = (lorentzFactor - 1.0) * (SECONDS_PER_DAY * 1e9); 
        const restEnergy = mass * C_L**2; 
        const totalEnergy = lorentzFactor * restEnergy;
        const momentum = lorentzFactor * mass * speed;
        const kineticEnergy = (lorentzFactor - 1.0) * restEnergy; 
        const schwarzschildRadius = (2 * G_CONST * mass) / C_L**2; 
        const omega_e = 7.2921159e-5; 
        const CoriolisForce = 2 * mass * omega_e * Math.sin(lat * D2R) * currentSpeedMs;
        
        if ($('force-g-long')) $('force-g-long').textContent = dataOrDefault(currentLongForceG, 3, ' G');
        if ($('force-g-vert')) $('force-g-vert').textContent = dataOrDefault(currentVertForceG, 3, ' G'); 

        if ($('%speed-of-light')) $('%speed-of-light').textContent = dataOrDefaultExp(beta * 100, 2) + ' %';
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentzFactor, 9);
        if ($('time-dilation-vitesse')) $('time-dilation-vitesse').textContent = dataOrDefault(timeDilationVelocity, 4, ' ns/j');
        if ($('relativistic-energy')) $('relativistic-energy').textContent = dataOrDefaultExp(totalEnergy, 2) + ' J'; 
        if ($('rest-mass-energy')) $('rest-mass-energy').textContent = dataOrDefaultExp(restEnergy, 2) + ' J'; 
        if ($('momentum')) $('momentum').textContent = dataOrDefaultExp(momentum, 2) + ' kg·m/s'; 
        if ($('schwarzschild-radius')) $('schwarzschild-radius').textContent = dataOrDefaultExp(schwarzschildRadius, 2) + ' m'; 
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(kineticEnergy, 2, ' J'); 
        if ($('local-gravity')) $('local-gravity').textContent = dataOrDefault(currentG_Acc, 4, ' m/s²');
        if ($('coriolis-force')) $('coriolis-force').textContent = dataOrDefault(CoriolisForce, 4, ' N');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 4);
    };

    // =================================================================
    // BLOC 4/5 : MISE À JOUR DOM & CONTRÔLE
    // =================================================================
    
    const updateSpiritLevel = (pitchRad, rollRad) => {
        const MAX_OFFSET_PX = 40; 
        const P_norm = Math.min(Math.max(pitchRad, -0.5), 0.5) / 0.5;
        const R_norm = Math.min(Math.max(rollRad, -0.5), 0.5) / 0.5;

        const dx = R_norm * MAX_OFFSET_PX; 
        const dy = P_norm * MAX_OFFSET_PX * -1; 
        
        const bubble = $('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${dx}px, ${dy}px)`;
        }
    };

    function updateDashboardDOM(ukfState, isFusionActive) {
        
        const now = getCDate(); 
        const now_local = new Date(); 
        
        if ($('local-time')) $('local-time').textContent = now_local.toLocaleTimeString('fr-FR');
        if ($('utc-datetime')) $('utc-datetime').textContent = `${now.toISOString().slice(0, 10)} ${now.toUTCString().split(' ')[4]} (UTC)`;
        
        if ($('imu-status')) $('imu-status').textContent = isIMUActive ? 'Actif' : 'Inactif';
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 3, ' m/s²');
        
        const speedKmh = currentSpeedMs * KMH_MS; 
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speedKmh, 1, ' km/h'); 
        if ($('speed-status-text')) $('speed-status-text').textContent = gpsStatusMessage;

        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 5, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 5, ' m/s'); 
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 5, ' m/s');
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(totalDistanceM);
        
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(ukfState.lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(ukfState.lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = formatDistance(ukfState.alt);
        if ($('acc-gps')) $('acc-gps').textContent = formatDistance(currentPosition.acc); 
        
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage;
        
        if (isFusionActive) {
            if ($('ekf-status')) $('ekf-status').textContent = 'Actif (ZUUV/INS)';
            const pitchDeg = ukfState.pitch * R2D;
            const rollDeg = ukfState.roll * R2D;
            
            if ($('inclinaison-pitch')) $('inclinaison-pitch').textContent = dataOrDefault(pitchDeg, 1, '°');
            if ($('roulis-roll')) $('roulis-roll').textContent = dataOrDefault(rollDeg, 1, '°');
            
            updateSpiritLevel(ukfState.pitch, ukfState.roll); 
            
            try {
                const P = ukf.getStateCovariance();
                if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(3, 3)) + P.subset(math.index(4, 4))), 3, ' m/s');
                if ($('ukf-alt-sigma')) $('ukf-alt-sigma').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(2, 2))), 3, ' m'); 
            } catch(e) {
                 if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = 'N/A';
                 if ($('ukf-alt-sigma')) $('ukf-alt-sigma').textContent = 'N/A';
            }
        } else {
             if ($('ekf-status')) $('ekf-status').textContent = 'Initialisation...';
             if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = 'N/A';
             if ($('ukf-alt-sigma')) $('ukf-alt-sigma').textContent = 'N/A';
             if ($('inclinaison-pitch')) $('inclinaison-pitch').textContent = '0.0°';
             if ($('roulis-roll')) $('roulis-roll').textContent = '0.0°';
        }
    }

    const updateTimeCounters = () => {
        if (!isGpsPaused && ukf && ukf.isInitialized() && currentSpeedMs > 0.05) {
            timeMovementMs += 1000;
        }
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault((Date.now() - (timeStartSession || Date.now())) / 1000, 2, ' s');
        if ($('movement-time')) $('movement-time').textContent = dataOrDefault(timeMovementMs / 1000, 2, ' s');
    };
    
    /** Fonction principale du bouton MARCHE/PAUSE */
    const toggleGpsPause = () => {
        isGpsPaused = !isGpsPaused;
        const pauseBtn = $('gps-pause-toggle'); 
        if (isGpsPaused) {
            if (pauseBtn) pauseBtn.textContent = '▶️ MARCHE GPS';
            if (gpsWatchID !== null) navigator.geolocation.clearWatch(gpsWatchID);
            window.removeEventListener('devicemotion', handleDeviceMotion);
            isIMUActive = false;
            gpsStatusMessage = 'Arrêté (Pause)';
        } else {
            if (pauseBtn) pauseBtn.textContent = '⏸️ PAUSE GPS';
            initGPS(); 
            // Lancement de la logique de permission/connexion de l'IMU
            requestMotionPermission();
            timeStartSession = timeStartSession || Date.now();
        }
    }

    function setupEventListeners() {
        const gpsToggleButton = $('gps-pause-toggle'); 
        if (gpsToggleButton) {
            gpsToggleButton.addEventListener('click', toggleGpsPause);
        } else {
            console.error("🔴 CRITIQUE: Le bouton 'gps-pause-toggle' est manquant dans le DOM.");
        }
        if ($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', () => { totalDistanceM = 0; timeMovementMs = 0; });
        if ($('reset-max-btn')) $('reset-max-btn').addEventListener('click', () => { maxSpeedMs = 0; }); 
        if ($('mass-input')) {
            $('mass-input').addEventListener('input', (e) => {
                currentMass = parseFloat(e.target.value) || 70.0;
                if ($('mass-display')) $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
            });
        }
        if ($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => {
             totalDistanceM = 0; maxSpeedMs = 0; timeMovementMs = 0; timeStartSession = null;
             if (ukf) ukf.reset(currentPosition.lat, currentPosition.lon, currentPosition.alt);
             console.log("✅ Tableau de bord réinitialisé.");
        });
    }
    
    // =================================================================
    // BLOC 5/5 : BOUCLES PRINCIPALES
    // =================================================================
    
window.addEventListener('load', () => {
    
    if (typeof ProfessionalUKF !== 'undefined') {
        ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentPosition.alt);
    }
    
    setupEventListeners();

    // Boucle rapide (50 Hz) - Cœur de la fusion/prédiction
    setInterval(() => {
         const now = Date.now();
         dt_prediction = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         let ukfState = { 
             lat: currentPosition.lat, lon: currentPosition.lon, alt: currentPosition.alt, 
             speed: rawSpeedMs, pitch:0, roll:0, 
             q_w: 1, q_x: 0, q_y: 0, q_z: 0 
         }; 
         let isFusionActive = false;

         // PRÉDICTION UKF (INS)
         if (!isGpsPaused && ukf && typeof ukf.predict === 'function' && dt_prediction > 0 && ukf.isInitialized()) {
             try {
                 ukf.predict(dt_prediction, [curAcc.x, curAcc.y, curAcc.z], [curGyro.x, curGyro.y, curGyro.z]);
                 const state = ukf.getState(); 
                 ukfState = { 
                     ...state,
                     q_w: ukf.x.subset(math.index(6, 0)), 
                     q_x: ukf.x.subset(math.index(7, 0)),
                     q_y: ukf.x.subset(math.index(8, 0)),
                     q_z: ukf.x.subset(math.index(9, 0)),
                 };
                 currentSpeedMs = ukfState.speed; 
                 isFusionActive = true;
                 
                 calculateGForces(ukfState, [curAcc.x, curAcc.y, curAcc.z]);
                 
                 if ((now - lastGpsUpdateTime > 2000) || currentPosition.acc > 20) {
                     if (currentSpeedMs < 0.2) {
                          ukf.updateZUUV(); 
                          gpsStatusMessage = "INS (ZUUV Actif)";
                     } else {
                          gpsStatusMessage = "⚠️ PERTE GPS - MODE INERTIEL";
                     }
                 } else {
                     gpsStatusMessage = `Fix: ${dataOrDefault(currentPosition.acc, 1)}m (GPS/UKF)`;
                 }
                 
             } catch (e) {
                 console.error("🔴 ERREUR UKF CRITIQUE DANS LE THREAD HAUTE FRÉQUENCE. Arrêt de la fusion.", e);
                 currentSpeedMs = rawSpeedMs; 
                 gpsStatusMessage = 'ERREUR UKF (Arrêt Fusion)';
             }
         } else if (!isGpsPaused) {
             currentSpeedMs = rawSpeedMs; 
         }
         
         if (!isGpsPaused && currentSpeedMs > 0.05) { 
            totalDistanceM += currentSpeedMs * dt_prediction;
         }

         updateRelativityAndForces(ukfState); 
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         updateDashboardDOM(ukfState, isFusionActive); 
         
    }, 20); // 50 Hz
    
    // Boucle lente (1 Hz) - Météo/Astro/NTP/Physique
    setInterval(() => {
        updateTimeCounters(); 
        
        const fusionAlt = (ukf && ukf.isInitialized() ? ukf.getState().alt : currentPosition.alt);
        const fusionLat = (ukf && ukf.isInitialized() ? ukf.getState().lat : currentPosition.lat);
        
        if (!isGpsPaused && fusionLat !== 0.0) {
            if (weatherUpdateCounter % 60 === 0) { 
                 fetchWeather(fusionLat, fusionLon)
                     .then(data => { 
                         currentPressureHpa = data.pressure || P_SEA;
                         currentTemperatureC = data.temp || 15.0;
                         updatePhysicalState(fusionAlt, fusionLat); 
                     })
                     .catch(err => console.error("🔴 ERREUR MÉTÉO:", err));
                 weatherUpdateCounter = 0; 
             }
             weatherUpdateCounter++;

             if (typeof updateAstro === 'function') {
                 // updateAstro(fusionLat, fusionLon, fusionAlt, getCDate());
             }
        }
         updatePhysicalState(fusionAlt, fusionLat); 
    }, 1000); 
    
    toggleGpsPause(); // Démarrage par défaut en mode PAUSE
});

})(window);
