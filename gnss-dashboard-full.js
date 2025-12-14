// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL PROFESSIONNEL (V36 - ROBUSTESSE MAX)
// CORRECTION V36: Protection accrue des fonctions mathématiques UKF.
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
        
        // V36: Assure que les valeurs par défaut sont appliquées si l'API est partielle
        const acc = event.accelerationIncludingGravity;
        const rot = event.rotationRate;
        
        curAcc = {
            x: acc.x || 0.0,
            y: acc.y || 0.0,
            z: acc.z || G_ACC_STD 
        };
        curGyro = {
            x: (rot.alpha || 0.0) * D2R, 
            y: (rot.beta || 0.0) * D2R,  
            z: (rot.gamma || 0.0) * D2R 
        };
        if ($('angular-speed')) $('angular-speed').textContent = dataOrDefault(Math.sqrt(curGyro.x**2 + curGyro.y**2 + curGyro.z**2), 3, ' rad/s');
    };

    /** Gestion de permission DeviceMotion (essentiel pour iOS, ignoré sur Android) */
    const requestMotionPermission = () => {
        if (typeof DeviceMotionEvent === 'undefined') {
            console.error("🔴 DeviceMotionEvent non supporté sur ce périphérique.");
            return;
        }

        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('devicemotion', handleDeviceMotion);
                        console.log("✅ Permission DeviceMotion accordée et IMU connecté.");
                    } else {
                        console.error("🔴 Permission DeviceMotion refusée par l'utilisateur.");
                        isIMUActive = false;
                    }
                })
                .catch(error => {
                    console.error("🔴 Erreur lors de la demande de permission DeviceMotion:", error);
                    isIMUActive = false;
                });
        } else {
            // Chemin d'exécution Android / navigateurs sans l'API requestPermission
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
        // Simule la récupération météo
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
        // L'ID est alt-corrected-baro dans le HTML
        if ($('alt-corrected-baro')) $('alt-corrected-baro').textContent = dataOrDefault(calculateBarometricAltitude(currentPressureHpa, currentTemperatureC), 2, ' m'); 
    };
    
    const calculateGForces = (ukfState, rawAccels) => {
        // V36: Protection si math n'est pas disponible ou si l'UKF n'a pas la fonction de rotation.
        if (typeof math === 'undefined' || typeof ukf.quaternionToRotationMatrix !== 'function') {
            console.warn("⚠️ UKF/MATH non disponible pour le calcul des forces G.");
            return;
        }

        try {
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

        } catch (e) {
            console.error("🔴 ERREUR CRITIQUE dans calculateGForces (MATH/MATRICE):", e);
            // Assure que le script ne plante pas
            currentLongForceG = 0.0; 
            currentVertForceG = 1.0; 
        }
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
        
        // --- 1. Temps et Contrôles ---
        const now = getCDate(); 
        const now_local = new Date(); 
        
        if ($('local-time')) $('local-time').textContent = now_local.toLocaleTimeString('fr-FR');
        if ($('utc-datetime')) $('utc-datetime').textContent = `${now.toISOString().slice(0, 10)} ${now.toUTCString().split(' ')[4]} (UTC)`;
        
        // --- 2. IMU ---
        if ($('imu-status')) $('imu-status').textContent = isIMUActive ? 'Actif' : 'Inactif';
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 3, ' m/s²');
        
        // --- 3. Vitesse ---
        const speedKmh = currentSpeedMs * KMH_MS; 
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speedKmh, 1, ' km/h'); 
        if ($('speed-status-text')) $('speed-status-text').textContent = gpsStatusMessage;

        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 5, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 5, ' m/s'); 
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 5, ' m/s');
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(totalDistanceM);
        
        // --- 4. Position & UKF ---
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
            
            // V36: Protection autour de la lecture de la covariance math.js
            try {
                if (typeof math !== 'undefined' && ukf.getStateCovariance) {
                    const P = ukf.getStateCovariance();
                    if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(3, 3)) + P.subset(math.index(4, 4))), 3, ' m/s');
                    if ($('ukf-alt-sigma')) $('ukf-alt-sigma').textContent = dataOrDefault(Math.sqrt(P.subset(math.index(2, 2))), 3, ' m'); 
                } else {
                     throw new Error("UKF/MATH indisponible.");
                }
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
        // V36: Correction des IDs (elapsed-time et movement-time)
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
    
    // =================================================================
