// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (GOLD MASTER V6)
// FIX CRITIQUE MAJEUR: Implémentation du Master Switch (Démarrer/Pause Système)
// AMÉLIORATION: Optimisation de la batterie en arrêtant toutes les boucles de calcul (IMU, 50Hz, 1Hz)
// AMÉLIORATION: Synchronisation NTP ponctuelle au démarrage.
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances ---
    if (typeof math === 'undefined') console.error("🔴 CRITIQUE: math.js manquant. Le UKF ne peut pas fonctionner.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 CRITIQUE: ProfessionalUKF manquant.");
    if (typeof calculateAstroDataHighPrec === 'undefined') console.warn("🟡 AVERTISSEMENT: astro.js manquant. Les données astronomiques ne seront pas affichées.");

    // =================================================================
    // BLOC 1: CONFIGURATION & ÉTAT
    // =================================================================

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const C_L = 299792458;          
    const G_ACC_STD = 9.8067;       
    const SPEED_OF_SOUND_STD = 340.29; 

    // État Système Maître
    let isSystemActive = false;     // Le Master Switch
    let fastIntervalId = null;
    let slowIntervalId = null;
    
    // État GPS (géré en interne par le Master Switch)
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    
    // Statuts
    let gpsStatusMessage = 'Système HORS TENSION'; 
    let fusionStatusMessage = 'Système HORS TENSION (Mode Économie)';

    // Temps & Synchro
    let lastPredictionTime = Date.now();
    let sessionStartTime = Date.now(); 
    let ntpOffsetMs = 0; // Décalage pour synchronisation serveur
    
    // Données
    let hasGpsFixOccurred = false;
    let totalDistanceM = 0.0;
    let maxSpeedMs = 0.0;
    let timeInMotionMs = 0.0;
    
    // Position par défaut (Marseille)
    let currentPosition = {lat: 43.284611, lon: 5.358715, alt: 100.00, speed: 0.0, acc: 25.0};
    
    // Vitesse fusionnée/Dead Reckoning
    let currentSpeedMs = 0.0; 
    let deadReckoningSpeed = 0.0; 
    
    // IMU Brute
    let curAcc = {x: 0.0, y: 0.0, z: G_ACC_STD}; 
    let curAccLinear = {x: 0, y: 0, z: 0}; // Accélération Linéaire (sans gravité)
    let curGyro = {x: 0, y: 0, z: 0};
    let curMag = {x: 0, y: 0, z: 0};
    let fusionState = null; 
    let ukf = null;             


    // =================================================================
    // BLOC 2: UTILITAIRES & FORMATAGE
    // =================================================================
    
    const $ = (id) => document.getElementById(id);
    
    const dataOrDefault = (value, precision = 2, unit = '', naText = 'N/A') => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return naText;
        if (Math.abs(value) < 1e-4 && Math.abs(value) > 0) return `${value.toExponential(4)}${unit}`;
        return `${value.toFixed(precision)}${unit}`;
    };

    // Utilise l'offset NTP pour obtenir l'heure serveur corrigée
    const getCDate = () => new Date(Date.now() + ntpOffsetMs); 
    
    function formatTime(date) {
        if (!date) return 'N/A';
        return `${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')}:${String(date.getUTCSeconds()).padStart(2,'0')}`;
    }
    function formatDate(date) {
        if (!date) return 'N/A';
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
    }
    
    function formatAstroTime(hours) {
        if (isNaN(hours) || hours === null) return 'N/A';
        let h = hours % 24;
        if (h < 0) h += 24;
        const H = Math.floor(h).toString().padStart(2, '0');
        const M = Math.floor((h % 1) * 60).toString().padStart(2, '0');
        const S = Math.floor(((h * 60) % 1) * 60).toString().padStart(2, '0');
        return `${H}:${M}:${S}`;
    }

    // Requête NTP ponctuelle (seulement au chargement)
    const updateNtpOffset = async () => {
        try {
            const t0 = Date.now(); 
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC'); 
            const data = await response.json();
            const t3 = Date.now(); 
            const serverTimeMs = data.unixtime * 1000;
            // Correction de l'offset (Latence / 2)
            ntpOffsetMs = (serverTimeMs + ((t3 - t0) / 2)) - t3; 
        } catch (e) { 
            ntpOffsetMs = 0; // Utilise l'heure locale si la synchro échoue
        }
    };

    // =================================================================
    // BLOC 3: CONTRÔLE SYSTÈME MAÎTRE
    // =================================================================

    const startGps = () => {
         if (!gpsWatchID) {
            gpsWatchID = navigator.geolocation.watchPosition(
                handleGpsUpdate, 
                (err) => { 
                    gpsStatusMessage = `Erreur GPS ${err.code}`; 
                    isGpsPaused = true; 
                    // updateButtonUI(isSystemActive); // Pas besoin, géré par le 1Hz
                }, 
                { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
            );
        }
        gpsStatusMessage = 'Recherche satellites...';
        isGpsPaused = false;
    };

    const stopGps = () => {
        if (gpsWatchID) {
            navigator.geolocation.clearWatch(gpsWatchID);
            gpsWatchID = null;
        }
        gpsStatusMessage = 'GPS HORS TENSION';
        isGpsPaused = true;
    };
    
    const startMotionListeners = () => {
        if (typeof DeviceMotionEvent !== 'undefined' && !isIMUActive) {
             window.addEventListener('devicemotion', (e) => {
                if (e.accelerationIncludingGravity) {
                    curAcc.x = e.accelerationIncludingGravity.x || 0;
                    curAcc.y = e.accelerationIncludingGravity.y || 0;
                    curAcc.z = e.accelerationIncludingGravity.z || 0;
                }
                if (e.acceleration) {
                    curAccLinear.x = e.acceleration.x || 0;
                    curAccLinear.y = e.acceleration.y || 0;
                    curAccLinear.z = e.acceleration.z || 0;
                }
                if (e.rotationRate) {
                    curGyro.x = (e.rotationRate.alpha || 0) * D2R; 
                    curGyro.y = (e.rotationRate.beta || 0) * D2R;
                    curGyro.z = (e.rotationRate.gamma || 0) * D2R;
                }
             });
             isIMUActive = true;
        }
        // NOTE: On ne retire pas l'écouteur pour l'économie d'énergie. 
        // L'OS gère ça, et les boucles de calcul qui consomment le CPU sont coupées ci-dessous.
    };

    const startSystem = () => {
        if (isSystemActive) return;
        isSystemActive = true;
        sessionStartTime = Date.now(); // Reset session time on start

        // 1. Démarrer les écouteurs IMU (une seule fois)
        startMotionListeners();

        // 2. Démarrer le GPS
        startGps();

        // 3. Démarrer les boucles de mise à jour (Consommation CPU/Batterie)
        fastIntervalId = setInterval(fastLoop, 20); // 50 Hz
        slowIntervalId = setInterval(slowLoop, 1000); // 1 Hz
        
        fusionStatusMessage = 'Système Démarré, en attente GPS...';
        updateButtonUI(isSystemActive); 
    };

    const stopSystem = () => {
        if (!isSystemActive) return;
        isSystemActive = false;
        
        // 1. Arrêter les boucles
        if (fastIntervalId) clearInterval(fastIntervalId);
        if (slowIntervalId) clearInterval(slowIntervalId);
        
        // 2. Arrêter le GPS
        stopGps(); 
        
        // 3. Réinitialiser les états critiques pour l'économie d'énergie
        currentSpeedMs = 0.0;
        deadReckoningSpeed = 0.0;
        
        gpsStatusMessage = 'Système HORS TENSION';
        fusionStatusMessage = 'Système HORS TENSION (Mode Économie)';
        
        // Mettre à jour l'affichage statique
        updateDashboardDOM(fusionState); 
        
        updateButtonUI(isSystemActive); 
    };

    const toggleSystem = () => {
        if (isSystemActive) {
            stopSystem();
        } else {
            startSystem();
        }
    };
    
    const handleGpsUpdate = (pos) => {
        // ... (Logique GPS identique) ...
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lon = pos.coords.longitude;
        currentPosition.alt = pos.coords.altitude || currentPosition.alt;
        currentPosition.speed = pos.coords.speed || 0.0;
        
        const forcedAcc = parseFloat($('gps-accuracy-override') ? $('gps-accuracy-override').value : 0.0) || 0.0;
        currentPosition.acc = (forcedAcc > 0) ? forcedAcc : (pos.coords.accuracy || 25.0); 

        gpsStatusMessage = `Acquisition OK (Préc: ${currentPosition.acc.toFixed(1)}m)`;
        hasGpsFixOccurred = true;
        
        if (ukf && isSystemActive) {
            if (!ukf.isInitialized()) ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            ukf.update(pos);
            fusionState = ukf.getState();
        }
    };
    
    // Mise à jour de l'UI du bouton maître
    const updateButtonUI = (isActive) => {
        const btn = $('gps-pause-toggle');
        if (btn) {
            btn.textContent = isActive ? '⏸️ PAUSE SYSTÈME' : '▶️ DÉMARRER SYSTÈME';
            btn.classList.toggle('success', !isActive);
            btn.classList.toggle('error', isActive); 
        }
    };


    // =================================================================
    // BLOC 4: GESTION DU DOM (AFFICHAGE)
    // =================================================================

    const updateDashboardDOM = (fusion) => {
        // ... (Logique DOM inchangée, utilise les variables d'état) ...
        const lat = fusion ? fusion.lat : currentPosition.lat;
        const lon = fusion ? fusion.lon : currentPosition.lon;
        const alt = fusion ? fusion.alt : currentPosition.alt;
        const speed = currentSpeedMs; 
        const yaw = fusion ? fusion.yaw : 0; 
        const vD = fusion ? fusion.vD : 0; 
        
        // Calcul Pitch/Roll à partir de l'accélération avec gravité
        let pitch, roll;
        roll = Math.atan2(curAcc.y, curAcc.z) * R2D;
        pitch = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y*curAcc.y + curAcc.z*curAcc.z)) * R2D;
        
        // Données Physiques/Dynamiques
        const mass = parseFloat($('mass-input') ? $('mass-input').value : 70.0) || 70.0;
        const grav_mag = Math.sqrt(curAcc.x**2 + curAcc.y**2 + curAcc.z**2);
        const accel_trans_mag = Math.sqrt(curAccLinear.x**2 + curAccLinear.y**2 + curAccLinear.z**2); 
        const vertical_accel_imu = curAccLinear.z; 
        const totalSessionTimeS = (Date.now() - sessionStartTime) / 1000;
        
        // Relativité / Physique
        const lorentz = 1 / Math.sqrt(1 - (speed / C_L)**2);
        const restEnergy = mass * C_L**2; 
        const totalRelativisticEnergy = lorentz * restEnergy;
        const momentum = mass * speed * lorentz;
        
        // --- Mises à jour DOM ---

        // UKF & Debug
        if (ukf && ukf.isInitialized() && isSystemActive) {
             if (gpsWatchID) {
                fusionStatusMessage = hasGpsFixOccurred ? 'UKF Actif (Fusion)' : 'Fusion en Attente (Pas de Fix GPS)';
             } else {
                fusionStatusMessage = 'INS Dead Reckoning (Sans GPS)';
             }
             if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(fusion.uncertainty_vel_rms, 6, ' m/s');
             if ($('ukf-alt-sigma')) $('ukf-alt-sigma').textContent = dataOrDefault(fusion.uncertainty_alt_sigma, 4, ' m');
             if (ukf.getRFactor && $('ukf-r-noise')) $('ukf-r-noise').textContent = dataOrDefault(ukf.getRFactor(), 2); 
        } else if (!isSystemActive) {
             fusionStatusMessage = 'Système HORS TENSION (Mode Économie)';
        } else {
             fusionStatusMessage = 'Initialisation...';
        }
        
        if ($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage; 
        if ($('ekf-status')) $('ekf-status').textContent = fusionStatusMessage; 
        if ($('bande-passante')) $('bande-passante').textContent = isSystemActive ? '25.0 Hz' : '0.0 Hz'; 
        if ($('gps-accuracy-display')) $('gps-accuracy-display').textContent = dataOrDefault(currentPosition.acc, 6, ' m');
        if ($('acc-gps')) $('acc-gps').textContent = dataOrDefault(currentPosition.acc, 1, ' m'); 

        // Position & Attitude
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = dataOrDefault(alt, 2, ' m');
        if ($('heading-display')) $('heading-display').textContent = dataOrDefault(yaw, 1, '°');
        if ($('inclinaison-pitch')) $('inclinaison-pitch').textContent = dataOrDefault(pitch, 1, '°'); 
        if ($('roulis-roll')) $('roulis-roll').textContent = dataOrDefault(roll, 1, '°'); 
        
        // Vitesse & Distance
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speed * KMH_MS, 1, ' km/h'); 
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speed * KMH_MS, 3, ' km/h'); 
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(speed, 3, ' m/s'); 
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(currentPosition.speed, 2, ' m/s');
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        const avgSpeedMotion = timeInMotionMs > 0 ? (totalDistanceM / (timeInMotionMs / 1000)) : 0;
        const avgSpeedTotal = totalSessionTimeS > 0 ? (totalDistanceM / totalSessionTimeS) : 0;
        
        if ($('speed-avg-moving')) $('speed-avg-moving').textContent = dataOrDefault(avgSpeedMotion * KMH_MS, 1, ' km/h');
        if ($('speed-avg-total')) $('speed-avg-total').textContent = dataOrDefault(avgSpeedTotal * KMH_MS, 1, ' km/h');
        
        const distKm = totalDistanceM / 1000;
        if ($('distance-total-3d')) $('distance-total-3d').textContent = `${dataOrDefault(distKm, 3, ' km')} | ${dataOrDefault(totalDistanceM, 2, ' m')}`; 
        if ($('distance-light-s')) $('distance-light-s').textContent = dataOrDefault(totalDistanceM / C_L, 6, ' s'); 
        if ($('distance-light-min')) $('distance-light-min').textContent = dataOrDefault(totalDistanceM / C_L / 60, 6, ' min'); 

        // IMU (Brut)
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 2);
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 2);
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 2); 
        
        // Dynamique & Forces
        if ($('local-gravity')) $('local-gravity').textContent = dataOrDefault(grav_mag, 4, ' m/s²'); 
        if ($('force-g-long')) $('force-g-long').textContent = dataOrDefault(accel_trans_mag / G_ACC_STD, 2, ' G');
        if ($('acceleration-long')) $('acceleration-long').textContent = dataOrDefault(accel_trans_mag, 2, ' m/s²'); 
        if ($('vertical-speed')) $('vertical-speed').textContent = dataOrDefault(vD, 2, ' m/s'); 
        if ($('acceleration-vert-imu')) $('acceleration-vert-imu').textContent = dataOrDefault(vertical_accel_imu, 2, ' m/s²');
        if ($('force-g-vert')) $('force-g-vert').textContent = dataOrDefault(vertical_accel_imu / G_ACC_STD, 2, ' G');
        if ($('angular-speed')) $('angular-speed').textContent = dataOrDefault(Math.sqrt(curGyro.x**2 + curGyro.y**2 + curGyro.z**2), 2, ' rad/s');

        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(0.5 * mass * speed**2, 2, ' J'); 
        if ($('mass-display')) $('mass-display').textContent = dataOrDefault(mass, 3, ' kg');

        // Relativité
        const local_sound_speed = SPEED_OF_SOUND_STD; 
        const speed_of_sound_ratio = speed / local_sound_speed;
        
        if ($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = dataOrDefault(local_sound_speed, 2, ' m/s');
        if ($('perc-speed-light')) $('perc-speed-light').textContent = dataOrDefault(speed / C_L * 100, 6, ' %'); 
        if ($('perc-speed-sound')) $('perc-speed-sound').textContent = dataOrDefault(speed_of_sound_ratio * 100, 2, ' %');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(speed_of_sound_ratio, 4); 
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentz, 4);
        
        if ($('relativistic-energy')) $('relativistic-energy').textContent = dataOrDefault(totalRelativisticEnergy, 2, ' J');
        if ($('rest-mass-energy')) $('rest-mass-energy').textContent = dataOrDefault(restEnergy, 2, ' J');
        if ($('momentum')) $('momentum').textContent = dataOrDefault(momentum, 2, ' kg⋅m/s');
        
        // Niveau à bulle
        const bubble = $('bubble');
        if (bubble) {
            const bx = Math.min(Math.max(roll, -45), 45) * 1.5;
            const by = Math.min(Math.max(pitch, -45), 45) * -1.5;
            bubble.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`;
        }
    };

    const updateTimeCounters = (isStatic = false) => {
        const now = new Date(); // Temps local pour l'affichage (non NTP)
        const utcDate = getCDate(); // Temps UTC/NTP corrigé

        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR', { hour12: false });
        if ($('utc-datetime')) $('utc-datetime').textContent = `${formatDate(utcDate)} ${formatTime(utcDate)} (UTC)`;
        
        if (isSystemActive || isStatic) {
            const totalSessionTimeS = (Date.now() - sessionStartTime) / 1000;
            if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault(totalSessionTimeS, 2, ' s');
            
            const totalHours = (Date.now() - sessionStartTime) / 3600000;
            const mcHours = (totalHours * 1000) % 24;
            if ($('time-minecraft')) $('time-minecraft').textContent = formatAstroTime(mcHours);

            if ($('time-motion')) $('time-motion').textContent = dataOrDefault(timeInMotionMs / 1000, 2, ' s');

        } else if (!isSystemActive) {
             if ($('elapsed-time')) $('elapsed-time').textContent = '0.00 s';
             if ($('time-motion')) $('time-motion').textContent = '0.00 s';
             if ($('time-minecraft')) $('time-minecraft').textContent = '00:00:00';
        }
    };

    // =================================================================
    // BLOC 5: BOUCLES (50 Hz & 1 Hz)
    // =================================================================
    
    // Boucle Rapide (Physique/UKF - 50 Hz)
    const fastLoop = () => {
         const now = Date.now();
         let dt = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         if (dt <= 0 || !isSystemActive) return;
         
         let speedFromFusion = 0.0;

         if (ukf && ukf.isInitialized() && gpsWatchID) {
             try {
                 ukf.predict(dt, curAcc, curGyro);
                 fusionState = ukf.getState();
                 speedFromFusion = fusionState.speed;
             } catch (e) { 
                 speedFromFusion = 0.0; 
             }
         }
         
         // Logique de Dead Reckoning Fallback sécurisée
         if (!ukf || !ukf.isInitialized() || isGpsPaused) {
             const linear_accel_mag = Math.sqrt(curAccLinear.x**2 + curAccLinear.y**2 + curAccLinear.z**2);
             const THRESHOLD = 0.2; 
             const FRICTION = 0.8; 
             
             if (linear_accel_mag > THRESHOLD) {
                  deadReckoningSpeed += linear_accel_mag * dt; 
             } else {
                  deadReckoningSpeed = Math.max(0, deadReckoningSpeed - FRICTION * dt);
             }
             currentSpeedMs = deadReckoningSpeed;
             
         } else {
             // Utiliser la vitesse UKF si disponible
             currentSpeedMs = speedFromFusion;
             deadReckoningSpeed = currentSpeedMs;
         }
         
         // Mise à jour des totaux
         if (currentSpeedMs > 0.01) { 
            totalDistanceM += currentSpeedMs * dt;
            timeInMotionMs += dt * 1000;
         }
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         
         updateDashboardDOM(fusionState); 
    };


    // Boucle Lente (1Hz - Astro, Temps)
    const slowLoop = () => {
        if (!isSystemActive) return;

        updateTimeCounters();
        
        // Utilisation de la position initiale si fusionState n'est pas encore prêt
        const lat = (fusionState && fusionState.lat) ? fusionState.lat : currentPosition.lat;
        const lon = (fusionState && fusionState.lon) ? fusionState.lon : currentPosition.lon;
        
        if (typeof calculateAstroDataHighPrec === 'function') {
            try {
                // Utilise le temps NTP corrigé
                const ad = calculateAstroDataHighPrec(getCDate(), lat, lon);
                
                if ($('clock-status')) $('clock-status').textContent = (ad.sun.altitude * R2D < -6) ? 'Nuit/Crépuscule (🌙)' : 'Jour/Aube (☀️)'; 
                
                // Temps Solaire & Sidéral
                if ($('date-display-astro')) $('date-display-astro').textContent = formatDate(getCDate());
                if ($('tst-time')) $('tst-time').textContent = ad.TST_HRS ? formatAstroTime(ad.TST_HRS) : 'N/A'; 
                if ($('mst-time')) $('mst-time').textContent = ad.MST_HRS ? formatAstroTime(ad.MST_HRS) : 'N/A'; 
                if ($('noon-solar')) $('noon-solar').textContent = ad.NOON_SOLAR_UTC || 'N/A';
                if ($('equation-of-time')) $('equation-of-time').textContent = dataOrDefault(ad.EOT_MIN * 60, 2, ' s'); 
                if ($('ecl-long')) $('ecl-long').textContent = dataOrDefault(ad.ECL_LONG * R2D, 2, '°');

                // Soleil
                if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(ad.sun.altitude * R2D, 2, '°');
                if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(ad.sun.azimuth * R2D, 1, '°');
                if ($('day-duration')) $('day-duration').textContent = ad.sun.duration_hrs ? formatAstroTime(ad.sun.duration_hrs) : 'N/A';
                if ($('sunrise-times')) $('sunrise-times').textContent = ad.sun.rise ? formatAstroTime(ad.sun.rise) : 'N/A';
                if ($('sunset-times')) $('sunset-times').textContent = ad.sun.set ? formatAstroTime(ad.sun.set) : 'N/A';
                
                // Lune
                if ($('moon-phase-name')) $('moon-phase-name').textContent = ad.moon.phase_name || 'N/A'; 
                if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(ad.illumination.fraction * 100, 1, ' %');
                if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(ad.moon.altitude * R2D, 2, '°');
                if ($('moon-azimuth')) $('moon-azimuth').textContent = dataOrDefault(ad.moon.azimuth * R2D, 1, '°');
                if ($('moon-times')) $('moon-times').textContent = (ad.moon.times && ad.moon.times.rise) ? `${formatAstroTime(ad.moon.times.rise)} / ${formatAstroTime(ad.moon.times.set)}` : 'N/A';
                if ($('moon-distance')) $('moon-distance').textContent = dataOrDefault(ad.moon.distance / 1000, 0, ' km');
                
            } catch(e) { 
                // Laisser N/A si le calcul astro échoue (problème de dépendance ou de donnée)
                // console.error("Erreur de calcul Astro :", e);
            }
        }
    };


    // =================================================================
    // INITIALISATION
    // =================================================================

    window.addEventListener('load', () => {
        
        // Initialisation de l'UKF si math.js est disponible
        if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF();
            ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            fusionState = ukf.getState();
        } 
        
        // 1. Synchro NTP ponctuelle (Utilise le serveur pour synchroniser l'heure)
        updateNtpOffset();

        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) btnToggle.addEventListener('click', toggleSystem); // Nouveau binding

        // 2. Le système démarre en mode OFF pour l'économie d'énergie
        isSystemActive = false;
        
        // Initialisation de l'état du bouton et de l'affichage statique
        updateButtonUI(isSystemActive);
        updateTimeCounters(true); // Afficher l'heure locale et NTP
        updateDashboardDOM(fusionState);
    });

})(window);
