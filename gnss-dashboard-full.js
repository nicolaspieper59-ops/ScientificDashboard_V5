// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (V7 - ROBUSTE)
// CORRECTIONS: Protection contre les IDs manquants, Alignement HTML Index(18).
// =================================================================

((window) => {
    "use strict";

    // =================================================================
    // 0. FONCTIONS UTILITAIRES DE SÉCURITÉ DOM (ANTI-CRASH)
    // =================================================================
    const $ = (id) => document.getElementById(id);

    // Ajoute un écouteur seulement si l'élément existe
    const safeAddListener = (id, event, handler) => {
        const el = $(id);
        if (el) {
            el.addEventListener(event, handler);
        } else {
            console.warn(`⚠️ Élément manquant pour le listener: ${id}`);
        }
    };

    // Met à jour le texte seulement si l'élément existe
    const safeUpdate = (id, value, suffix = '') => {
        const el = $(id);
        if (el) el.textContent = value + suffix;
    };

    const dataOrDefault = (value, precision = 2, unit = '', naText = 'N/A') => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return naText;
        if (Math.abs(value) < 1e-4 && Math.abs(value) > 0) return `${value.toExponential(4)}${unit}`;
        return `${value.toFixed(precision)}${unit}`;
    };

    // =================================================================
    // 1. CONFIGURATION & ÉTAT
    // =================================================================

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const C_L = 299792458;          
    const G_ACC_STD = 9.8067;       
    const G_CONST = 6.67430e-11;
    const SPEED_OF_SOUND_STD = 340.29; 

    // État Système Maître
    let isSystemActive = false;
    let fastIntervalId = null;
    let slowIntervalId = null;
    
    // État GPS
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    
    // Statuts
    let gpsStatusMessage = 'Système HORS TENSION'; 
    let fusionStatusMessage = 'Initialisation...';

    // Temps & Synchro
    let lastPredictionTime = Date.now();
    let sessionStartTime = Date.now(); 
    let ntpOffsetMs = 0; 
    
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
    let curAccLinear = {x: 0, y: 0, z: 0}; 
    let curGyro = {x: 0, y: 0, z: 0};
    let curMag = {x: 0, y: 0, z: 0};
    let fusionState = null; 
    let ukf = null;             

    // =================================================================
    // 2. LOGIQUE MÉTIER
    // =================================================================

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
        return `${H}:${M}`;
    }

    const updateNtpOffset = async () => {
        try {
            const t0 = Date.now(); 
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC'); 
            const data = await response.json();
            const t3 = Date.now(); 
            const serverTimeMs = data.unixtime * 1000;
            ntpOffsetMs = (serverTimeMs + ((t3 - t0) / 2)) - t3;
        } catch (e) { ntpOffsetMs = 0; }
    };

    // --- CAPTEURS ---
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
    };
    
    const handleGpsUpdate = (pos) => {
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lon = pos.coords.longitude;
        currentPosition.alt = pos.coords.altitude || currentPosition.alt;
        currentPosition.speed = pos.coords.speed || 0.0;
        
        // Lecture sécurisée de l'input
        const inputEl = $('gps-accuracy-override');
        const forcedAcc = inputEl ? (parseFloat(inputEl.value) || 0.0) : 0.0;
        currentPosition.acc = (forcedAcc > 0) ? forcedAcc : (pos.coords.accuracy || 25.0); 

        gpsStatusMessage = `Acquisition OK (Préc: ${currentPosition.acc.toFixed(1)}m)`;
        hasGpsFixOccurred = true;
        
        if (ukf && isSystemActive) {
            if (!ukf.isInitialized()) ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            ukf.update(pos);
            fusionState = ukf.getState();
        }
    };

    // --- CONTRÔLE SYSTÈME ---
    const updateButtonUI = (isActive) => {
        const btn = $('gps-pause-toggle');
        if (btn) {
            btn.textContent = isActive ? '⏸️ PAUSE SYSTÈME' : '▶️ MARCHE GPS';
            btn.classList.toggle('success', !isActive);
            btn.classList.toggle('error', isActive); 
        }
    };

    const startSystem = () => {
        if (isSystemActive) return;
        isSystemActive = true;
        sessionStartTime = Date.now(); 

        startMotionListeners();

        if (!gpsWatchID) {
            gpsWatchID = navigator.geolocation.watchPosition(
                handleGpsUpdate, 
                (err) => { 
                    gpsStatusMessage = `Erreur GPS ${err.code}`; 
                    stopSystem();
                }, 
                { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
            );
        }
        gpsStatusMessage = 'Recherche satellites...';
        
        if (fastIntervalId) clearInterval(fastIntervalId);
        if (slowIntervalId) clearInterval(slowIntervalId);
        fastIntervalId = setInterval(fastLoop, 20); // 50 Hz
        slowIntervalId = setInterval(slowLoop, 1000); // 1 Hz
        
        fusionStatusMessage = 'Système Démarré, en attente GPS...';
        updateButtonUI(isSystemActive); 
    };

    const stopSystem = () => {
        if (!isSystemActive) return;
        isSystemActive = false;
        
        if (fastIntervalId) clearInterval(fastIntervalId);
        if (slowIntervalId) clearInterval(slowIntervalId);
        
        if (gpsWatchID) {
            navigator.geolocation.clearWatch(gpsWatchID);
            gpsWatchID = null;
        }
        
        currentSpeedMs = 0.0;
        deadReckoningSpeed = 0.0;
        gpsStatusMessage = 'Système HORS TENSION';
        fusionStatusMessage = 'Système HORS TENSION';
        
        updateDashboardDOM(fusionState); // Dernier refresh
        updateButtonUI(isSystemActive); 
    };

    const toggleSystem = () => {
        isSystemActive ? stopSystem() : startSystem();
    };


    // =================================================================
    // 3. GESTION DU DOM (MAPPING INDEX 18 HTML)
    // =================================================================

    const updateDashboardDOM = (fusion) => {
        const lat = fusion ? fusion.lat : currentPosition.lat;
        const lon = fusion ? fusion.lon : currentPosition.lon;
        const alt = fusion ? fusion.alt : currentPosition.alt;
        const speed = currentSpeedMs; 
        const yaw = fusion ? fusion.yaw : 0; 
        const vD = fusion ? fusion.vD : 0; 
        
        let pitch = 0, roll = 0;
        if (curAcc.z !== 0) {
            roll = Math.atan2(curAcc.y, curAcc.z) * R2D;
            pitch = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y*curAcc.y + curAcc.z*curAcc.z)) * R2D;
        }
        
        const massEl = $('mass-input');
        const mass = massEl ? (parseFloat(massEl.value) || 70.0) : 70.0;
        const grav_mag = Math.sqrt(curAcc.x**2 + curAcc.y**2 + curAcc.z**2);
        
        // Calculs Physiques
        const accel_trans_mag = Math.sqrt(curAccLinear.x**2 + curAccLinear.y**2 + curAccLinear.z**2); 
        const vertical_accel_imu = curAccLinear.z; 
        
        const lorentz = 1 / Math.sqrt(1 - (speed / C_L)**2);
        const restEnergy = mass * C_L**2; 
        const totalRelativisticEnergy = lorentz * restEnergy;
        const momentum = mass * speed * lorentz;
        
        // --- MISE A JOUR AFFICHAGE (PROTECTION SAFEUPDATE) ---

        // Statuts
        safeUpdate('gps-status-acquisition', gpsStatusMessage); 
        safeUpdate('ekf-status', fusionStatusMessage); 
        safeUpdate('bande-passante', isSystemActive ? '25.0 Hz' : '0.0 Hz'); 
        safeUpdate('gps-accuracy-display', dataOrDefault(currentPosition.acc, 6, ' m'));
        safeUpdate('acc-gps', dataOrDefault(currentPosition.acc, 1, ' m')); 

        // Position & Attitude
        safeUpdate('lat-ekf', dataOrDefault(lat, 6));
        safeUpdate('lon-ekf', dataOrDefault(lon, 6));
        safeUpdate('alt-ekf', dataOrDefault(alt, 2, ' m'));
        safeUpdate('heading-display', dataOrDefault(yaw, 1, '°'));
        safeUpdate('inclinaison-pitch', dataOrDefault(pitch, 1, '°')); 
        safeUpdate('roulis-roll', dataOrDefault(roll, 1, '°')); 
        
        // Vitesse & Distance
        safeUpdate('speed-main-display', dataOrDefault(speed * KMH_MS, 1, ' km/h')); 
        safeUpdate('speed-stable-kmh', dataOrDefault(speed * KMH_MS, 3, ' km/h')); 
        safeUpdate('speed-stable-ms', dataOrDefault(speed, 3, ' m/s')); 
        safeUpdate('raw-speed-ms', dataOrDefault(currentPosition.speed, 2, ' m/s'));
        safeUpdate('vmax-session', dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h'));
        
        const totalSessionTimeS = (Date.now() - sessionStartTime) / 1000;
        const avgSpeedMotion = timeInMotionMs > 0 ? (totalDistanceM / (timeInMotionMs / 1000)) : 0;
        const avgSpeedTotal = totalSessionTimeS > 0 ? (totalDistanceM / totalSessionTimeS) : 0;
        
        safeUpdate('speed-avg-moving', dataOrDefault(avgSpeedMotion * KMH_MS, 1, ' km/h'));
        safeUpdate('speed-avg-total', dataOrDefault(avgSpeedTotal * KMH_MS, 1, ' km/h'));
        
        const distKm = totalDistanceM / 1000;
        safeUpdate('distance-total-3d', `${dataOrDefault(distKm, 3, ' km')} | ${dataOrDefault(totalDistanceM, 2, ' m')}`);
        safeUpdate('distance-light-s', dataOrDefault(totalDistanceM / C_L, 9, ' s')); 

        // IMU (Brut)
        safeUpdate('accel-x', dataOrDefault(curAcc.x, 2));
        safeUpdate('accel-y', dataOrDefault(curAcc.y, 2));
        safeUpdate('accel-z', dataOrDefault(curAcc.z, 2)); 
        
        // Dynamique & Forces (MAPPING CORRIGÉ SELON HTML 18)
        safeUpdate('local-gravity', dataOrDefault(grav_mag, 4, ' m/s²')); // Corrigé
        safeUpdate('force-g-long', dataOrDefault(accel_trans_mag / G_ACC_STD, 2, ' G'));
        safeUpdate('acceleration-long', dataOrDefault(accel_trans_mag, 2, ' m/s²')); 
        safeUpdate('vertical-speed', dataOrDefault(vD, 2, ' m/s')); 
        safeUpdate('acceleration-vert-imu', dataOrDefault(vertical_accel_imu, 2, ' m/s²')); // Corrigé
        safeUpdate('force-g-vert', dataOrDefault(vertical_accel_imu / G_ACC_STD, 2, ' G'));
        safeUpdate('angular-speed', dataOrDefault(Math.sqrt(curGyro.x**2 + curGyro.y**2 + curGyro.z**2), 2, ' rad/s'));

        safeUpdate('kinetic-energy', dataOrDefault(0.5 * mass * speed**2, 2, ' J')); 
        safeUpdate('mass-display', dataOrDefault(mass, 3, ' kg'));

        // Relativité
        const speed_of_sound_ratio = speed / SPEED_OF_SOUND_STD;
        safeUpdate('speed-of-sound-calc', dataOrDefault(SPEED_OF_SOUND_STD, 2, ' m/s'));
        safeUpdate('perc-speed-sound', dataOrDefault(speed_of_sound_ratio * 100, 2, ' %'));
        safeUpdate('mach-number', dataOrDefault(speed_of_sound_ratio, 4)); 
        safeUpdate('%speed-of-light', dataOrDefault(speed / C_L * 100, 9, ' %')); // ID corrigé avec %
        safeUpdate('lorentz-factor', dataOrDefault(lorentz, 8));
        
        safeUpdate('relativistic-energy', dataOrDefault(totalRelativisticEnergy, 2, ' J'));
        safeUpdate('rest-mass-energy', dataOrDefault(restEnergy, 2, ' J'));
        safeUpdate('momentum', dataOrDefault(momentum, 2, ' kg⋅m/s'));
        
        // Niveau à bulle
        const bubble = $('bubble');
        if (bubble) {
            const bx = Math.min(Math.max(roll, -45), 45) * 1.5;
            const by = Math.min(Math.max(pitch, -45), 45) * -1.5;
            bubble.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`;
        }
    };

    const updateTimeCounters = () => {
        const now = new Date(); 
        const utcDate = getCDate(); 

        safeUpdate('local-time', now.toLocaleTimeString('fr-FR', { hour12: false }));
        safeUpdate('utc-datetime', `${formatDate(utcDate)} ${formatTime(utcDate)} (UTC)`);
        
        const totalSessionTimeS = (Date.now() - sessionStartTime) / 1000;
        // Si le système est OFF, on fige/reset les compteurs
        if (isSystemActive) {
             safeUpdate('elapsed-time', dataOrDefault(totalSessionTimeS, 2, ' s'));
             safeUpdate('movement-time', dataOrDefault(timeInMotionMs / 1000, 2, ' s')); // Corrigé : movement-time
        }
        
        const totalHours = (Date.now() - sessionStartTime) / 3600000;
        const mcHours = (totalHours * 1000) % 24;
        safeUpdate('time-minecraft', formatAstroTime(mcHours));
    };

    // =================================================================
    // 4. BOUCLES
    // =================================================================
    
    // Boucle Rapide (Physique - 50 Hz)
    const fastLoop = () => {
         const now = Date.now();
         let dt = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         if (dt <= 0 || !isSystemActive) return;
         
         let speedFromFusion = 0.0;

         // Appel UKF
         if (ukf && ukf.isInitialized() && hasGpsFixOccurred) {
             try {
                 ukf.predict(dt, curAcc, curGyro);
                 fusionState = ukf.getState();
                 speedFromFusion = fusionState.speed;
             } catch (e) { speedFromFusion = 0.0; }
         }
         
         // Logique Dead Reckoning / ZUPT
         if (!hasGpsFixOccurred || isGpsPaused) {
             const linear_accel_mag = Math.sqrt(curAccLinear.x**2 + curAccLinear.y**2 + curAccLinear.z**2);
             const THRESHOLD = 0.3; 
             const FRICTION = 0.8; 
             
             if (linear_accel_mag > THRESHOLD) {
                  deadReckoningSpeed += linear_accel_mag * dt; 
             } else {
                  deadReckoningSpeed = Math.max(0, deadReckoningSpeed - FRICTION * dt);
             }
             currentSpeedMs = deadReckoningSpeed;
             
         } else {
             currentSpeedMs = speedFromFusion;
             deadReckoningSpeed = currentSpeedMs;
         }
         
         // Totaux
         if (currentSpeedMs > 0.05) { 
            totalDistanceM += currentSpeedMs * dt;
            timeInMotionMs += dt * 1000;
         }
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         
         updateDashboardDOM(fusionState); 
    };

    // Boucle Lente (Astro - 1Hz)
    const slowLoop = () => {
        if (!isSystemActive) return;
        updateTimeCounters();
        
        if (typeof calculateAstroDataHighPrec === 'function') {
            try {
                const lat = currentPosition.lat;
                const lon = currentPosition.lon;
                const ad = calculateAstroDataHighPrec(getCDate(), lat, lon);
                
                safeUpdate('clock-status', (ad.sun.altitude * R2D < -6) ? 'Nuit/Crépuscule (🌙)' : 'Jour/Aube (☀️)');
                safeUpdate('date-display-astro', formatDate(getCDate()));
                safeUpdate('tst-time', ad.TST_HRS ? formatAstroTime(ad.TST_HRS) : 'N/A');
                safeUpdate('mst-time', ad.MST_HRS ? formatAstroTime(ad.MST_HRS) : 'N/A');
                safeUpdate('noon-solar', ad.NOON_SOLAR_UTC || 'N/A');
                safeUpdate('equation-of-time', dataOrDefault(ad.EOT_MIN * 60, 2, ' s'));
                
                safeUpdate('sun-alt', dataOrDefault(ad.sun.altitude * R2D, 2, '°'));
                safeUpdate('sun-azimuth', dataOrDefault(ad.sun.azimuth * R2D, 1, '°'));
                safeUpdate('day-duration', ad.sun.duration_hrs ? formatAstroTime(ad.sun.duration_hrs) : 'N/A');
                
                safeUpdate('moon-phase-name', ad.moon.phase_name || 'N/A');
                safeUpdate('moon-illuminated', dataOrDefault(ad.illumination.fraction * 100, 1, ' %'));
                safeUpdate('moon-alt', dataOrDefault(ad.moon.altitude * R2D, 2, '°'));
                safeUpdate('moon-distance', dataOrDefault(ad.moon.distance / 1000, 0, ' km'));

            } catch(e) { }
        }
    };

    // =================================================================
    // 5. INITIALISATION (DOMContentLoaded)
    // =================================================================

    // Attend que le HTML soit chargé pour attacher les événements
    document.addEventListener('DOMContentLoaded', () => {
        
        // --- CHARGEMENT DES DÉPENDANCES ---
        if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF();
            ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            fusionState = ukf.getState();
            fusionStatusMessage = 'INS Dead Reckoning (Prêt)';
        } else {
             fusionStatusMessage = 'UKF NON CHARGÉ (Math.js manquant?)';
             console.error("ProfessionalUKF non trouvé.");
        }
        
        // --- ATTACHEMENT DES BOUTONS (Avec protection SafeAddListener) ---
        
        // Bouton Maître
        safeAddListener('gps-pause-toggle', 'click', toggleSystem);
        
        // Boutons de Reset (qui manquaient d'ID dans le HTML précédent)
        safeAddListener('reset-distance-btn', 'click', () => { totalDistanceM = 0; timeInMotionMs = 0; });
        safeAddListener('reset-vmax-btn', 'click', () => { maxSpeedMs = 0; });
        safeAddListener('reset-all-btn', 'click', () => {
             totalDistanceM = 0; maxSpeedMs = 0; timeInMotionMs = 0; 
             sessionStartTime = Date.now();
             stopSystem();
        });

        // Sélecteurs
        const envSelect = $('environment-select');
        if(envSelect) envSelect.addEventListener('change', (e) => {
            // Logique de changement d'environnement
        });

        // Initialisation de l'état
        updateNtpOffset();
        updateButtonUI(isSystemActive);
        updateDashboardDOM(fusionState);
        
        // Force une première mise à jour de l'heure
        updateTimeCounters(true); 
    });

})(window);
