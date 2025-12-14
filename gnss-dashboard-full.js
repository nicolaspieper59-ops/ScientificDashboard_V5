// =================================================================
// FICHIER COMPLET 2/2 : GNSS SPACETIME DASHBOARD - V38 INS PROFESSIONNEL (CORRIGÉ)
// STRATÉGIE: Utilisation exclusive de l'UKF/INS à 50Hz pour la navigation.
// CORRECTIONS:
// 1. Initialisation UKF immédiate sur la position de référence (Correction Délai).
// 2. Réintégration des calculs Astronomiques (Boucle 1Hz).
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
    
    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let gpsStatusMessage = 'Attente du signal GPS...'; 
    let lastPredictionTime = Date.now();
    let sessionStartTime = Date.now(); 
    
    // Variables de capteurs (entrées UKF)
    // CORRECTION V38 : Initialisation avec les coordonnées de la station de référence
    let currentPosition = { lat: 43.284585, lon: 5.358651, alt: 100.00, acc: 1000, speed: 0 }; 
    let curAcc = {x: 0, y: 0, z: G_ACC_STD}, curGyro = {x: 0, y: 0, z: 0};
    
    // Variables de sortie UKF/Fusion (affichées)
    let fusionState = null;
    let currentSpeedMs = 0.0;   
    let totalDistanceM = 0.0; 
    let maxSpeedMs = 0.0; 
    
    // Variable pour l'Astro
    let astroState = null;
    
    const $ = id => document.getElementById(id);
    
    // --- Utilitaires d'Affichage ---
    const getCDate = () => new Date();
    
    const dataOrDefault = (val, decimals, suffix = '', hideZero = false) => {
        if (val === undefined || val === null || isNaN(val) || typeof val !== 'number') return 'N/A';
        if (hideZero && val === 0) return 'N/A';
        return val.toFixed(decimals) + suffix;
    };
    const formatDistance = (m) => {
        if (m < 1000) return dataOrDefault(m, 2, ' m'); 
        return dataOrDefault(m / 1000, 3, ' km');
    };
    
    /**
     * Formate un nombre d'heures (0-24) au format H:M:S. (Utilité Astro)
     */
    function formatHours(hours) {
        if (isNaN(hours)) return 'N/A';
        let h = hours % 24;
        if (h < 0) h += 24;
        const H = Math.floor(h).toString().padStart(2, '0');
        const M = Math.floor((h % 1) * 60).toString().padStart(2, '0');
        return `${H}h ${M}min`;
    }

    // =================================================================
    // BLOC 2/5 : HANDLERS DE CAPTEURS (IMU & GPS)
    // =================================================================

    const handleDeviceMotion = (event) => {
        isIMUActive = true;
        const acc = event.accelerationIncludingGravity;
        const rot = event.rotationRate;
        
        if (acc) {
            curAcc.x = curAcc.x * 0.8 + (acc.x || 0.0) * 0.2;
            curAcc.y = curAcc.y * 0.8 + (acc.y || 0.0) * 0.2;
            curAcc.z = curAcc.z * 0.8 + (acc.z || G_ACC_STD) * 0.2; 
        }
        if (rot) {
            curGyro.x = (rot.alpha || 0.0) * D2R; 
            curGyro.y = (rot.beta || 0.0) * D2R;  
            curGyro.z = (rot.gamma || 0.0) * D2R; 
        }
    };

    const requestMotionPermission = () => {
         // ... (Logique de permission IMU) ...
         if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') {
                        window.addEventListener('devicemotion', handleDeviceMotion);
                        isIMUActive = true;
                    }
                })
                .catch(console.error);
        } else {
            window.addEventListener('devicemotion', handleDeviceMotion);
            isIMUActive = true;
        }
    };
    
    const handleGpsSuccess = (pos) => {
        const c = pos.coords;
        currentPosition = { lat: c.latitude, lon: c.longitude, alt: c.altitude || 0, acc: c.accuracy, speed: c.speed || 0 };

        // CORRECTION V38 : L'initialisation se fait au chargement. Ici, on ne fait que la correction.
        if (ukf && ukf.isInitialized()) {
            try {
                ukf.update(pos); 
                gpsStatusMessage = `Fix: ${dataOrDefault(c.accuracy, 1)}m (UKF)`;
            } catch (e) {
                console.error("🔴 ERREUR CRITIQUE UKF DANS LA CORRECTION GPS.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
            }
        } else {
             // Si l'UKF est en attente (jamais initialisé malgré le load, cas d'erreur)
             gpsStatusMessage = `Acquisition OK (Précision: ${dataOrDefault(c.accuracy, 1)}m)`;
        }
    };
    
    const startGpsTracking = () => {
        if (gpsWatchID !== null) return;
        if (navigator.geolocation) {
            // NOTE : timeout: 5000 est court pour le premier fix. Le laisser ainsi pour tester la robustesse.
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
        window.removeEventListener('devicemotion', handleDeviceMotion);
        isIMUActive = false;
        gpsStatusMessage = 'Arrêté (Pause)';
    };

    // =================================================================
    // BLOC 3/5 : FONCTIONS D'AFFICHAGE ET UTILITAIRES
    // =================================================================

    const updateTimeCounters = () => {
        const now = getCDate();
        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString();
        if ($('utc-datetime')) $('utc-datetime').textContent = now.toISOString().replace('T', ' ').split('.')[0] + ' (UTC)';
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault((Date.now() - sessionStartTime)/1000, 2, ' s');
    };
    
    const updateSpiritLevel = (pitchRad, rollRad) => {
        const MAX_OFFSET_PX = 40; 
        const P_norm = Math.min(Math.max(pitchRad, -0.5), 0.5) / 0.5;
        const R_norm = Math.min(Math.max(rollRad, -0.5), 0.5) / 0.5;
        const dx = R_norm * MAX_OFFSET_PX * 1.5; 
        const dy = P_norm * MAX_OFFSET_PX * -1.5; 
        const bubble = $('bubble');
        if (bubble) bubble.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const updateRelativityAndForces = (speed, mass = 70.0) => {
        const beta = speed / C_L;
        const betaSq = beta**2;
        const lorentzFactor = (betaSq < 1) ? 1.0 / Math.sqrt(1.0 - betaSq) : 1.0; 
        
        if ($('%speed-of-light')) $('%speed-of-light').textContent = dataOrDefault(beta * 100, 2) + ' %';
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentzFactor, 9);
        if ($('energy-kinetic')) $('energy-kinetic').textContent = dataOrDefault(0.5 * mass * speed**2, 2, ' J');
        if ($('schwarzschild-radius')) $('schwarzschild-radius').textContent = dataOrDefault((2 * 6.67430e-11 * mass) / C_L**2, 2, ' m', true); 
    };

    /**
     * Mise à jour du panneau ASTRO avec les données calculées par astro.js
     */
    const updateAstroDOM = (astroData) => {
        if (!astroData) return;

        // --- Temps Solaire & Sidéral ---
        if ($('date-astro')) $('date-astro').textContent = astroData.date_astro || 'N/A';
        if ($('mean-solar-date')) $('mean-solar-date').textContent = astroData.MST_Date || 'N/A';
        if ($('true-solar-date')) $('true-solar-date').textContent = astroData.TST_Date || 'N/A';
        if ($('heure-solaire-vraie')) $('heure-solaire-vraie').textContent = dataOrDefault(astroData.TST_HRS, 4);
        if ($('heure-solaire-moyenne')) $('heure-solaire-moyenne').textContent = dataOrDefault(astroData.MST_HRS, 4);
        if ($('noon-solar-utc')) $('noon-solar-utc').textContent = astroData.NOON_SOLAR_UTC || 'N/A';
        if ($('equation-of-time')) $('equation-of-time').textContent = dataOrDefault(astroData.EOT_MIN, 2, ' min');
        if ($('true-sidereal-time')) $('true-sidereal-time').textContent = astroData.LST_DEG ? dataOrDefault(astroData.LST_DEG/15, 4) : 'N/A'; // LST_DEG en heures
        if ($('ecliptic-longitude')) $('ecliptic-longitude').textContent = dataOrDefault(astroData.ECL_LONG, 2, '°');

        // --- Soleil ---
        if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(astroData.sun.altitude * R2D, 2, '°');
        if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(astroData.sun.azimuth * R2D, 2, '°');
        if ($('day-duration')) $('day-duration').textContent = astroData.sun.duration_hrs ? formatHours(astroData.sun.duration_hrs) : 'N/A';
        if ($('sun-rise')) $('sun-rise').textContent = astroData.sun.rise_local || 'N/A'; 
        if ($('sun-set')) $('sun-set').textContent = astroData.sun.set_local || 'N/A';

        // --- Lune ---
        if ($('moon-phase')) $('moon-phase').textContent = astroData.moon.illumination.phase_name || 'N/A';
        if ($('moon-illumination')) $('moon-illumination').textContent = dataOrDefault(astroData.moon.illumination.fraction * 100, 1, ' %');
        if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(astroData.moon.altitude * R2D, 2, '°');
        if ($('moon-azimuth')) $('moon-azimuth').textContent = dataOrDefault(astroData.moon.azimuth * R2D, 2, '°');
        // Affichage des heures de lever/coucher de la Lune
        const moonTimes = (astroData.moon.times.rise_local && astroData.moon.times.set_local) ? `${astroData.moon.times.rise_local} / ${astroData.moon.times.set_local}` : 'N/A';
        if ($('moon-times')) $('moon-times').textContent = moonTimes;
        if ($('moon-distance')) $('moon-distance').textContent = dataOrDefault(astroData.moon.distance / 1000, 0, ' km');
    };

    function updateDashboardDOM(ukfState, isFusionActive) {
        
        // --- 1. Vitesse & Distance (UTILISATION UKF EXCLUSIVE) ---
        const speedMs = ukfState ? ukfState.speed : currentPosition.speed;
        const speedKmh = speedMs * KMH_MS;
        
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speedKmh, 1, ' km/h'); 
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 5, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(speedMs, 5, ' m/s'); 
        if ($('vitesse-brute-ms')) $('vitesse-brute-ms').textContent = dataOrDefault(currentPosition.speed, 2, ' m/s'); 
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(totalDistanceM); 
        
        // --- 2. Position & EKF/UKF (Coordonnées estimées INS) ---
        const displayLat = ukfState ? ukfState.lat : currentPosition.lat;
        const displayLon = ukfState ? ukfState.lon : currentPosition.lon;
        const displayAlt = ukfState ? ukfState.alt : currentPosition.alt;

        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(displayLat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(displayLon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = dataOrDefault(displayAlt, 2, ' m');
        if ($('acc-gps')) $('acc-gps').textContent = dataOrDefault(currentPosition.acc, 2, ' m'); 
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage;

        // --- 3. IMU/Attitude ---
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 3, ' m/s²');
        if ($('imu-status')) $('imu-status').textContent = isIMUActive ? 'Actif' : 'Inactif';

        // 4. État Fusion et Niveau à Bulle
        if (isFusionActive) {
            $('ekf-status').textContent = 'Actif (INS 50Hz)';
            const pitchDeg = ukfState.pitch * R2D;
            const rollDeg = ukfState.roll * R2D;
            
            if ($('inclinaison-pitch')) $('inclinaison-pitch').textContent = dataOrDefault(pitchDeg, 1, '°');
            if ($('roulis-roll')) $('roulis-roll').textContent = dataOrDefault(rollDeg, 1, '°');
            
            // Forces G
            if ($('force-g-vert')) $('force-g-vert').textContent = dataOrDefault(curAcc.z / G_ACC_STD, 2, ' G');
            
            updateSpiritLevel(ukfState.pitch, ukfState.roll); 
            if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(ukfState.cov_vel), 3, ' m/s');
        } else {
             $('ekf-status').textContent = ukf ? 'Initialisation... (Attente GPS)' : 'Initialisation...';
             // Fall back pour le niveau à bulle (IMU brut)
             const roll = Math.atan2(curAcc.y, curAcc.z);
             const pitch = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y**2 + curAcc.z**2));
             if ($('inclinaison-pitch')) $('inclinaison-pitch').textContent = dataOrDefault(pitch * R2D, 1, '°');
             if ($('roulis-roll')) $('roulis-roll').textContent = dataOrDefault(roll * R2D, 1, '°');
             updateSpiritLevel(pitch, roll); 
        }

        updateRelativityAndForces(speedMs);
    }
    
    // =================================================================
    // BLOC 4/5 : BOUCLE PRINCIPALE (50 Hz) - PRÉDICTION INS
    // =================================================================
    
    setInterval(() => {
         if (isGpsPaused) {
             // Afficher l'état de pause si l'UKF n'est pas actif
             updateDashboardDOM(fusionState, ukf && ukf.isInitialized()); 
             return;
         }
         
         const now = Date.now();
         let dt_prediction = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         let isFusionActive = ukf && ukf.isInitialized();
         
         // 1. PRÉDICTION UKF (INS - Propagation Inertielle)
         if (isFusionActive && dt_prediction > 0) {
             try {
                 ukf.predict(dt_prediction, [curAcc.x, curAcc.y, curAcc.z], [curGyro.x, curGyro.y, curGyro.z]);
                 fusionState = ukf.getState();
                 currentSpeedMs = fusionState.speed; 
                 
                 // Intégration 3D de la distance
                 if (currentSpeedMs > 0.05) {
                    totalDistanceM += currentSpeedMs * dt_prediction;
                 }
                 
             } catch (e) {
                 console.error("🔴 ERREUR UKF CRITIQUE DANS LA PRÉDICTION.", e);
                 isFusionActive = false; 
                 fusionState = null;
                 currentSpeedMs = currentPosition.speed;
             }
         } else {
             // Mode Fall Back (GPS brut)
             currentSpeedMs = currentPosition.speed;
             fusionState = null;
             if(currentSpeedMs > 0.05) totalDistanceM += currentSpeedMs * dt_prediction;
         }
         
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         // updateTimeCounters(); // Déplacé dans la boucle 1Hz
         updateDashboardDOM(fusionState, isFusionActive); 
         
    }, 20); // 50 Hz

    // =================================================================
    // BLOC 5/5 : INITIALISATION ET CONTRÔLES (1 Hz)
    // =================================================================
    
    setInterval(() => {
        updateTimeCounters(); // Mise à jour des compteurs (1 Hz)

        // Récupérer la position la plus fiable (UKF ou GPS brut initial)
        const fusionLat = ukf && ukf.isInitialized() ? ukf.getState().lat : currentPosition.lat;
        const fusionLon = ukf && ukf.isInitialized() ? ukf.getState().lon : currentPosition.lon;
        const fusionAlt = ukf && ukf.isInitialized() ? ukf.getState().alt : currentPosition.alt;

        // --- Logique Astronomie ---
        if (!isGpsPaused && fusionLat !== 0.0 && typeof updateAstro === 'function') {
            try {
                // Utilisation de la position fusionnée pour des calculs précis
                astroState = updateAstro(fusionLat, fusionLon, fusionAlt, getCDate()); 
                updateAstroDOM(astroState); // Mise à jour du DOM Astro
            } catch (e) {
                console.error("🔴 ERREUR ASTRO : Échec de la mise à jour astronomique.", e);
            }
        } else if (typeof updateAstro === 'function') {
             // Mettre à jour si la pause est active pour ne pas afficher N/A en continu
             // Exemple : astroState = updateAstro(fusionLat, fusionLon, fusionAlt, getCDate()); 
             // updateAstroDOM(astroState);
        }
        
        // (Logique Météo/Physique 1Hz ici)

    }, 1000); 

    const togglePause = () => {
        isGpsPaused = !isGpsPaused;
        const btn = $('gps-pause-toggle');
        
        if (!isGpsPaused) {
            btn.textContent = '⏸️ PAUSE GPS';
            sessionStartTime = Date.now(); 
            requestMotionPermission();
            startGpsTracking();
        } else {
            btn.textContent = '▶️ MARCHE GPS';
            stopGpsTracking();
        }
    };

    window.addEventListener('load', () => {
        const btn = $('gps-pause-toggle');
        if (btn) btn.addEventListener('click', togglePause);
        
        // --- CORRECTION CRITIQUE V38: INITIALISATION IMMÉDIATE DE L'UKF ---
        if (typeof ProfessionalUKF !== 'undefined' && !ukf) {
            const refPos = currentPosition; // Utiliser la position de référence du BLOC 1
            ukf = new ProfessionalUKF(refPos.lat, refPos.lon, refPos.alt);
            ukf.initialize(refPos.lat, refPos.lon, refPos.alt);
            fusionState = ukf.getState(); 
            console.log("✅ UKF (INS) créé et initialisé avec la position de référence.");
        }
        // ------------------------------------------------------------------

        if($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', () => totalDistanceM = 0);
        if($('reset-max-btn')) $('reset-max-btn').addEventListener('click', () => maxSpeedMs = 0);
        if($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => { 
             totalDistanceM = 0; maxSpeedMs = 0; fusionState = null; 
             if(ukf) ukf.reset(currentPosition.lat, currentPosition.lon, currentPosition.alt);
        });
        
        updateDashboardDOM(fusionState, ukf && ukf.isInitialized()); 
    });

})(window);
