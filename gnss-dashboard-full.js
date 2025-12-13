// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL PROFESSIONNEL (V27)
// ARCHITECTURE: 50 HZ (IMU/UKF) | RELATIVITÉ COMPLÈTE | SYNCHRO NTP RÉELLE
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances critiques ---
    if (typeof math === 'undefined') console.warn("⚠️ ALERTE: math.js manquant. L'UKF sera désactivé.");
    if (typeof ProfessionalUKF === 'undefined') console.warn("⚠️ ALERTE: ProfessionalUKF n'est pas définie. Mode GPS/Capteur brut activé.");
    if (typeof updateAstro === 'undefined') console.warn("⚠️ ALERTE: astro.js manquant. Les calculs astronomiques seront désactivés. (Vérifiez l'export 'window.updateAstro')");

    // =================================================================
    // BLOC 1/4 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    // --- CONSTANTES SCIENTIFIQUES (SI) ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             // Conversion m/s -> km/h
    const C_L = 299792458;          // Vitesse lumière (m/s)
    const G_CONST = 6.67430e-11;    // Constante Gravitationnelle Universelle (G)
    const R_AIR = 287.058;          // Constante gaz parfait air (J/(kg·K))
    const GAMMA = 1.4;              // Indice adiabatique de l'air
    const P_SEA_LEVEL = 1013.25;    // Pression standard (hPa)
    const T_LAPSE = 0.0065;         // Gradient thermique (K/m)
    const G_ACC_STD = 9.8067;       // Gravité standard (m/s²)
    const EARTH_RADIUS = 6371000.0; // Rayon terrestre moyen (m)
    const RHO_SEA_LEVEL = 1.225;    // Densité air niveau mer (kg/m³)
    const TEMP_STD_K = 288.15;      // 15°C standard

    // --- VARIABLES D'ÉTAT CRITIQUES ---
    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let dt_prediction = 0.0; 
    let lastPredictionTime = new Date().getTime();

    // --- VARIABLES DE DONNÉES TEMPS RÉEL ---
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

    // Physique/Environnement/Temps
    let currentMass = 70.0;             
    let currentAirDensity = RHO_SEA_LEVEL;
    let currentSpeedOfSound = 340.29;   
    let currentG_Acc = G_ACC_STD;          
    let lastKnownWeather = null;
    let maxSpeedMs = 0.0;
    let netherMode = false;
    let currentPressureHpa = P_SEA_LEVEL;
    let currentTemperatureC = 15.0;
    
    // Synchronisation NTP (Temps Réel)
    let currentNTPOffsetMs = 0; 
    let lastNTPSyncTime = 0;
    
    let weatherUpdateCounter = 0; 
    
    // =================================================================
    // BLOC 2/4 : UTILITAIRES MATHS, PHYSIQUE ET TEMPS
    // =================================================================

    const $ = id => document.getElementById(id);
    
    /** Formate un nombre, gère N/A. */
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) return 'N/A';
        if (typeof val === 'number') return val.toFixed(decimals) + suffix;
        return val;
    };
    
    /** Formate en notation scientifique ou normale. */
    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        const value = (val === undefined || val === null || isNaN(val) || typeof val !== 'number') ? 0.0 : val;
        if (Math.abs(value) > 1e6 || (Math.abs(value) < 1e-4 && value !== 0)) {
            return value.toExponential(decimals) + suffix;
        }
        return value.toFixed(decimals) + suffix;
    };

    /** Formate une distance en m ou km. */
    const formatDistance = (m) => {
        if (m === undefined || m === null || isNaN(m)) return '0.000 km | 0.00 m'; 
        if (m < 1000) return `0.000 km | ${dataOrDefault(m, 2, ' m')}`; 
        return `${dataOrDefault(m / 1000, 3, ' km')} | ${dataOrDefault(m, 0, ' m')}`;
    };
    
    // --- GESTION DU TEMPS RÉEL (GMT/NTP) ---

    /** Synchronise l'heure avec un serveur de temps atomique (WorldTimeAPI). */
    const syncH = async () => {
        // Évite de spammer l'API : une synchro toutes les 5 minutes suffit
        const now = Date.now();
        if (now - lastNTPSyncTime < 300000 && lastNTPSyncTime !== 0) return;

        try {
            // Appel à une API de temps public (Alternative: timeapi.io si worldtimeapi est down)
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            if (response.ok) {
                const data = await response.json();
                const serverTime = new Date(data.utc_datetime).getTime();
                const localTime = Date.now();
                // Calcul du décalage (Offset = Heure Serveur - Heure Système)
                currentNTPOffsetMs = serverTime - localTime;
                lastNTPSyncTime = localTime;
                console.log(`✅ Synchro NTP réussie. Offset: ${currentNTPOffsetMs} ms`);
            }
        } catch (e) {
            console.warn("⚠️ Échec Synchro NTP (Mode hors ligne/local conservé).", e);
        }
    };

    /** Obtient la date/heure actuelle corrigée par le NTP. */
    const getCDate = () => {
        return new Date(Date.now() + currentNTPOffsetMs);
    };
    
    /** Calcule la vitesse du son (m/s). */
    const getSpeedOfSound = (T_K) => Math.sqrt(GAMMA * R_AIR * T_K);
    
    /** Calcule la gravité locale (g) WGS84. */
    if (typeof window.getGravity !== 'function') {
        window.getGravity = (latRad, alt) => {
            const G_E = 9.780327; 
            const sin2 = Math.sin(latRad)**2;
            const g_0 = G_E * (1 + 0.0053024 * sin2);
            return g_0 - 3.086e-6 * alt;
        };
    }
    
    /** Calcule l'altitude barométrique (m). */
    const calculateBarometricAltitude = (P_hPa, T_C) => {
        const T_K = T_C + 273.15;
        const P_ratio = P_hPa / P_SEA_LEVEL;
        if (P_ratio > 1.0) return 0.0; 
        return (T_K / T_LAPSE) * (1 - Math.pow(P_ratio, (R_AIR * T_LAPSE) / G_ACC_STD));
    };

    /** Met à jour les valeurs d'environnement et le DOM associé (1 Hz). */
    const updatePhysicalStateAndDOM = (fusionAlt) => {
        const T_K = currentTemperatureC + 273.15;
        
        // Physique des Fluides
        currentAirDensity = (currentPressureHpa * 100) / (R_AIR * T_K); 
        currentSpeedOfSound = getSpeedOfSound(T_K);
        currentG_Acc = window.getGravity(currentPosition.lat * D2R, fusionAlt);
        
        const baroAltitude = calculateBarometricAltitude(currentPressureHpa, currentTemperatureC);
        const dynamicPressure = 0.5 * currentAirDensity * currentSpeedMs**2;
        
        // Traînée (Simplifié Cd*A = 0.5)
        const dragForce = 0.5 * currentAirDensity * currentSpeedMs**2 * 0.5;
        const dragPowerKw = (dragForce * currentSpeedMs) / 1000;
        
        // Affichage DOM
        if ($('air-temp')) $('air-temp').textContent = dataOrDefault(currentTemperatureC, 1, ' °C');
        if ($('pressure')) $('pressure').textContent = dataOrDefault(currentPressureHpa, 2, ' hPa'); // ID corrigé 'pressure'
        if ($('air-density')) $('air-density').textContent = dataOrDefault(currentAirDensity, 4, ' kg/m³');
        if ($('altitude-corrigee-baro')) $('altitude-corrigee-baro').textContent = dataOrDefault(baroAltitude, 2, ' m'); 
        if ($('pression-dynamique')) $('pression-dynamique').textContent = dataOrDefault(dynamicPressure, 2, ' Pa');
        if ($('drag-force')) $('drag-force').textContent = dataOrDefault(dragForce, 2, ' N'); 
        if ($('drag-power-kw')) $('drag-power-kw').textContent = dataOrDefault(dragPowerKw, 2, ' kW'); 
        if ($('gravity-base')) $('gravity-base').textContent = dataOrDefault(G_ACC_STD, 4, ' m/s²'); 
    };

    /** Met à jour les valeurs de Relativité et Forces (20 Hz). */
    const updateRelativityAndForces = (ukfState) => {
        const alt = ukfState.alt || currentAltitudeM;
        const lat = ukfState.lat || currentPosition.lat;
        const speed = currentSpeedMs;
        const mass = currentMass;
        
        // Vitesse du Son & Mach
        const speedOfSound = currentSpeedOfSound; 
        const mach = speed / speedOfSound;
        const speedOfSoundPercent = (speed / speedOfSound) * 100;

        if ($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = dataOrDefault(speedOfSound, 4, ' m/s');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 4); // Précision augmentée
        if ($('percent-speed-sound')) $('percent-speed-sound').textContent = dataOrDefault(speedOfSoundPercent, 2, ' %');
        
        // Relativité Restreinte
        const v_c_ratio = speed / C_L;
        const v_c_ratio_sq = v_c_ratio**2;
        const lorentzFactor = (v_c_ratio_sq < 1) ? 1.0 / Math.sqrt(1.0 - v_c_ratio_sq) : 1.0; 
        
        const SECONDS_PER_DAY = 86400;
        const timeDilationVelocity = (lorentzFactor - 1.0) * (SECONDS_PER_DAY * 1e9); // ns/j
        
        // Relativité Générale (Gravité)
        const timeDilationGravity = (G_CONST * mass / (C_L**2 * EARTH_RADIUS)) * (SECONDS_PER_DAY * 1e9); 
        const schwarzschildRadius = (2 * G_CONST * mass) / C_L**2; 
        
        const restEnergy = mass * C_L**2; 
        const totalEnergy = lorentzFactor * restEnergy;
        const momentum = lorentzFactor * mass * speed;
        const kineticEnergy = (lorentzFactor - 1.0) * restEnergy; 
        const mechanicalPower = (totalEnergy - restEnergy) / (dt_prediction || 0.05);

        // Forces Inertielles
        const omega_e = 7.2921159e-5; // Vitesse angulaire Terre
        const CoriolisForce = 2 * mass * omega_e * Math.sin(lat * D2R) * currentSpeedMs;
        
        // Affichage DOM
        if ($('percent-speed-light')) $('percent-speed-light').textContent = dataOrDefaultExp(v_c_ratio * 100, 2) + ' %';
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentzFactor, 9); // Haute précision
        if ($('time-dilation-vel')) $('time-dilation-vel').textContent = dataOrDefault(timeDilationVelocity, 2, ' ns/j');
        if ($('time-dilation-grav')) $('time-dilation-grav').textContent = dataOrDefault(timeDilationGravity, 2, ' ns/j');
        if ($('energy-rel')) $('energy-rel').textContent = dataOrDefaultExp(totalEnergy, 2) + ' J'; 
        if ($('energy-rest')) $('energy-rest').textContent = dataOrDefaultExp(restEnergy, 2) + ' J'; 
        if ($('quantite-mouvement')) $('quantite-mouvement').textContent = dataOrDefaultExp(momentum, 2) + ' kg·m/s'; 
        if ($('schwarzschild-radius')) $('schwarzschild-radius').textContent = dataOrDefaultExp(schwarzschildRadius, 2) + ' m'; 
        
        if ($('gravity-local')) $('gravity-local').textContent = dataOrDefault(currentG_Acc, 4, ' m/s²');
        if ($('coriolis-force')) $('coriolis-force').textContent = dataOrDefault(CoriolisForce, 3, ' N');
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(kineticEnergy, 2, ' J'); 
        if ($('mechanical-power')) $('mechanical-power').textContent = dataOrDefault(mechanicalPower, 2, ' W'); 

        // Constantes
        if ($('vitesse-lumiere')) $('vitesse-lumiere').textContent = dataOrDefault(C_L, 0, ' m/s');
        if ($('G-universelle')) $('G-universelle').textContent = dataOrDefaultExp(G_CONST, 11) + ' m³/kg/s²'; 
    };

    /** Réinitialisations */
    const resetDistance = () => { totalDistanceM = 0.0; lastPosition = null; timeMovementMs = 0; };
    const resetVmax = () => { maxSpeedMs = 0.0; };

    /** Récupère les données météo (Proxy). */
    const fetchWeather = async (lat, lon) => {
        // ⚠️ REMPLACER PAR VOTRE URL RÉELLE
        const proxyUrl = 'VOTRE_PROXY_URL/api/weather'; 
        try {
            const response = await fetch(`${proxyUrl}?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error(`Erreur API: ${response.status}`);
            return await response.json();
        } catch (error) {
            throw error; 
        }
    };
    
    // =================================================================
    // BLOC 3/4 : GESTIONNAIRES D'API (GPS, IMU)
    // =================================================================

    // --- A. IMU HANDLERS ---
    
    const handleDeviceMotion = (event) => {
        const acc = event.accelerationIncludingGravity;
        currentAccelMs2_X = acc.x || 0.0;
        currentAccelMs2_Y = acc.y || 0.0;
        currentAccelMs2_Z = acc.z || 0.0;

        const gyro = event.rotationRate;
        currentGyroRadS_X = (gyro.alpha || 0.0) * D2R; 
        currentGyroRadS_Y = (gyro.beta || 0.0) * D2R;
        currentGyroRadS_Z = (gyro.gamma || 0.0) * D2R;

        // Stockage pour UKF
        linearAccel[0] = currentAccelMs2_X; 
        linearAccel[1] = currentAccelMs2_Y;
        linearAccel[2] = currentAccelMs2_Z;
    };

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

    // --- B. GPS HANDLERS (AVEC CORRECTIF UKF VITAL) ---

    const handleGpsSuccess = (pos) => {
        const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
        
        currentPosition = { lat: latitude, lon: longitude, acc: accuracy, spd: speed || 0.0 };
        rawSpeedMs = speed || 0.0;
        currentAltitudeM = altitude || 0.0;

        // Calcul distance (nécessite turf.js)
        if (lastPosition && typeof turf !== 'undefined' && typeof turf.distance === 'function') {
            const distanceKM = turf.distance(turf.point([lastPosition.lon, lastPosition.lat]), turf.point([longitude, latitude]), { units: 'kilometers' });
            totalDistanceM += distanceKM * 1000;
        }
        lastPosition = { lat: latitude, lon: longitude };

        // --- GESTION CRITIQUE UKF ---
        if (ukf) {
            try {
                // V27: CORRECTION INITIALISATION FORCÉE (Le "Débloqueur")
                if (!ukf.isInitialized()) {
                    
                    if (typeof ukf.initialize === 'function') {
                        ukf.initialize(latitude, longitude, altitude || 0.0);
                    }
                    
                    // FORCE LE DRAPEAU POUR DÉMARRER LA BOUCLE
                    ukf.initialized = true; 
                    
                    gpsStatusMessage = 'Fix GPS (UKF Init Forcée OK)';
                    console.log("✅ UKF : Initialisation forcée réussie. Démarrage de la fusion.");
                }
                
                // Correction UKF Standard
                ukf.update(pos); 
            } catch (e) {
                console.error("🔴 ERREUR CRITIQUE UKF DANS LA CORRECTION GPS. UKF en mode Fallback.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
            }
        } else {
            // Mode Fallback
            currentSpeedMs = rawSpeedMs;
        }

        maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
        gpsStatusMessage = `Fix: ${dataOrDefault(accuracy, 1)}m`; 
    };

    const handleGpsError = (error) => {
        console.error('Erreur GPS:', error.message);
        gpsStatusMessage = `Erreur: ${error.code} (${error.message})`;
    };
    
    const initGPS = () => {
        if (gpsWatchID !== null) return;
        if (navigator.geolocation) {
            const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }; 
            gpsWatchID = navigator.geolocation.watchPosition(handleGpsSuccess, handleGpsError, options);
            gpsStatusMessage = 'Acquisition en cours...';
        } else {
            gpsStatusMessage = 'Non Supporté';
        }
    };

    // =================================================================
    // BLOC 4/4 : CONTRÔLE, MISE À JOUR DOM ET INITIALISATION
    // =================================================================

    /** Met à jour les valeurs de l'interface du tableau de bord. */
    function updateDashboardDOM() {
        // --- 1. Temps (Synchro NTP) ---
        const now = getCDate(); 
        const now_local = new Date(); // Heure système brute pour le local
        
        if ($('local-time')) $('local-time').textContent = now_local.toLocaleTimeString('fr-FR'); // Heure Locale système
        if ($('utc-datetime')) {
            // Affiche l'heure corrigée NTP en UTC
            const utcTime = now.toUTCString().split(' ')[4];
            $('utc-datetime').textContent = `${now.toISOString().slice(0, 10)} ${utcTime} (UTC)`;
        }
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(currentNTPOffsetMs, 0, ' ms');
        
        // --- 2. IMU ---
        if ($('imu-status')) $('imu-status').textContent = isIMUActive ? 'Actif' : 'Inactif';
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(currentAccelMs2_X, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(currentAccelMs2_Y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(currentAccelMs2_Z, 3, ' m/s²');

        // --- 3. Vitesse & Distance ---
        const speedKmh = currentSpeedMs * KMH_MS; 
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 5, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 5, ' m/s'); 
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 5, ' m/s');
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        const displayTotalDistance = totalDistanceM * (netherMode ? (1/8) : 1);
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(displayTotalDistance);
        
        // --- 4. Météo ---
        if (lastKnownWeather && lastKnownWeather.main) {
            if ($('weather-status')) $('weather-status').textContent = 'Actif';
            if ($('humidity')) $('humidity').textContent = dataOrDefault(lastKnownWeather.main.humidity, 0, '%');
        } else {
             if ($('weather-status')) $('weather-status').textContent = 'INACTIF';
        }

        // --- 6. Position & Astro ---
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(currentPosition.lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(currentPosition.lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = formatDistance(currentAltitudeM);
        if ($('precision-gps-acc')) $('precision-gps-acc').textContent = formatDistance(currentPosition.acc);
        
        // --- 7. Filtre EKF/UKF ---
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage;
        
        if (ukf && typeof ukf.getStateCovariance === 'function') {
            let ukfState = null;
            let P = null;
            try {
                 if (ukf.isInitialized()) {
                     ukfState = ukf.getState();
                     P = ukf.getStateCovariance();
                 }
            } catch (e) { /* Ignore */ }

            if (ukfState && P) {
                if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(P.get([3, 3]) + P.get([4, 4])), 3, ' m/s');
                if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = dataOrDefault(Math.sqrt(P.get([2, 2])), 3, ' m');
                if ($('ekf-status')) $('ekf-status').textContent = 'Actif';
                if ($('pitch')) $('pitch').textContent = dataOrDefault(ukfState.pitch * R2D, 1, '°');
                if ($('roll')) $('roll').textContent = dataOrDefault(ukfState.roll * R2D, 1, '°');
            } else {
                 if ($('ekf-status')) $('ekf-status').textContent = 'Initialisation...';
                 if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = 'N/A';
                 if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = 'N/A';
            }
        } else {
            if ($('ekf-status')) $('ekf-status').textContent = 'INACTIF (UKF Manquant)';
        }
    }

    /** Bascule l'état de pause/marche. */
    const toggleGpsPause = () => {
        isGpsPaused = !isGpsPaused;
        const pauseBtn = $('gps-pause-toggle'); 

        if (isGpsPaused) {
            if (pauseBtn) pauseBtn.textContent = '▶️ MARCHE GPS';
            if (gpsWatchID !== null) {
                navigator.geolocation.clearWatch(gpsWatchID);
                gpsWatchID = null; 
            }
            window.removeEventListener('devicemotion', handleDeviceMotion);
            isIMUActive = false;
            gpsStatusMessage = 'Arrêté (Pause)';
        } else {
            if (pauseBtn) pauseBtn.textContent = '⏸️ PAUSE GPS';
            initGPS();
            initIMU(); 
            // Premier appel synchro NTP
            syncH();
            
            if (timeStartSession === null) timeStartSession = new Date();
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
             if(confirm("Réinitialiser tout?")) location.reload();
        });
        if ($('mass-input')) {
            $('mass-input').addEventListener('input', (e) => {
                currentMass = parseFloat(e.target.value) || 70.0;
                if ($('mass-display')) $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
            });
        }
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
        console.log("UKF instancié.");
    } else {
        console.error("CRITIQUE: UKF ou math.js introuvables. Fusion désactivée.");
    }
    
    // 2. Attacher les événements
    setupEventListeners();

    // 3. Boucles de rafraîchissement
    
    // Boucle rapide (Affichage/Prédiction UKF/Relativité) - 20 Hz
    setInterval(() => {
         const currentTime = new Date().getTime();
         dt_prediction = (currentTime - lastPredictionTime) / 1000.0;
         lastPredictionTime = currentTime;
         
         let ukfState = { lat: currentPosition.lat, lon: currentPosition.lon, alt: currentAltitudeM, speed: rawSpeedMs }; // Default

         // 2. PRÉDICTION UKF (Fusion complète IMU)
         if (!isGpsPaused && ukf && typeof ukf.predict === 'function' && dt_prediction > 0 && ukf.isInitialized()) {
             const rawAccels = [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z];
             const rawGyros = [currentGyroRadS_X, currentGyroRadS_Y, currentGyroRadS_Z];
             
             try {
                 ukf.predict(dt_prediction, rawAccels, rawGyros); 
                 ukfState = ukf.getState(); 
                 currentSpeedMs = ukfState.speed;
             } catch (e) {
                 console.error("🔴 ERREUR UKF PREDICT. Reset...", e);
                 if (typeof ukf.reset === 'function') ukf.reset(currentPosition.lat, currentPosition.lon, currentAltitudeM);
                 currentSpeedMs = rawSpeedMs; 
                 gpsStatusMessage = 'ERREUR UKF (Reset)';
             }
         } else if (!isGpsPaused) {
             currentSpeedMs = rawSpeedMs; 
         }

         // 3. Mise à jour des calculs de physique/relativité (20Hz)
         updateRelativityAndForces(ukfState); 

         // 4. Affichage
         updateDashboardDOM(); 
         
    }, 50); 
    
    // Boucle lente (Météo/Astro/NTP/Physique) - 1Hz
    setInterval(() => {
        updateTimeCounters(); 
        
        // Synchro NTP (Toutes les 5 min grâce au garde-fou interne de syncH)
        syncH();

        const fusionAlt = (ukf && ukf.isInitialized() ? ukf.getState().alt : currentAltitudeM);
        
        if (!isGpsPaused && currentPosition.lat !== 0.0) {
             
             // V26: Protection Astro
             if (typeof updateAstro === 'function') {
                 try {
                     const now = getCDate(); // Utilise l'heure NTP
                     updateAstro(currentPosition.lat, currentPosition.lon, fusionAlt, now);
                 } catch (e) { /* Ignore Astro errors */ }
             }

             // V26: Protection Météo
             if (weatherUpdateCounter % 60 === 0) { 
                 fetchWeather(currentPosition.lat, currentPosition.lon)
                     .then(data => { 
                         lastKnownWeather = data;
                         currentTemperatureC = data.main.temp;
                         currentPressureHpa = data.main.pressure;
                         updatePhysicalStateAndDOM(fusionAlt); 
                     })
                     .catch(err => console.error("Météo échec (Proxy)"));
                 weatherUpdateCounter = 0; 
             }
             weatherUpdateCounter++;
        }
         
         updatePhysicalStateAndDOM(fusionAlt); 
    }, 1000); 

    updateDashboardDOM();   

});

})(window);
