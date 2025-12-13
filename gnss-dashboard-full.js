// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL PROFESSIONNEL STABLE (CORRIGÉ V26)
// AJOUTS: Logique complète de Relativité, Forces, Météo/Baro.
// FRÉQUENCE: UKF/Relativité à 20 Hz. Météo/Astro à 1 Hz.
// DÉPENDANCE CRITIQUE: ProfessionalUKF et math.js (non inclus, mais requis).
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
    const G_CONST = 6.67430e-11;    // Constante Gravitationnelle Universelle (G)
    const R_AIR = 287.058;          // Constante gaz parfait air (J/(kg·K))
    const GAMMA = 1.4;              // Indice adiabatique de l'air (Air)
    const P_SEA_LEVEL = 1013.25;    // Pression standard au niveau de la mer (hPa)
    const T_LAPSE = 0.0065;         // Taux de déperdition de température (K/m)
    const G_ACC = 9.8067;           // Gravité standard (m/s²)
    const EARTH_RADIUS = 6371000.0; // Rayon moyen de la Terre (m)
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
    let currentG_Acc = G_ACC;           
    let lastKnownWeather = null;
    let maxSpeedMs = 0.0;
    let netherMode = false;
    let currentPressureHpa = P_SEA_LEVEL; // Pression par défaut
    let currentTemperatureC = 15.0; // Température par défaut
    
    let weatherUpdateCounter = 0; 
    
    // =================================================================
    // BLOC 2/4 : UTILITAIRES DE BASE, FORMATAGE ET PHYSIQUE
    // =================================================================

    const $ = id => document.getElementById(id);
    
    /** Formate un nombre, gère N/A. */
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
             return 'N/A';
        }
        if (typeof val === 'number') {
            return val.toFixed(decimals) + suffix;
        }
        return val;
    };
    
    /** Formate en notation scientifique ou normale. */
    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        const value = (val === undefined || val === null || isNaN(val) || typeof val !== 'number') ? 0.0 : val;
        if (Math.abs(value) > 1e6 || Math.abs(value) < 1e-4) {
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
    
    /** Obtient la date/heure (stable). */
    const getCDate = () => { return new Date(); };
    
    /** Synchro NTP simple. (No-op) */
    const syncH = () => { /* No-op */ };
    
    /** Calcule la vitesse du son (m/s) en fonction de T_K. */
    const getSpeedOfSound = (T_K) => {
        return Math.sqrt(GAMMA * R_AIR * T_K); // Formule physique exacte: 331.3 * sqrt(T_K / 273.15) est une approximation.
    };
    
    /** Calcule la gravité locale (g) WGS84 (Simplifié). */
    const getGravity = (latRad, alt) => {
        // Constantes WGS84 simplifiées (tirées de ukf-lib)
        const G_E = 9.780327; 
        const sin_lat = Math.sin(latRad);
        const g_0 = G_E * (1 + 0.0053024 * sin_lat * sin_lat);
        return g_0 - 3.086e-6 * alt;
    };
    
    /** Calcule l'altitude barométrique (m). */
    const calculateBarometricAltitude = (P_hPa, T_C) => {
        const T_K = T_C + 273.15;
        const P_ratio = P_hPa / P_SEA_LEVEL;
        if (P_ratio > 1.0) return 0.0; // Au-dessus du niveau de la mer
        
        // Formule standard internationale (ISO)
        return (T_K / T_LAPSE) * (1 - Math.pow(P_ratio, (R_AIR * T_LAPSE) / G_ACC));
    };

    /** Met à jour les valeurs d'environnement et le DOM associé. (1 Hz) */
    const updatePhysicalStateAndDOM = (fusionAlt) => {
        const T_K = currentTemperatureC + 273.15;
        
        // 1. Calcul de la Densité de l'Air (kg/m³)
        // Équation des gaz parfaits pour la densité (ρ = P / (R_air * T))
        currentAirDensity = (currentPressureHpa * 100) / (R_AIR * T_K); 
        currentSpeedOfSound = getSpeedOfSound(T_K);
        currentG_Acc = getGravity(currentPosition.lat * D2R, fusionAlt);
        
        // 2. Altitude Barométrique (m)
        const baroAltitude = calculateBarometricAltitude(currentPressureHpa, currentTemperatureC);
        
        // 3. Pression dynamique (Pa)
        const dynamicPressure = 0.5 * currentAirDensity * currentSpeedMs**2;

        // 4. Force de Traînée (Simplifié, Cd*A = 0.5 * 1.0 par défaut)
        const dragCoefficientArea = 0.5; // Exemple de valeur Cd*A (coefficient de traînée * surface de référence)
        const dragForce = 0.5 * currentAirDensity * currentSpeedMs**2 * dragCoefficientArea;
        const dragPowerKw = (dragForce * currentSpeedMs) / 1000;
        
        // --- MISE À JOUR DOM : Météo & Mécanique des Fluides ---
        if ($('air-temp')) $('air-temp').textContent = dataOrDefault(currentTemperatureC, 1, ' °C');
        if ($('air-pressure')) $('air-pressure').textContent = dataOrDefault(currentPressureHpa, 2, ' hPa');
        if ($('air-density')) $('air-density').textContent = dataOrDefault(currentAirDensity, 4, ' kg/m³');
        if ($('altitude-corrigee-baro')) $('altitude-corrigee-baro').textContent = dataOrDefault(baroAltitude, 2, ' m'); 
        if ($('pression-dynamique')) $('pression-dynamique').textContent = dataOrDefault(dynamicPressure, 2, ' Pa');
        if ($('drag-force')) $('drag-force').textContent = dataOrDefault(dragForce, 2, ' N'); 
        if ($('drag-power-kw')) $('drag-power-kw').textContent = dataOrDefault(dragPowerKw, 2, ' kW'); 
        
        // Mise à jour de la Gravité de Base
        if ($('gravity-base')) $('gravity-base').textContent = dataOrDefault(G_ACC, 4, ' m/s²'); 
    };

    /** Met à jour les valeurs de Relativité et Forces. (20 Hz) */
    const updateRelativityAndForces = (ukfState) => {
        const alt = ukfState.alt || currentAltitudeM;
        const lat = ukfState.lat || currentPosition.lat;
        const speed = currentSpeedMs;
        const mass = currentMass;
        
        // --- Vitesse du Son & Mach ---
        const speedOfSound = currentSpeedOfSound; 
        const mach = speed / speedOfSound;
        const speedOfSoundPercent = (speed / speedOfSound) * 100;

        if ($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = dataOrDefault(speedOfSound, 4, ' m/s');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 3);
        if ($('percent-speed-sound')) $('percent-speed-sound').textContent = dataOrDefault(speedOfSoundPercent, 2, ' %');
        
        // --- Relativité ---
        const v_c_ratio = speed / C_L;
        const v_c_ratio_sq = v_c_ratio**2;
        const lorentzFactor = (v_c_ratio_sq < 1) ? 1.0 / Math.sqrt(1.0 - v_c_ratio_sq) : 1.0; 
        
        const SECONDS_PER_DAY = 24 * 3600;
        // Dilatation du Temps (Vitesse) : ns/jour (Temps propre - Temps coordonné)
        const timeDilationVelocity = (lorentzFactor - 1.0) * (SECONDS_PER_DAY * 1e9); 
        
        // Dilatation Gravitationnelle (Simplifiée) : ns/jour
        const timeDilationGravity = (G_CONST * mass / (C_L**2 * EARTH_RADIUS)) * (SECONDS_PER_DAY * 1e9); 
        
        const restEnergy = mass * C_L**2; 
        const totalEnergy = lorentzFactor * restEnergy;
        const momentum = lorentzFactor * mass * speed;
        const schwarzschildRadius = (2 * G_CONST * mass) / C_L**2; 
        
        const kineticEnergy = (lorentzFactor - 1.0) * restEnergy; // Énergie cinétique relativiste
        const mechanicalPower = (totalEnergy - restEnergy) / dt_prediction; // Puissance mécanique (Approximation)

        // --- Gravité & Forces ---
        const omega_e = 7.2921159e-5; // Vitesse angulaire Terre rad/s
        const CoriolisForce = 2 * mass * omega_e * Math.sin(lat * D2R) * currentSpeedMs;
        
        // --- MISE À JOUR DOM : Relativité & Forces ---
        if ($('percent-speed-light')) $('%speed-of-light').textContent = dataOrDefaultExp(v_c_ratio * 100, 2) + ' %';
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentzFactor, 4);
        if ($('time-dilation-vel')) $('time-dilation-vel').textContent = dataOrDefault(timeDilationVelocity, 2, ' ns/j');
        if ($('time-dilation-grav')) $('time-dilation-grav').textContent = dataOrDefault(timeDilationGravity, 2, ' ns/j');
        if ($('energy-rel')) $('energy-rel').textContent = dataOrDefaultExp(totalEnergy, 2) + ' J'; 
        if ($('energy-rest')) $('energy-rest').textContent = dataOrDefaultExp(restEnergy, 2) + ' J'; 
        if ($('quantite-mouvement')) $('quantite-mouvement').textContent = dataOrDefaultExp(momentum, 2) + ' kg·m/s'; 
        if ($('schwarzschild-radius')) $('schwarzschild-radius').textContent = dataOrDefaultExp(schwarzschildRadius, 2) + ' m'; 
        
        if ($('gravity-local')) $('gravity-local').textContent = dataOrDefault(currentG_Acc, 4, ' m/s²');
        if ($('coriolis-force')) $('coriolis-force').textContent = dataOrDefault(CoriolisForce, 2, ' N');
        if ($('kinetic-energy-j')) $('kinetic-energy-j').textContent = dataOrDefault(kineticEnergy, 2, ' J'); 
        if ($('mechanical-power')) $('mechanical-power').textContent = dataOrDefault(mechanicalPower, 2, ' W'); 

        // Constantes Cosmologiques
        if ($('vitesse-lumiere')) $('vitesse-lumiere').textContent = dataOrDefault(C_L, 0, ' m/s');
        if ($('G-universelle')) $('G-universelle').textContent = dataOrDefaultExp(G_CONST, 11) + ' m³/kg/s²'; 
    };

    /** Réinitialise les compteurs de distance. */
    const resetDistance = () => { totalDistanceM = 0.0; lastPosition = null; timeMovementMs = 0; };
    
    /** Réinitialise la vitesse max. */
    const resetVmax = () => { maxSpeedMs = 0.0; };

    // --- Reste du BLOC 2/4 (fetchWeather, getCDate, etc.) reste inchangé ---

    // =================================================================
    // BLOC 3/4 : GESTIONNAIRES D'API (GPS, IMU)
    // Reste inchangé (handleDeviceMotion, initIMU, handleGpsSuccess, etc.)
    // =================================================================

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

        if (ukf) {
            try {
                if (!ukf.isInitialized()) {
                    ukf.initialize(latitude, longitude, altitude || 0.0);
                    gpsStatusMessage = 'Fix GPS (UKF Init)';
                }
                ukf.update(pos); 
            } catch (e) {
                console.error("🔴 ERREUR CRITIQUE UKF DANS LA CORRECTION GPS. UKF en mode Fallback.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
            }
        } else {
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

            // Mise à jour du temps de mouvement (s'exécute à 1000ms)
            if (currentSpeedMs > 0.05 && !isGpsPaused) { 
                timeMovementMs += 1000; 
            }

            if ($('time-elapsed')) $('time-elapsed').textContent = dataOrDefault(elapsedTimeMs / 1000, 2, ' s');
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
        // --- 1. Contrôles et Système (Vérification du Temps) ---
        const now = getCDate(); 
        if (now) { 
            if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR');
            
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

        // --- 3. Vitesse, Distance ---
        const speedKmh = currentSpeedMs * KMH_MS; 
        
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 5, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 5, ' m/s'); 
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 5, ' m/s');
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        // Distance
        const displayTotalDistance = totalDistanceM * (netherMode ? (1/8) : 1);
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(displayTotalDistance);
        
        // --- 4. Météo ---
        if ($('mass-display')) $('mass-display').textContent = `${dataOrDefault(currentMass, 3)} kg`;
        if (lastKnownWeather && lastKnownWeather.main) {
            if ($('weather-status')) $('weather-status').textContent = 'Actif';
            if ($('air-temp')) $('air-temp').textContent = dataOrDefault(currentTemperatureC, 1, '°C');
            if ($('pressure')) $('pressure').textContent = dataOrDefault(currentPressureHpa, 0, ' hPa');
        } else {
             if ($('weather-status')) $('weather-status').textContent = 'INACTIF';
        }

        // --- 5. Dynamique & Forces (seulement la gravité locale, le reste est dans updateRelativityAndForces) ---
        if ($('gravity-local')) $('gravity-local').textContent = dataOrDefault(currentG_Acc, 4, ' m/s²');
        
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
            
            let ukfState = null;
            let P = null;

            try {
                 if (ukf.isInitialized() && typeof math !== 'undefined') {
                     ukfState = ukf.getState();
                     P = ukf.getStateCovariance();
                 }
            } catch (e) {
                 // Géré dans la boucle de prédiction, ici on affiche N/A.
            }

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
            if ($('ekf-status')) $('ekf-status').textContent = 'INACTIF / UKF Manquant';
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
        
        if ($('mass-input')) {
            $('mass-input').addEventListener('input', (e) => {
                currentMass = parseFloat(e.target.value) || 70.0;
                if ($('mass-display')) $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
            });
            if ($('mass-display')) $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
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
    } else {
        console.error("CRITIQUE: UKF ou dépendances (math.js) introuvables. Fusion désactivée.");
    }
    
    syncH(); 
    
    // 2. Attacher les événements utilisateur
    setupEventListeners();

    // 3. Boucles de rafraîchissement
    
    // Boucle rapide (Affichage/Prédiction UKF/Relativité) - 20 Hz
    setInterval(() => {
         const currentTime = new Date().getTime();
         dt_prediction = (currentTime - lastPredictionTime) / 1000.0;
         lastPredictionTime = currentTime;
         
         // 1. PRÉDICTION UKF (Fusion complète IMU)
         let ukfState = { lat: currentPosition.lat, lon: currentPosition.lon, alt: currentAltitudeM, speed: rawSpeedMs };

         if (!isGpsPaused && ukf && typeof ukf.predict === 'function' && dt_prediction > 0 && ukf.isInitialized()) {
             const rawAccels = [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z];
             const rawGyros = [currentGyroRadS_X, currentGyroRadS_Y, currentGyroRadS_Z];
             
             try {
                 ukf.predict(dt_prediction, rawAccels, rawGyros); 
                 ukfState = ukf.getState();
                 currentSpeedMs = ukfState.speed;
                 
             } catch (e) {
                 console.error("🔴 ERREUR CRITIQUE UKF DANS LA PRÉDICTION. Réinitialisation complète...", e);
                 if (typeof ukf.reset === 'function') {
                      ukf.reset(currentPosition.lat, currentPosition.lon, currentAltitudeM);
                 } 
                 currentSpeedMs = rawSpeedMs; 
                 gpsStatusMessage = 'ERREUR UKF (Réinitialisation)';
             }
         } else if (!isGpsPaused) {
             currentSpeedMs = rawSpeedMs; 
         }

         // 2. Mise à jour des calculs de physique/relativité (Dépend de la vitesse UKF)
         updateRelativityAndForces(ukfState); 

         // 3. Affichage
         updateDashboardDOM(); 
         
    }, 50); // Fréquence finale: 20 Hz (50ms)
    
    // Boucle lente (Météo/Astro/NTP/Physique) - 1Hz
    setInterval(() => {
        updateTimeCounters(); 
        
        if (!isGpsPaused && currentPosition.lat !== 0.0 && currentPosition.lon !== 0.0) {
             
             // 1. Astro (si le fichier est inclus)
             if (typeof updateAstro === 'function') {
                 try {
                     const now = getCDate();
                     updateAstro(currentPosition.lat, currentPosition.lon, currentAltitudeM, now);
                 } catch (e) {
                     console.error("🔴 ERREUR ASTRO : Échec de la mise à jour astronomique.", e);
                 }
             }

             // 2. Météo (toutes les 60s)
             if (weatherUpdateCounter % 60 === 0) { 
                 // ⚠️ REMPLACER VOTRE_PROXY_URL
                 const proxyUrl = 'VOTRE_PROXY_URL/api/weather'; 
                 fetchWeather(currentPosition.lat, currentPosition.lon)
                     .then(data => { 
                         lastKnownWeather = data;
                         currentTemperatureC = data.main.temp;
                         currentPressureHpa = data.main.pressure;
                         const fusionAlt = (ukf && ukf.isInitialized() ? ukf.getState().alt : currentAltitudeM);
                         updatePhysicalStateAndDOM(fusionAlt); 
                     })
                     .catch(err => console.error("🔴 ERREUR MÉTÉO : Échec du fetch météo.", err));
                 weatherUpdateCounter = 0; 
             }
             weatherUpdateCounter++;

        }
         // Si pas de GPS, mettre à jour l'état physique avec les valeurs par défaut ou les dernières connues
         const fusionAlt = (ukf && ukf.isInitialized() ? ukf.getState().alt : currentAltitudeM);
         updatePhysicalStateAndDOM(fusionAlt); 
         syncH(); 
    }, 1000); 

    // 4. Afficher l'état initial
    updateDashboardDOM();   

});

})(window);
