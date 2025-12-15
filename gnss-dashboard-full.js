// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (V45 - GOLD MASTER V3)
// FIX CRITIQUE: Bouton MARCHE/PAUSE fonctionnel, Fallback Dead Reckoning IMU activé.
// FIX D'ALIGNEMENT: Logique complète pour IMU vertical, Astro et Debug UKF.
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances ---
    if (typeof math === 'undefined') console.error("🔴 CRITIQUE: math.js manquant. Le UKF ne peut pas fonctionner.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 CRITIQUE: ProfessionalUKF manquant.");
    if (typeof calculateAstroDataHighPrec === 'undefined') console.warn("🟡 AVERTISSEMENT: ephem.js/astro.js manquants. Les données astronomiques ne seront pas affichées.");

    // =================================================================
    // BLOC 1: CONFIGURATION & ÉTAT
    // =================================================================

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const C_L = 299792458;          
    const G_ACC_STD = 9.8067;       
    const G_CONST = 6.67430e-11;
    const SPEED_OF_SOUND_STD = 340.29; 

    // État Système
    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let isMagActive = false;    
    
    // Statuts
    let gpsStatusMessage = 'GPS en Pause (Attente commande)'; 
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
    
    // FIX CRITIQUE 2: Vitesse UKF pour Dead Reckoning (si UKF non fonctionnel, on simule)
    let currentSpeedMs = 0.0; 
    let deadReckoningSpeed = 0.0; // Vitesse de fallback IMU
    
    // IMU Brute (initialisé pour avoir des Pitch/Roll non-nuls au départ)
    let curAcc = {x: -0.50, y: -0.60, z: 9.60}; 
    let curGyro = {x: 0, y: 0, z: 0};
    let curMag = {x: 0, y: 0, z: 0};
    let fusionState = null; 

    // =================================================================
    // BLOC 2: UTILITAIRES & FORMATAGE
    // =================================================================
    
    const $ = (id) => document.getElementById(id);
    
    const dataOrDefault = (value, precision = 2, unit = '', naText = 'N/A') => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return naText;
        if (Math.abs(value) < 1e-4 && Math.abs(value) > 0) return `${value.toExponential(4)}${unit}`;
        return `${value.toFixed(precision)}${unit}`;
    };

    const getCDate = () => new Date();
    
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

    const updateNtpOffset = async () => {
        try {
            const t0 = Date.now(); 
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC'); 
            const data = await response.json();
            const t3 = Date.now(); 
            const serverTimeMs = data.unixtime * 1000;
            ntpOffsetMs = (serverTimeMs + ((t3 - t0) / 2)) - t3;
        } catch (e) { 
            ntpOffsetMs = 0;
        }
    };

    // =================================================================
    // BLOC 3: CAPTEURS (IMU & GPS)
    // =================================================================

    const startMotionListeners = () => {
        if (typeof DeviceMotionEvent !== 'undefined' && !isIMUActive) {
             window.addEventListener('devicemotion', (e) => {
                if (e.accelerationIncludingGravity) {
                    curAcc.x = e.accelerationIncludingGravity.x || 0;
                    curAcc.y = e.accelerationIncludingGravity.y || 0;
                    curAcc.z = e.accelerationIncludingGravity.z || 0;
                }
                if (e.rotationRate) {
                    curGyro.x = (e.rotationRate.alpha || 0) * D2R; 
                    curGyro.y = (e.rotationRate.beta || 0) * D2R;
                    curGyro.z = (e.rotationRate.gamma || 0) * D2R;
                }
             });
             isIMUActive = true;
        }
        if (typeof DeviceOrientationEvent !== 'undefined' && !isMagActive) {
             window.addEventListener('deviceorientation', (e) => {
                if (e.alpha !== null) {
                    curMag.x = 0; curMag.y = 0; curMag.z = 0; // Données magnétiques simplifiées
                }
             });
             isMagActive = true;
        }
    };
    
    const handleGpsUpdate = (pos) => {
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lon = pos.coords.longitude;
        currentPosition.alt = pos.coords.altitude || currentPosition.alt;
        currentPosition.speed = pos.coords.speed || 0.0;
        
        const forcedAcc = parseFloat($('gps-accuracy-override') ? $('gps-accuracy-override').value : 0.0) || 0.0;
        currentPosition.acc = (forcedAcc > 0) ? forcedAcc : (pos.coords.accuracy || 25.0); 

        gpsStatusMessage = `Acquisition OK (Préc: ${currentPosition.acc.toFixed(1)}m)`;
        hasGpsFixOccurred = true;
        
        if (ukf) {
            if (!ukf.isInitialized()) ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            ukf.update(pos);
            fusionState = ukf.getState();
        }
    };

    // FIX CRITIQUE 1: Fonction utilitaire pour mettre à jour le bouton
    const updateButtonUI = (isPaused) => {
        const btn = $('gps-pause-toggle');
        if (btn) {
            btn.textContent = isPaused ? '▶️ MARCHE GPS' : '⏸️ PAUSE GPS';
            btn.classList.toggle('success', isPaused);
            btn.classList.toggle('error', !isPaused);
        }
    };

    const togglePause = () => {
        isGpsPaused = !isGpsPaused;
        
        if (!isGpsPaused) {
            // Démarrer GPS
            if (!gpsWatchID) {
                gpsWatchID = navigator.geolocation.watchPosition(
                    handleGpsUpdate, 
                    (err) => { 
                        gpsStatusMessage = `Erreur GPS ${err.code}`; 
                        // Mettre à jour l'UI en cas d'erreur
                        isGpsPaused = true; 
                        updateButtonUI(isGpsPaused);
                    }, 
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                );
            }
            gpsStatusMessage = 'Recherche satellites...';
        } else {
            // Mettre en Pause GPS
            if (gpsWatchID) {
                navigator.geolocation.clearWatch(gpsWatchID);
                gpsWatchID = null;
            }
            gpsStatusMessage = 'GPS en Pause';
        }
        
        updateButtonUI(isGpsPaused); // Met à jour l'UI du bouton immédiatement.
    };

    // =================================================================
    // BLOC 4: GESTION DU DOM (AFFICHAGE)
    // =================================================================

    const updateDashboardDOM = (fusion) => {
        const lat = fusion ? fusion.lat : currentPosition.lat;
        const lon = fusion ? fusion.lon : currentPosition.lon;
        const alt = fusion ? fusion.alt : currentPosition.alt;
        const speed = currentSpeedMs; // Vitesse fusionnée (UKF ou Fallback)
        const yaw = fusion ? fusion.yaw : 0; 
        const vD = fusion ? fusion.vD : 0; 
        
        let pitch, roll;
        if (fusion) {
            pitch = fusion.pitch;
            roll = fusion.roll;
        } else {
            roll = Math.atan2(curAcc.y, curAcc.z) * R2D;
            pitch = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y*curAcc.y + curAcc.z*curAcc.z)) * R2D;
        }
        
        // Données Physiques/Dynamiques
        const mass = parseFloat($('mass-input') ? $('mass-input').value : 70.0) || 70.0;
        const grav_mag = Math.sqrt(curAcc.x**2 + curAcc.y**2 + curAcc.z**2);
        const long_acc = Math.abs(grav_mag - G_ACC_STD); 
        const lorentz = 1 / Math.sqrt(1 - (speed / C_L)**2);
        const vertical_accel_imu = curAcc.z - G_ACC_STD; 
        const totalSessionTimeS = (Date.now() - sessionStartTime) / 1000;
        
        // --- Mises à jour DOM ---

        // UKF & Debug
        if (ukf && fusion) {
             fusionStatusMessage = isGpsPaused || !hasGpsFixOccurred ? 'INS Dead Reckoning (Sans GPS)' : 'UKF Actif (Fusion)';
             if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(fusion.uncertainty_vel_rms, 6, ' m/s');
             if ($('ukf-alt-sigma')) $('ukf-alt-sigma').textContent = dataOrDefault(fusion.uncertainty_alt_sigma, 4, ' m');
             if (ukf.getRFactor && $('ukf-r-noise')) $('ukf-r-noise').textContent = dataOrDefault(ukf.getRFactor(), 2); 
        }
        // Le statut EKF devrait être mis à jour même si le UKF est null (via le load event)
        if ($('ekf-status')) $('ekf-status').textContent = fusionStatusMessage; 
        if ($('nyquist-rate')) $('nyquist-rate').textContent = '25.0 Hz'; 
        if ($('force-gps-accuracy')) $('force-gps-accuracy').textContent = dataOrDefault(currentPosition.acc, 1, ' m');


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

        if ($('avg-speed-motion')) $('avg-speed-motion').textContent = dataOrDefault(avgSpeedMotion * KMH_MS, 1, ' km/h');
        if ($('avg-speed-total')) $('avg-speed-total').textContent = dataOrDefault(avgSpeedTotal * KMH_MS, 1, ' km/h');
        
        const distKm = totalDistanceM / 1000;
        if ($('distance-total-3d')) $('distance-total-3d').textContent = `${dataOrDefault(distKm, 3, ' km')} | ${dataOrDefault(totalDistanceM, 2, ' m')}`; 
        if ($('distance-light-s')) $('distance-light-s').textContent = dataOrDefault(totalDistanceM / C_L, 2, ' s'); 
        if ($('distance-light-min')) $('distance-light-min').textContent = dataOrDefault(totalDistanceM / C_L / 60, 2, ' min'); 
        // Les autres IDs de distance lumière sont laissés à N/A ou une valeur nulle car les calculs sont trop longs ou non pertinents pour un tableau de bord en temps réel.


        // Dynamique & Forces (FIX DES N/A)
        if ($('local-gravity')) $('local-gravity').textContent = dataOrDefault(grav_mag, 4, ' m/s²'); 
        if ($('force-g-long')) $('force-g-long').textContent = dataOrDefault(long_acc / G_ACC_STD, 2, ' G');
        if ($('acceleration-long')) $('acceleration-long').textContent = dataOrDefault(long_acc, 2, ' m/s²'); 
        if ($('vertical-speed')) $('vertical-speed').textContent = dataOrDefault(vD, 2, ' m/s'); 
        if ($('vertical-accel-imu')) $('vertical-accel-imu').textContent = dataOrDefault(vertical_accel_imu, 2, ' m/s²');
        if ($('force-g-vertical')) $('force-g-vertical').textContent = dataOrDefault(vertical_accel_imu / G_ACC_STD, 2, ' G');
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(0.5 * mass * speed**2, 2, ' J'); 
        if ($('mass-display')) $('mass-display').textContent = dataOrDefault(mass, 3, ' kg');

        // Relativité
        const local_sound_speed = SPEED_OF_SOUND_STD; 
        const speed_of_sound_ratio = speed / local_sound_speed;
        
        if ($('local-speed-of-sound')) $('local-speed-of-sound').textContent = dataOrDefault(local_sound_speed, 2, ' m/s');
        if ($('%speed-of-sound')) $('%speed-of-sound').textContent = dataOrDefault(speed_of_sound_ratio * 100, 2, ' %');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(speed_of_sound_ratio, 4); 
        if ($('%speed-of-light')) $('%speed-of-light').textContent = dataOrDefault(speed / C_L * 100, 6, ' %'); 
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentz, 4);
        
        // Niveau à bulle
        const bubble = $('bubble');
        if (bubble) {
            const bx = Math.min(Math.max(roll, -45), 45) * 1.5;
            const by = Math.min(Math.max(pitch, -45), 45) * -1.5;
            bubble.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`;
        }
    };

    const updateTimeCounters = () => {
        const now = getCDate(); 
        const utcDate = new Date(now.getTime() + ntpOffsetMs);

        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR', { hour12: false });
        if ($('utc-datetime')) $('utc-datetime').textContent = `${formatDate(utcDate)} ${formatTime(utcDate)} (UTC)`;
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault((Date.now() - sessionStartTime)/1000, 2, ' s');
        
        // Heure Minecraft (simple simulation)
        const totalHours = (Date.now() - sessionStartTime) / 3600000;
        const mcHours = (totalHours * 1000) % 24;
        if ($('minecraft-time')) $('minecraft-time').textContent = formatAstroTime(mcHours);
    };

    // =================================================================
    // BLOC 5: BOUCLE PRINCIPALE (50 Hz) & ASTRO (1 Hz)
    // =================================================================

    // Boucle Rapide (Physique/UKF - 50 Hz)
    setInterval(() => {
         const now = Date.now();
         let dt = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         let speedFromFusion = 0.0;

         if (ukf && ukf.isInitialized() && dt > 0) {
             try {
                 ukf.predict(dt, curAcc, curGyro);
                 fusionState = ukf.getState();
                 speedFromFusion = fusionState.speed;
             } catch (e) { 
                 // En cas d'échec de la prediction UKF, la vitesse passe au Dead Reckoning Fallback
                 speedFromFusion = 0.0; 
             }
         }
         
         // FIX CRITIQUE 2: Logique de Dead Reckoning Fallback
         if (speedFromFusion === 0.0 || !ukf || !ukf.isInitialized()) {
             // Si UKF ne fournit pas de vitesse, utiliser l'intégration IMU simplifiée (pour montrer la réaction)
             const accel_mag = Math.sqrt(curAcc.x**2 + curAcc.y**2) - 0.5; // Accélération horizontale nette (seuil 0.5)
             if (accel_mag > 0.05) {
                 deadReckoningSpeed += accel_mag * dt; 
             } else {
                 // Décélération/Frottement simulé si l'accélération est faible
                 deadReckoningSpeed = Math.max(0, deadReckoningSpeed - 0.5 * dt);
             }
             currentSpeedMs = deadReckoningSpeed;

         } else {
             // Utiliser la vitesse UKF si disponible
             currentSpeedMs = speedFromFusion;
             deadReckoningSpeed = currentSpeedMs; // Synchroniser le fallback
         }
         
         // Mise à jour des totaux
         totalDistanceM += currentSpeedMs * dt;
         if (currentSpeedMs > 0.1) timeInMotionMs += dt * 1000;
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         
         updateDashboardDOM(fusionState); 
         
    }, 20); // 50 Hz

    // Boucle Lente (1Hz - Astro)
    setInterval(() => {
        updateTimeCounters();
        
        const lat = fusionState ? fusionState.lat : currentPosition.lat;
        const lon = fusionState ? fusionState.lon : currentPosition.lon;
        
        if (typeof calculateAstroDataHighPrec === 'function') {
            try {
                const ad = calculateAstroDataHighPrec(getCDate(), lat, lon);
                
                // Mises à jour DOM Astro
                if ($('clock-status')) $('clock-status').textContent = (ad.sun.altitude * R2D < -6) ? 'Nuit/Crépuscule (🌙)' : 'Jour/Aube (☀️)'; 
                
                // Temps Solaire & Sidéral
                if ($('solar-date')) $('solar-date').textContent = formatDate(getCDate());
                if ($('mean-solar-date')) $('mean-solar-date').textContent = ad.MST_HRS ? `${formatDate(getCDate())} ${formatAstroTime(ad.MST_HRS)}` : 'N/A';
                if ($('true-solar-date')) $('true-solar-date').textContent = ad.TST_HRS ? `${formatDate(getCDate())} ${formatAstroTime(ad.TST_HRS)}` : 'N/A';
                if ($('tst-time')) $('tst-time').textContent = ad.TST_HRS ? formatAstroTime(ad.TST_HRS) : 'N/A'; 
                if ($('mst-time')) $('mst-time').textContent = ad.MST_HRS ? formatAstroTime(ad.MST_HRS) : 'N/A'; 
                if ($('solar-noon-utc')) $('solar-noon-utc').textContent = ad.NOON_SOLAR_UTC || 'N/A';
                if ($('eot-min')) $('eot-min').textContent = dataOrDefault(ad.EOT_MIN * 60, 2, ' s'); 
                if ($('ecliptic-longitude')) $('ecliptic-longitude').textContent = dataOrDefault(ad.ECL_LONG * R2D, 2, '°');

                // Soleil & Lune
                if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(ad.sun.altitude * R2D, 2, '°');
                if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(ad.sun.azimuth * R2D, 1, '°');
                if ($('day-duration')) $('day-duration').textContent = ad.sun.duration_hrs ? formatAstroTime(ad.sun.duration_hrs) : 'N/A';
                if ($('sun-rise')) $('sun-rise').textContent = ad.sun.rise ? formatAstroTime(ad.sun.rise) : 'N/A';
                if ($('sun-set')) $('sun-set').textContent = ad.sun.set ? formatAstroTime(ad.sun.set) : 'N/A';
                
                if ($('moon-phase-name')) $('moon-phase-name').textContent = ad.moon.phase_name || 'N/A'; 
                if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(ad.illumination.fraction * 100, 1, ' %');
                if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(ad.moon.altitude * R2D, 2, '°');
                if ($('moon-azimuth')) $('moon-azimuth').textContent = dataOrDefault(ad.moon.azimuth * R2D, 1, '°');
                if ($('moon-times')) $('moon-times').textContent = (ad.moon.times && ad.moon.times.rise) ? `${formatAstroTime(ad.moon.times.rise)} / ${formatAstroTime(ad.moon.times.set)}` : 'N/A';
                if ($('moon-distance')) $('moon-distance').textContent = dataOrDefault(ad.moon.distance / 1000, 0, ' km');
                
            } catch(e) { /* Laisse N/A par défaut si astro.js échoue */ }
        }
    }, 1000);

    // =================================================================
    // INITIALISATION
    // =================================================================

    window.addEventListener('load', () => {
        startMotionListeners();
        updateNtpOffset();

   if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF();
            ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            fusionState = ukf.getState();
            fusionStatusMessage = 'INS Dead Reckoning (Prêt)'; // FIX: Définit le statut UKF immédiatement
        } else {
             fusionStatusMessage = 'UKF NON CHARGÉ (IMU/GPS Bruts)';
        }

        // Listener UI pour le bouton GPS
        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) btnToggle.addEventListener('click', togglePause);
        
        // Initialisation de l'état du bouton (Utilise la fonction de mise à jour dédiée)
        updateButtonUI(isGpsPaused);   

        // Mise à jour DOM initiale avec les statuts et valeurs par défaut
        updateDashboardDOM(fusionState);
    });

})(window);                    
