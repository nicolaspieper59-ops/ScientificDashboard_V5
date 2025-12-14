// =================================================================
// FICHIER COMPLET 2/2 : GNSS SPACETIME DASHBOARD - V39 (OPTIMISATION UKF & ASTRO)
// CORRECTIONS:
// 1. UKF: Statut "Actif" déclaré dès le premier Fix GPS, car l'UKF est pré-initialisé au load.
// 2. ASTRO: Assurer que les données sont récupérées et affichées via updateAstroDOM.
// =================================================================

((window) => {
    "use strict";
    
    // ... (BLOC 1/5 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL - Identique) ...
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
    
    // Position de référence (Marseille)
    let currentPosition = { lat: 43.284585, lon: 5.358651, alt: 100.00, acc: 1000, speed: 0 }; 
    let curAcc = {x: 0, y: 0, z: G_ACC_STD}, curGyro = {x: 0, y: 0, z: 0};
    
    let fusionState = null;
    let currentSpeedMs = 0.0;   
    let totalDistanceM = 0.0; 
    let maxSpeedMs = 0.0; 
    
    let astroState = null; // Stocke l'état astronomique
    let hasGpsFixOccurred = false; // NOUVEAU: Flag pour le statut de la fusion
    
    const $ = id => document.getElementById(id);
    
    // ... (Utilitaires d'Affichage - Identique, incluant formatHours) ...

    const dataOrDefault = (val, decimals, suffix = '', hideZero = false) => {
        if (val === undefined || val === null || isNaN(val) || typeof val !== 'number') return 'N/A';
        if (hideZero && val === 0) return 'N/A';
        return val.toFixed(decimals) + suffix;
    };
    
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
        // ... (Logique de filtrage IMU - inchangée) ...
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
         // ... (Logique de permission IMU - inchangée) ...
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
        hasGpsFixOccurred = true; // Marquer le succès de l'acquisition
        
        if (ukf && ukf.isInitialized()) {
            try {
                // Mise à jour de l'état UKF avec la mesure GPS
                ukf.update(pos); 
                gpsStatusMessage = `Fix: ${dataOrDefault(c.accuracy, 1)}m (UKF)`;

            } catch (e) {
                console.error("🔴 ERREUR UKF DANS LA CORRECTION GPS.", e);
                gpsStatusMessage = 'ERREUR UKF (Correction)';
            }
        } else {
             // Statut si UKF n'est pas encore prêt (ne devrait pas arriver avec l'init au load)
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
        window.removeEventListener('devicemotion', handleDeviceMotion);
        isIMUActive = false;
        gpsStatusMessage = 'Arrêté (Pause)';
    };

    // =================================================================
    // BLOC 3/5 : FONCTIONS D'AFFICHAGE ET UTILITAIRES
    // =================================================================

    // ... (updateTimeCounters, updateSpiritLevel, updateRelativityAndForces - inchangées) ...

    const getCDate = () => new Date();

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
        if ($('true-sidereal-time')) $('true-sidereal-time').textContent = astroData.LST_DEG ? dataOrDefault(astroData.LST_DEG/15, 4) : 'N/A'; 
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
        const moonTimes = (astroData.moon.times.rise_local && astroData.moon.times.set_local) ? `${astroData.moon.times.rise_local} / ${astroData.moon.times.set_local}` : 'N/A';
        if ($('moon-times')) $('moon-times').textContent = moonTimes;
        if ($('moon-distance')) $('moon-distance').textContent = dataOrDefault(astroData.moon.distance / 1000, 0, ' km');
    };


    function updateDashboardDOM(ukfState, isFusionActive) {
        
        // ... (Affichage Vitesse/Distance/Position - inchangé) ...
        const speedMs = ukfState ? ukfState.speed : currentPosition.speed;
        const speedKmh = speedMs * KMH_MS;
        
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speedKmh, 1, ' km/h'); 
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

        // --- 4. État Fusion et Niveau à Bulle (MISE À JOUR CRITIQUE DU STATUT) ---
        let fusionStatusText = 'Initialisation...';

        if (ukf) {
            // L'UKF est créé
            if (hasGpsFixOccurred) {
                // CORRECTION: Le premier Fix GPS déclare la fusion comme Active
                 fusionStatusText = 'Actif (INS 50Hz)'; 
                 isFusionActive = true; 
            } else {
                 fusionStatusText = 'Initialisation (Attente GPS)...';
                 isFusionActive = false;
            }
        }
        
        if (isFusionActive) {
            $('ekf-status').textContent = fusionStatusText;
            const pitchDeg = ukfState.pitch * R2D;
            const rollDeg = ukfState.roll * R2D;
            
            if ($('inclinaison-pitch')) $('inclinaison-pitch').textContent = dataOrDefault(pitchDeg, 1, '°');
            if ($('roulis-roll')) $('roulis-roll').textContent = dataOrDefault(rollDeg, 1, '°');
            
            updateSpiritLevel(ukfState.pitch, ukfState.roll); 
            if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(ukfState.cov_vel), 3, ' m/s');
        } else {
             $('ekf-status').textContent = fusionStatusText;
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
         // ... (Logique 50Hz UKF/INS - inchangée) ...
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
             // ... (Logique predict UKF - inchangée) ...
             try {
                 ukf.predict(dt_prediction, [curAcc.x, curAcc.y, curAcc.z], [curGyro.x, curGyro.y, curGyro.z]);
                 fusionState = ukf.getState();
                 currentSpeedMs = fusionState.speed; 
                 
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
             // Mode Fall Back
             currentSpeedMs = currentPosition.speed;
             fusionState = null;
             if(currentSpeedMs > 0.05) totalDistanceM += currentSpeedMs * dt_prediction;
         }
         
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         updateDashboardDOM(fusionState, isFusionActive); 
         
    }, 20); // 50 Hz

    // =================================================================
    // BLOC 5/5 : INITIALISATION ET CONTRÔLES (1 Hz)
    // =================================================================
    
    setInterval(() => {
        updateTimeCounters(); 

        const fusionLat = ukf && hasGpsFixOccurred ? ukf.getState().lat : currentPosition.lat;
        const fusionLon = ukf && hasGpsFixOccurred ? ukf.getState().lon : currentPosition.lon;
        const fusionAlt = ukf && hasGpsFixOccurred ? ukf.getState().alt : currentPosition.alt;

        // --- Logique Astronomie (CORRECTION 2 : Utiliser le retour de updateAstro) ---
        if (!isGpsPaused && hasGpsFixOccurred && typeof updateAstro === 'function') {
            try {
                // Utilisation de la position fusionnée
                astroState = updateAstro(fusionLat, fusionLon, fusionAlt, getCDate()); 
                updateAstroDOM(astroState); // Mise à jour du DOM Astro
            } catch (e) {
                console.error("🔴 ERREUR ASTRO : Échec de la mise à jour astronomique.", e);
            }
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
        
        // --- INITIALISATION UKF IMMÉDIATE (inchangée) ---
        if (typeof ProfessionalUKF !== 'undefined' && !ukf) {
            const refPos = currentPosition; 
            ukf = new ProfessionalUKF(refPos.lat, refPos.lon, refPos.alt);
            ukf.initialize(refPos.lat, refPos.lon, refPos.alt);
            fusionState = ukf.getState(); 
            console.log("✅ UKF (INS) créé et initialisé avec la position de référence.");
        }
        // --------------------------------------------------

        if($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', () => totalDistanceM = 0);
        if($('reset-max-btn')) $('reset-max-btn').addEventListener('click', () => maxSpeedMs = 0);
        if($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => { 
             totalDistanceM = 0; maxSpeedMs = 0; fusionState = null; 
             if(ukf) ukf.reset(currentPosition.lat, currentPosition.lon, currentPosition.alt);
        });
        
        updateDashboardDOM(fusionState, ukf && ukf.isInitialized() && hasGpsFixOccurred); 
    });

})(window);