// BLOC 5/5 : FONCTIONS TEMPS, INITIALISATION ET BOUCLES PRINCIPALES
// =================================================================

// --- Variables de Temps ---
let sessionStartTime = 0; // Sera initialisé au premier start
let totalMovementTimeMs = 0;
let lastUpdateTimestamp = Date.now();
let weatherUpdateCounter = 0;

function getCDate() {
    return new Date();
}

function updateTimeCounters() {
    const now = getCDate();
    
    // Heure Locale (NTP)
    const localTimeStr = now.toLocaleTimeString('fr-FR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('local-time').textContent = localTimeStr;

    // Date & Heure (UTC/GMT) - Affichage du GMT réel
    const utcDateStr = now.toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
    const utcTimeStr = now.toLocaleTimeString('fr-FR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
    document.getElementById('utc-datetime').textContent = `${utcDateStr} ${utcTimeStr} (GMT)`;

    // Temps écoulé (Session)
    const elapsedSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
    const elapsedStr = new Date(elapsedSeconds * 1000).toISOString().substr(11, 8);
    document.getElementById('elapsed-session').textContent = `${elapsedSeconds.toFixed(2)} s (${elapsedStr})`;

    // Temps de Mouvement
    const movementTimeStr = new Date(totalMovementTimeMs).toISOString().substr(11, 8);
    document.getElementById('movement-time').textContent = `${(totalMovementTimeMs / 1000).toFixed(2)} s (${movementTimeStr})`;
    
    // Affichage de l'heure Minecraft
    if (typeof updateMinecraftTime === 'function') {
        updateMinecraftTime(document.getElementById('minecraft-time'), now);
    }
}

function syncH() {
    // Fonctionnalité pour synchronisation NTP externe si nécessaire.
    // Pour l'instant, elle sert de déclencheur pour les mises à jour.
}

// =================================================================
// BOUCLE RAPIDE (50 Hz - 20 ms) - PRÉDICTION UKF & CALCULS INERTIELS
// =================================================================

setInterval(() => {
    
    if (isGpsPaused || !ukf) {
        // En mode pause ou avant initialisation, on ne fait rien.
        updateDashboardDOM(null, false);
        return;
    }

    const now = Date.now();
    const dt = (now - lastUpdateTimestamp) / 1000; // Delta Time en secondes
    
    // Protection contre les erreurs de temps (ex: pause prolongée)
    if (dt > 0.5) { 
        lastUpdateTimestamp = now;
        return; 
    }
    
    // --- 1. UKF PREDICTION (Le cœur du filtre) ---
    let ukfState = null;
    let isFusionActive = false;
    
    try {
        if (ukf.isInitialized()) {
            // Utilisation des données IMU brutes pour la prédiction UKF
            ukf.predict(dt, [curAcc.x, curAcc.y, curAcc.z], [curGyro.x, curGyro.y, curGyro.z]);
            
            // --- UKF UPDATE (Conditional) ---
            if (isZUPTActive) { // Zero Velocity Update
                 ukf.updateZUUV();
            }
            if (currentPosition.hasMag) { // Magnétomètre
                 ukf.updateMag(curMag);
            }
            
            ukfState = ukf.getState();
            isFusionActive = true;

            // Mise à jour du temps de mouvement
            if (ukfState.speed > 0.1) {
                totalMovementTimeMs += (dt * 1000);
            }
        }
    } catch (e) {
        console.error("🔴 ERREUR CRITIQUE UKF (PREDICT/UPDATE) : Réinitialisation forcée.", e);
        
        // 🛑 LOGIQUE DE RÉINITIALISATION CRITIQUE 🛑
        // Si l'UKF génère une erreur (NaN, singularité math.js, etc.), on le réinitialise.
        if (ukf) {
            ukf.reset(currentPosition.lat, currentPosition.lon, currentPosition.alt);
        }
        
        // On bascule temporairement en mode GPS brut pour éviter le blocage du tableau.
        isFusionActive = false;
        ukfState = null;
    }
    
    lastUpdateTimestamp = now;

    // --- 2. CALCULS DE VITESSE ET FORCES G ---
    if (ukfState) {
        currentSpeedMs = ukfState.speed;
    } else {
        currentSpeedMs = currentPosition.speed;
    }
    
    // Mise à jour de la vitesse max (utilise la vitesse la plus récente, UKF ou GPS brut)
    maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);

    // Mise à jour des forces dynamiques (doit être appelée avec un état valide)
    if (typeof updateGyrForces === 'function') {
        try {
            updateGyrForces(ukfState, curAcc); 
        } catch (e) {
            console.error("🔴 ERREUR G-FORCES:", e);
        }
    }

    // --- 3. MISE À JOUR DOM ---
    updateDashboardDOM(ukfState, isFusionActive); 
    
}, 20); // 50 Hz

// =================================================================
// BOUCLE LENTE (1 Hz - 1000 ms) - MÉTÉO, ASTRO & ÉTAT PHYSIQUE
// =================================================================

setInterval(() => {
    updateTimeCounters(); 
    
    // Détermination de la position à utiliser pour les calculs lents
    const fusionAlt = (ukf && ukf.isInitialized() ? ukf.getState().alt : currentPosition.alt);
    const fusionLat = (ukf && ukf.isInitialized() ? ukf.getState().lat : currentPosition.lat);
    const fusionLon = (ukf && ukf.isInitialized() ? ukf.getState().lon : currentPosition.lon);
    
    if (!isGpsPaused && fusionLat !== 0.0) {
        
        // --- 1. GESTION MÉTÉO (Toutes les 60s) ---
        if (weatherUpdateCounter % 60 === 0) { 
             fetchWeather(fusionLat, fusionLon)
                 .then(data => { 
                     // Mémorisation des données météo pour les calculs physiques
                     currentPressureHpa = data.pressure || P_SEA;
                     currentTemperatureC = data.temp || 15.0;
                     updatePhysicalState(fusionAlt, fusionLat); 
                 })
                 .catch(err => console.error("🔴 ERREUR MÉTÉO : Échec du fetch météo.", err));
             weatherUpdateCounter = 0; 
         }
         weatherUpdateCounter++;

         // --- 2. GESTION ASTRO (Si le fichier est chargé) ---
         if (typeof updateAstro === 'function') {
             try {
                 updateAstro(fusionLat, fusionLon, fusionAlt, getCDate());
             } catch (e) {
                 console.error("🔴 ERREUR ASTRO : Échec de la mise à jour astronomique.", e);
             }
         }
    }
    
    // --- 3. MISE À JOUR DE L'ÉTAT PHYSIQUE (toujours exécutée) ---
    // Recalcule la densité de l'air, la vitesse du son, etc., avec les dernières valeurs.
     updatePhysicalState(fusionAlt, fusionLat); 
     
}, 1000); 

// =================================================================
// INITIALISATION DES ÉVÉNEMENTS DOM
// =================================================================

window.addEventListener('load', () => {
    // Définition de l'heure de début de session
    sessionStartTime = Date.now();
    
    // 1. Initialisation de la carte (si la fonction est présente)
    if (typeof initMap === 'function') {
        initMap();
    }
    
    // 2. Gestion du bouton de démarrage/pause GPS (CRITIQUE pour l'IMU)
    document.getElementById('start-gps-btn').addEventListener('click', () => {
        isGpsPaused = !isGpsPaused;
        document.getElementById('start-gps-btn').textContent = isGpsPaused ? '▶️ MARCHE GPS' : '⏸ PAUSE GPS';
        
        if (!isGpsPaused) {
            // Lancement des écouteurs IMU/Motion (Gère la permission iOS et Android)
            requestMotionPermission(); 
            startGpsTracking();
        } else {
            stopGpsTracking();
        }
    });

    // 3. Afficher l'état initial
    updateDashboardDOM(null, false);   
});    

})(window); 
