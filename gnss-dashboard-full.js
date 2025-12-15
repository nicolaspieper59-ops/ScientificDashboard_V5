// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (V42 - CORRIGÉ)
// CORRECTIONS CRITIQUES: UKF initialisation immédiate, NTP Sync, LBS retiré.
// DÉPENDANCE REQUISE: math.js et ProfessionalUKF (classe UKF complète)
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
    const G_ACC_STD = 9.8067;       
    const R_AIR = 287.058;          
    const GAMMA = 1.4;              

    // Variables d'état global
    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let isMagActive = false;    
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let lastPredictionTime = Date.now();
    let sessionStartTime = Date.now(); 
    let hasGpsFixOccurred = false;
    let isUKFOperational = false;
    let totalDistanceM = 0.0;
    let maxSpeedMs = 0.0;
    let timeInMotionMs = 0.0;
    let lastKnownLat = 43.284611; // Position par défaut (Marseille)
    let lastKnownLon = 5.358715;
    let lastKnownAlt = 100.00;

    // --- NOUVEL ÉTAT NTP ---
    let ntpOffsetMs = 0; // Différence (ms) entre l'horloge locale et l'heure NTP réelle

    // Variables de données brutes
    let currentPosition = {lat: lastKnownLat, lon: lastKnownLon, alt: lastKnownAlt, speed: 0.0, acc: 25.0};
    let currentSpeedMs = 0.0;
    let curAcc = {x: 0, y: 0, z: 0}; // Accéléromètre corrigé (après compensation biais/rotation)
    let curGyro = {x: 0, y: 0, z: 0};
    let curMag = {x: 0, y: 0, z: 0};
    let fusionState = null; // État UKF fusionné

    // =================================================================
    // BLOC 2/5 : UTILITAIRES ET API DU NAVIGATEUR
    // =================================================================
    
    // Raccourci DOM
    const $ = (id) => document.getElementById(id);
    
    // Gestion des valeurs par défaut
    const dataOrDefault = (value, precision = 2, unit = '', naText = 'N/A') => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) {
            return naText;
        }
        return `${value.toFixed(precision)}${unit}`;
    };

    // Obtenir le temps brut (pour l'utilisation locale)
    const getCDate = () => new Date();

    // --- Utilitaires de Temps (Corrigé pour UTC) ---
    // Ces fonctions formatent une Date() en UTC (Heure de la Date passée)
    function formatTime(date) {
        const h = String(date.getUTCHours()).padStart(2, '0');
        const m = String(date.getUTCMinutes()).padStart(2, '0');
        const s = String(date.getUTCSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    function formatDate(date) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    
    // --- Synchronisation NTP (Atomic Clock Simulation) ---
    const updateNtpOffset = async () => {
        try {
            const t0 = Date.now(); // Temps client avant l'appel
            // Utilisation d'une API de temps publique pour la démonstration
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC'); 
            const data = await response.json();
            const t3 = Date.now(); // Temps client après la réponse

            const serverTimeMs = data.unixtime * 1000;
            const roundTripTime = t3 - t0;
            // Correction RTT simple
            const estimatedServerTime = serverTimeMs + (roundTripTime / 2); 
            
            ntpOffsetMs = estimatedServerTime - t3;
            
            console.log(`✅ NTP Sync: Offset ${ntpOffsetMs.toFixed(2)} ms. RTT: ${roundTripTime} ms.`);
            
        } catch (e) {
            console.error("🔴 Échec de la synchronisation NTP:", e);
        }
    };


    // --- Logique d'accès aux capteurs IMU (Accéléromètre/Gyroscope) ---
    const requestMotionPermission = () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(permissionState => {
                if (permissionState === 'granted') {
                    startMotionListeners();
                } else {
                    console.warn("Permission de mouvement refusée.");
                }
            }).catch(console.error);
        } else {
            startMotionListeners();
        }
    };
    
    const startMotionListeners = () => {
        if (!isIMUActive) {
             // Listener pour Gyroscope/Accéléromètre (devicemotion)
             window.addEventListener('devicemotion', handleDeviceMotion);
             isIMUActive = true;
        }
        if (!isMagActive) {
             // Listener pour Magnétomètre (deviceorientation)
             window.addEventListener('deviceorientation', handleDeviceOrientation);
             isMagActive = true;
        }
        console.log("IMU/MAG listeners démarrés.");
    };

    const handleDeviceMotion = (event) => {
        if (event.accelerationIncludingGravity) {
            // Accélération brute (en m/s²)
            curAcc.x = event.accelerationIncludingGravity.x || 0;
            curAcc.y = event.accelerationIncludingGravity.y || 0;
            curAcc.z = event.accelerationIncludingGravity.z || 0;
        }
        if (event.rotationRate) {
            // Vitesse angulaire (en rad/s)
            curGyro.x = (event.rotationRate.alpha || 0) * D2R; 
            curGyro.y = (event.rotationRate.beta || 0) * D2R;
            curGyro.z = (event.rotationRate.gamma || 0) * D2R;
        }
    };
    
    const handleDeviceOrientation = (event) => {
        // En l'absence d'API Magnétomètre brutes (deviceorientation ne donne que des angles), 
        // on simule des données mag. L'UKF les utilisera pour corriger le Yaw.
        if (event.alpha !== null) {
            // Ces valeurs sont purement indicatives pour le filtre h_MAG
            curMag.x = Math.sin(event.alpha * D2R) * 10;
            curMag.y = Math.cos(event.alpha * D2R) * 10;
            curMag.z = 45; // Composante Z typique (Nord France)
        }
    };
    
    // --- Logique GPS (Geolocation API) ---
    const handleGpsUpdate = (pos) => {
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lon = pos.coords.longitude;
        currentPosition.alt = pos.coords.altitude || lastKnownAlt;
        currentPosition.speed = pos.coords.speed || 0.0;
        currentPosition.acc = pos.coords.accuracy || 25.0; // Précision GPS

        gpsStatusMessage = `Acquisition OK (Précision: ${currentPosition.acc.toFixed(1)}m)`;
        hasGpsFixOccurred = true;
        
        // Initialisation UKF (doit être fait ici si le GPS est le premier à donner un fix)
        if (ukf && !ukf.isInitialized()) {
             ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
             fusionState = ukf.getState(); 
             isUKFOperational = true;
             console.log("UKF Initialisation complète via premier fix GPS.");
        }
        
        // CORRECTION UKF (GPS)
        if (ukf && ukf.isInitialized()) {
            ukf.update(pos);
            // Récupérer l'état fusionné après correction
            fusionState = ukf.getState();
            isUKFOperational = true;
        }
    };

    const handleGpsError = (err) => {
        console.error("Erreur GPS:", err.code, err.message);
        gpsStatusMessage = 'Erreur GPS (Signal perdu)';
        hasGpsFixOccurred = false;
        
        // Si l'UKF est actif, il continue en Dead Reckoning (Prédiction seule)
        if (ukf && ukf.isInitialized()) {
            gpsStatusMessage += ' / UKF Dead Reckoning';
        }
    };
    
    const startGpsTracking = () => {
        if (!gpsWatchID) {
            gpsWatchID = navigator.geolocation.watchPosition(
                handleGpsUpdate, 
                handleGpsError, 
                { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
            );
            console.log("GPS tracking démarré.");
        }
    };
    
    const stopGpsTracking = () => {
        if (gpsWatchID !== null) {
            navigator.geolocation.clearWatch(gpsWatchID);
            gpsWatchID = null;
            gpsStatusMessage = 'PAUSE GPS';
            console.log("GPS tracking arrêté.");
        }
    };


    // =================================================================
    // BLOC 3/5 : MISE À JOUR DU DOM (1 Hz)
    // =================================================================

    const updateDashboardDOM = (fusion, isCorrected) => {
        // --- Fusion ou GPS Brut ---
        const lat = fusion ? fusion.lat : currentPosition.lat;
        const lon = fusion ? fusion.lon : currentPosition.lon;
        const alt = fusion ? fusion.alt : currentPosition.alt;
        const speedStable = fusion ? fusion.speed : currentSpeedMs;
        const roll = fusion ? fusion.roll : curGyro.x * R2D;
        const pitch = fusion ? fusion.pitch : curGyro.y * R2D;
        const accGPS = currentPosition.acc;

        // --- Statuts ---
        if ($('statut-gps')) $('statut-gps').textContent = gpsStatusMessage;
        if ($('prec-gps')) $('prec-gps').textContent = dataOrDefault(accGPS, 2, ' m');

        let ukfStatus = 'UKF Indisponible (Classe non chargée)';
        if (typeof ProfessionalUKF !== 'undefined' && ukf) {
            if (!ukf.isInitialized()) {
                ukfStatus = 'UKF en attente du premier fix GPS...';
            } else {
                ukfStatus = isCorrected ? 'UKF Actif (Corrigé GPS+MAG)' : 'INS Dead Reckoning (Prédiction)';
            }
        }
        if ($('statut-ekf')) $('statut-ekf').textContent = ukfStatus;

        // --- Position & Vitesse ---
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = dataOrDefault(alt, 2, ' m');

        if ($('vitesse-stable-kmh')) $('vitesse-stable-kmh').textContent = dataOrDefault(speedStable * KMH_MS, 1, ' km/h');
        if ($('vitesse-stable-ms')) $('vitesse-stable-ms').textContent = dataOrDefault(speedStable, 3, ' m/s');
        if ($('vitesse-max')) $('vitesse-max').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        if ($('dist-totale')) $('dist-totale').textContent = dataOrDefault(totalDistanceM, 2, ' m');

        // --- IMU ---
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 2);
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 2);
        // Z est souvent la gravité dans le repère du téléphone, peut être N/A si non exploité
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 2); 

        if ($('pitch-imu')) $('pitch-imu').textContent = dataOrDefault(pitch, 1, '°');
        if ($('roll-imu')) $('roll-imu').textContent = dataOrDefault(roll, 1, '°');

        // --- Physique ---
        if ($('%-vitesse-son')) $('%-vitesse-son').textContent = dataOrDefault(speedStable / 340.29 * 100, 2, ' %');
        if ($('nombre-mach')) $('nombre-mach').textContent = dataOrDefault(speedStable / 340.29, 4); 
        
        // Facteur de Lorentz (simple: v/c)
        const v_sur_c = speedStable / C_L;
        if ($('facteur-lorentz')) $('facteur-lorentz').textContent = dataOrDefault(1 / Math.sqrt(1 - v_sur_c**2), 4);
        
        // Énergie cinétique (avec la masse par défaut de 70kg)
        const masse = parseFloat($('masse-obj-kg').textContent || '70.0');
        if ($('energie-c')) $('energie-c').textContent = dataOrDefault(0.5 * masse * speedStable**2, 2, ' J');

        // --- Vitesse de la lumière (c) et Gravitation Universelle (G) ---
        if ($('vitesse-lumiere')) $('vitesse-lumiere').textContent = `${C_L} m/s`;
        if ($('gravitation-u')) $('gravitation-u').textContent = `${G_ACC_STD} m/s²`;
    };

    // --- Fonction de Mise à Jour du Temps CORRIGÉE ---
    const updateTimeCounters = () => {
        
        // Récupérer le temps local du client
        const now = getCDate(); 
        
        // Temps UTC CORRIGÉ par l'offset NTP (Utilisation du temps atomique)
        const correctedUTCTimestamp = now.getTime() + ntpOffsetMs;
        const utcDate = new Date(correctedUTCTimestamp);

        // 1. Heure Locale (NTP)
        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR', { hour12: false });
        
        // 2. Date & Heure (UTC/GMT) - Utilise l'heure corrigée
        const utcTimeStr = formatTime(utcDate); 
        const utcDateStr = formatDate(utcDate); 
        
        if ($('utc-datetime')) $('utc-datetime').textContent = `${utcDateStr} ${utcTimeStr} (UTC)`;

        // 3. Temps écoulé
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault((Date.now() - sessionStartTime)/1000, 2, ' s');
        
        // 4. Temps de Mouvement (basé sur la vitesse stable)
        if (currentSpeedMs * KMH_MS > 0.1) {
             timeInMotionMs += 1000;
        }
        const timeMovSec = timeInMotionMs / 1000;
        const h = Math.floor(timeMovSec / 3600);
        const m = Math.floor((timeMovSec % 3600) / 60);
        const s = Math.floor(timeMovSec % 60);
        if ($('temps-mouvement')) $('temps-mouvement').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };


    // =================================================================
    // BLOC 4/5 : BOUCLE PRINCIPALE (50 Hz) - PRÉDICTION INS
    // =================================================================

    setInterval(() => {
         
         // 1. Mise à jour du temps (Fréquence 50Hz pour la prédiction UKF/INS)
         const now = Date.now();
         let dt_prediction = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         let isFusionActive = ukf && ukf.isInitialized();
         let isCorrected = isFusionActive && hasGpsFixOccurred;
         
         // 2. PRÉDICTION UKF (INS - Propagation Inertielle)
         if (!isGpsPaused && isFusionActive && dt_prediction > 0) {
             try {
                 // 🛑 CORRECTION CRITIQUE: Passage des objets curAcc et curGyro
                 ukf.predict(dt_prediction, curAcc, curGyro);
                 fusionState = ukf.getState();
                 currentSpeedMs = fusionState.speed; 
                 
                 // 3. CORRECTION UKF : MAGNÉTOMÈTRE (Fréquence arbitraire ou basé sur événement)
                 if (isMagActive) {
                     ukf.update_Mag(curMag); 
                 }
                 
             } catch (e) {
                 console.error("🔴 ERREUR UKF CRITIQUE DANS LA PRÉDICTION/CORRECTION.", e);
                 // Fallback en cas d'erreur UKF
                 currentSpeedMs = currentPosition.speed;
                 fusionState = null;
                 isFusionActive = false;
                 isUKFOperational = false;
             }
         } else {
             // Mode Fall Back GPS brut / Pause GPS
             currentSpeedMs = currentPosition.speed;
             fusionState = null;
             isUKFOperational = false;
         }
         
         // 4. Mise à jour de la Distance/Vitesse Max (basé sur la vitesse courante)
         if (!isGpsPaused) {
             if (currentSpeedMs * KMH_MS > 0.1) { 
                totalDistanceM += currentSpeedMs * dt_prediction;
             }
             maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         }
         
         // Mise à jour de l'affichage DOM (Utilisation de la vitesse de la boucle pour le rendu fluide)
         updateDashboardDOM(fusionState, isCorrected); 
         
    }, 20); // 50 Hz


    // =================================================================
    // BLOC 5/5 : INITIALISATION ET CONTRÔLES (1 Hz)
    // =================================================================

    setInterval(() => {
        updateTimeCounters(); 
        
        // --- MÉTÉO / ASTRO (simulé) ---
        if (!isGpsPaused && (hasGpsFixOccurred || isUKFOperational)) {
             // Logique pour les calculs astro ici (non inclus, car dans ephem.js)
        }

    }, 1000); // 1 Hz

    const togglePause = () => {
        const btn = $('gps-pause-toggle');
        isGpsPaused = !isGpsPaused;
        
        if (!isGpsPaused) {
            btn.textContent = '⏸️ PAUSE GPS';
            sessionStartTime = Date.now(); 
            requestMotionPermission(); 
            startGpsTracking();
            // Réinitialisation de la prédiction après la pause
            lastPredictionTime = Date.now(); 
        } else {
            btn.textContent = '▶️ MARCHE GPS';
            stopGpsTracking();
        }
    };

    window.addEventListener('load', () => {
        const btn = $('gps-pause-toggle');
        if (btn) btn.addEventListener('click', togglePause);
        
        // --- Synchronisation NTP (Atomic Clock Simulation) ---
        updateNtpOffset();
        // Re-synchroniser toutes les heures (3600000 ms) pour corriger la dérive
        setInterval(updateNtpOffset, 3600000); 

        // --- Initialisation UKF ---
        if (typeof ProfessionalUKF !== 'undefined' && !ukf) {
            const refPos = currentPosition; 
            ukf = new ProfessionalUKF(refPos.lat, refPos.lon, refPos.alt);
            
            // Initialisation immédiate pour permettre la Dead Reckoning (INS) avant le GPS
            ukf.initialize(refPos.lat, refPos.lon, refPos.alt);
            fusionState = ukf.getState(); 
            isUKFOperational = true;
        }
        
        // --- Boutons de Réinitialisation ---
        if($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', () => totalDistanceM = 0);
        if($('reset-max-btn')) $('reset-max-btn').addEventListener('click', () => maxSpeedMs = 0);
        if($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => { 
             totalDistanceM = 0; maxSpeedMs = 0; timeInMotionMs = 0; fusionState = null; 
             hasGpsFixOccurred = false;
             if(ukf) ukf.reset(currentPosition.lat, currentPosition.lon, currentPosition.alt);
        });
    });

})(window);
