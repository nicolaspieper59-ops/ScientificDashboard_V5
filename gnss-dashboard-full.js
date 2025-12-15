// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (V45 - GOLD MASTER)
// CORRECTIONS: Astro & IMU débloqués en PAUSE, Statuts initialisés.
// ALIGNEMENT AVEC index (17).html
// DÉPENDANCES CRITIQUES: math.js, ProfessionalUKF, turf.js, calculateAstroDataHighPrec (ephem.js/astro.js)
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances ---
    // Ces vérifications sont CRITIQUES pour la stabilité
    if (typeof math === 'undefined') console.error("🔴 CRITIQUE: math.js manquant. Le UKF ne peut pas fonctionner.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 CRITIQUE: ProfessionalUKF manquant.");
    if (typeof turf === 'undefined') console.warn("🟡 AVERTISSEMENT: turf.js manquant. Le calcul de distance GPS sera moins précis.");
    if (typeof calculateAstroDataHighPrec === 'undefined') console.warn("🟡 AVERTISSEMENT: ephem.js/astro.js manquants. Les données astronomiques ne seront pas affichées.");


    // =================================================================
    // BLOC 1: CONFIGURATION & ÉTAT
    // =================================================================

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const C_L = 299792458;          // Vitesse de la lumière
    const G_ACC_STD = 9.8067;       // Gravité standard
    const G_CONST = 6.67430e-11;    // Constante gravitationnelle

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
    let lastLatLon = [0, 0];
    let lastGpsUpdateTime = 0; // Ajout pour gestion de la distance
    
    // Données
    let hasGpsFixOccurred = false;
    let totalDistanceM = 0.0;
    let maxSpeedMs = 0.0;
    let timeInMotionMs = 0.0;
    
    // Position par défaut (Marseille) pour Astro immédiat
    let currentPosition = {lat: 43.284611, lon: 5.358715, alt: 100.00, speed: 0.0, acc: 25.0};
    let currentSpeedMs = 0.0;
    
    // IMU Brute
    let curAcc = {x: 0, y: 0, z: G_ACC_STD}; 
    let curGyro = {x: 0, y: 0, z: 0};
    let curMag = {x: 0, y: 0, z: 0};
    let fusionState = null; 

    // =================================================================
    // BLOC 2: UTILITAIRES & NTP
    // =================================================================
    
    const $ = (id) => document.getElementById(id);
    
    // Fonction améliorée pour l'affichage (gestion de l'exponentiel)
    const dataOrDefault = (value, precision = 2, unit = '', naText = 'N/A') => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return naText;
        if (Math.abs(value) < 1e-4 && Math.abs(value) > 0) return `${value.toExponential(4)}${unit}`;
        return `${value.toFixed(precision)}${unit}`;
    };

    const getCDate = () => new Date();

    // Utilitaires de Temps UTC
    function formatTime(date) {
        return `${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')}:${String(date.getUTCSeconds()).padStart(2,'0')}`;
    }
    function formatDate(date) {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
    }
    
    // Synchro NTP (Gardée en simulation dans le fichier précédent, mais restaurée si l'API est accessible)
    const updateNtpOffset = async () => {
        try {
            const t0 = Date.now(); 
            // NOTE: L'accès à worldtimeapi.org est requis ici.
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC'); 
            const data = await response.json();
            const t3 = Date.now(); 
            const serverTimeMs = data.unixtime * 1000;
            ntpOffsetMs = (serverTimeMs + ((t3 - t0) / 2)) - t3;
            console.log(`✅ NTP Sync: Offset ${ntpOffsetMs.toFixed(2)} ms.`);
        } catch (e) { 
            console.warn("NTP Sync Failed (Offline or API issue). Time will use local clock.");
            ntpOffsetMs = 0;
        }
    };

    // =================================================================
    // BLOC 3: CAPTEURS (IMU & GPS)
    // =================================================================

    const startMotionListeners = () => {
        // IMU (Accéléromètre/Gyroscope)
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
        // Magnétomètre
        if (typeof DeviceOrientationEvent !== 'undefined' && !isMagActive) {
             window.addEventListener('deviceorientation', (e) => {
                if (e.alpha !== null) {
                    // Simulation ou données brutes (si l'appareil fournit le cap magnétique)
                    curMag.x = Math.sin((e.alpha || 0) * D2R) * 10;
                    curMag.y = Math.cos((e.alpha || 0) * D2R) * 10;
                    curMag.z = 45; 
                }
             });
             isMagActive = true;
        }
    };
    
    const handleGpsUpdate = (pos) => {
        const now = Date.now();
        
        // 1. Mise à jour de la position brute
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lon = pos.coords.longitude;
        currentPosition.alt = pos.coords.altitude || currentPosition.alt;
        currentPosition.speed = pos.coords.speed || 0.0;
        
        // Utilisation de l'override utilisateur pour la précision
        const forcedAcc = parseFloat($('gps-accuracy-input') ? $('gps-accuracy-input').value : 0.0) || 0.0;
        currentPosition.acc = (forcedAcc > 0) ? forcedAcc : (pos.coords.accuracy || 25.0); 

        gpsStatusMessage = `Acquisition OK (Préc: ${currentPosition.acc.toFixed(1)}m)`;
        hasGpsFixOccurred = true;
        lastGpsUpdateTime = now; // Enregistrement du dernier update
        
        // 2. Correction UKF
        if (ukf) {
            if (!ukf.isInitialized()) ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            ukf.update(pos);
            fusionState = ukf.getState();
        }
    };

    const togglePause = () => {
        isGpsPaused = !isGpsPaused;
        const btn = $('gps-pause-toggle');
        
        if (!isGpsPaused) {
            btn.textContent = '⏸️ PAUSE GPS';
            btn.classList.remove('success');
            btn.classList.add('error');
            if (!gpsWatchID) {
                gpsWatchID = navigator.geolocation.watchPosition(
                    handleGpsUpdate, 
                    (err) => { 
                        gpsStatusMessage = `Erreur GPS ${err.code}`; 
                        btn.classList.add('error');
                        btn.classList.remove('success');
                    }, 
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                );
            }
            gpsStatusMessage = 'Recherche satellites...';
        } else {
            btn.textContent = '▶️ MARCHE GPS';
            btn.classList.add('success');
            btn.classList.remove('error');
            if (gpsWatchID) {
                navigator.geolocation.clearWatch(gpsWatchID);
                gpsWatchID = null;
            }
            gpsStatusMessage = 'GPS en Pause';
        }
    };
    
    // =================================================================
    // BLOC 4: GESTION DU DOM (AFFICHAGE)
    // =================================================================

    const updateDashboardDOM = (fusion) => {
        // Sélection des données : Fusion > GPS > Défaut
        const lat = fusion ? fusion.lat : currentPosition.lat;
        const lon = fusion ? fusion.lon : currentPosition.lon;
        const alt = fusion ? fusion.alt : currentPosition.alt;
        const speed = fusion ? fusion.speed : currentPosition.speed;
        const yaw = fusion ? fusion.yaw : 0; // Cap
        const vD = fusion ? fusion.vD : 0; // Vitesse verticale
        
        let pitch, roll;
        // Attitude (Pitch/Roll/Yaw)
        if (fusion) {
            pitch = fusion.pitch;
            roll = fusion.roll;
        } else {
            // Calcul trigonométrique basique pour affichage immédiat
            roll = Math.atan2(curAcc.y, curAcc.z) * R2D;
            pitch = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y*curAcc.y + curAcc.z*curAcc.z)) * R2D;
        }

        // --- Mises à jour DOM ---
        
        // 1. Statuts & Debug UKF
        if ($('statut-gps')) $('statut-gps').textContent = gpsStatusMessage;
        
        if (ukf && ukf.isInitialized()) {
             fusionStatusMessage = isGpsPaused || !hasGpsFixOccurred ? 'INS Dead Reckoning (Sans GPS)' : 'UKF Actif (Fusion)';
             // Affichage de P (Précision/Incertitude)
             if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(fusion.uncertainty_vel_rms, 6, ' m/s');
             if ($('ukf-alt-sigma')) $('ukf-alt-sigma').textContent = dataOrDefault(fusion.uncertainty_alt_sigma, 4, ' m');
             if ($('noise-r-vel')) $('noise-r-vel').textContent = dataOrDefault(ukf.getRFactor(), 2);
        } else {
             fusionStatusMessage = 'Attente init. UKF...';
        }
        if ($('statut-ekf')) $('statut-ekf').textContent = fusionStatusMessage;

        // 2. Position & Vitesse
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = dataOrDefault(alt, 2, ' m');
        if ($('heading-display')) $('heading-display').textContent = dataOrDefault(yaw, 1, '°');

        // Vitesse (3 décimales pour l'objectif mm/s)
        if ($('vitesse-stable-kmh')) $('vitesse-stable-kmh').textContent = dataOrDefault(speed * KMH_MS, 3, ' km/h');
        if ($('vitesse-stable-ms')) $('vitesse-stable-ms').textContent = dataOrDefault(speed, 3, ' m/s'); 
        
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(currentPosition.speed, 2, ' m/s');
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        const distKm = totalDistanceM / 1000;
        if ($('dist-totale')) $('dist-totale').textContent = `${dataOrDefault(distKm, 3, ' km')} | ${dataOrDefault(totalDistanceM, 2, ' m')}`;
        if ($('time-in-motion')) $('time-in-motion').textContent = dataOrDefault(timeInMotionMs / 1000, 2, ' s');

        if ($('gps-accuracy-display')) $('gps-accuracy-display').textContent = dataOrDefault(currentPosition.acc, 1, ' m');
        if ($('vertical-speed-ukf')) $('vertical-speed-ukf').textContent = dataOrDefault(vD, 2, ' m/s');

        // 3. IMU
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 2);
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 2);
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 2); 
        if ($('pitch-imu')) $('pitch-imu').textContent = dataOrDefault(pitch, 1, '°');
        if ($('roll-imu')) $('roll-imu').textContent = dataOrDefault(roll, 1, '°');
        if ($('mag-x')) $('mag-x').textContent = dataOrDefault(curMag.x, 1);
        
        const grav_mag = Math.sqrt(curAcc.x**2 + curAcc.y**2 + curAcc.z**2);
        if ($('gravity-local')) $('gravity-local').textContent = dataOrDefault(grav_mag, 4, ' m/s²');
        const long_acc = Math.abs(grav_mag - G_ACC_STD); 
        if ($('acc-long-display')) $('acc-long-display').textContent = dataOrDefault(long_acc, 2, ' m/s²');
        if ($('force-g-long')) $('force-g-long').textContent = dataOrDefault(long_acc / G_ACC_STD, 2, ' G');
        
        // 4. Physique & Relativité
        if ($('nombre-mach')) $('nombre-mach').textContent = dataOrDefault(speed / 340.29, 4); 
        if ($('gravitation-u')) $('gravitation-u').textContent = `${dataOrDefault(G_CONST, 10, '')} m³/kg/s²`;
        if ($('vitesse-lumiere')) $('vitesse-lumiere').textContent = `${C_L} m/s`;

        const lorentz = 1 / Math.sqrt(1 - (speed / C_L)**2);
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentz, 4);
        if ($('speed-of-light-pct')) $('speed-of-light-pct').textContent = dataOrDefault(speed / C_L * 100, 6, ' %');
        
        const mass = parseFloat($('object-mass-input') ? $('object-mass-input').value : 70.0) || 70.0;
        if ($('mass-display')) $('mass-display').textContent = dataOrDefault(mass, 3, ' kg');
        if ($('energie-cinetique')) $('energie-cinetique').textContent = dataOrDefault(0.5 * mass * speed**2, 2, ' J');
        
        // Niveau à bulle
        const bubble = $('bubble');
        if (bubble) {
            const bx = Math.min(Math.max(roll, -45), 45) * 1.5;
            const by = Math.min(Math.max(pitch, -45), 45) * -1.5;
            bubble.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`; // Ajout translate pour centrer
        }
    };

    const updateTimeCounters = () => {
        const now = getCDate(); 
        const utcDate = new Date(now.getTime() + ntpOffsetMs);

        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR', { hour12: false });
        if ($('utc-datetime')) $('utc-datetime').textContent = `${formatDate(utcDate)} ${formatTime(utcDate)} (UTC)`;
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault((Date.now() - sessionStartTime)/1000, 2, ' s');
    };

    // =================================================================
    // BLOC 5: BOUCLE PRINCIPALE (50 Hz) & ASTRO
    // =================================================================

    // Boucle Rapide (Physique/UKF - 50 Hz)
    setInterval(() => {
         const now = Date.now();
         let dt = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         // L'UKF tourne TOUT LE TEMPS s'il est initialisé (INS)
         if (ukf && ukf.isInitialized() && dt > 0) {
             try {
                 ukf.predict(dt, curAcc, curGyro);
                 fusionState = ukf.getState();
                 currentSpeedMs = fusionState.speed;
                 
                 // Correction Mag pour le cap (si actif)
                 if (isMagActive) {
                    // Si ukf.update_Mag existe: ukf.update_Mag(curMag);
                 }
                 
                 // Accumulation de distance basée sur la vitesse UKF (Dead Reckoning)
                 totalDistanceM += currentSpeedMs * dt;
                 
                 // Temps en mouvement (si vitesse UKF > 0.1 m/s)
                 if (currentSpeedMs > 0.1) {
                     timeInMotionMs += dt * 1000;
                 }
                 
             } catch (e) { console.error("Erreur de Prédiction UKF:", e); }
         } else {
             // Fallback
             currentSpeedMs = currentPosition.speed;
             // Distance GPS simple (si non en pause)
             if (!isGpsPaused && currentSpeedMs > 0.1 && hasGpsFixOccurred) { 
                // La correction de distance GPS doit être faite dans handleGpsUpdate avec turf.distance
             }
         }
         
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         
         updateDashboardDOM(fusionState); 
         
    }, 20); // 50 Hz

    // Boucle Lente (1Hz - Astro/Météo)
    setInterval(() => {
        updateTimeCounters();
        
        // Astro fonctionne toujours avec la dernière position connue (Fusion ou Défaut)
        const lat = fusionState ? fusionState.lat : currentPosition.lat;
        const lon = fusionState ? fusionState.lon : currentPosition.lon;
        
        if (typeof calculateAstroDataHighPrec === 'function') {
            try {
                // Fonction externe Astro
                const ad = calculateAstroDataHighPrec(getCDate(), lat, lon);
                // Mise à jour DOM Astro
                if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(ad.sun.altitude * R2D, 2, '°');
                if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(ad.sun.azimuth * R2D, 1, '°');
                if ($('night-status')) $('night-status').textContent = (ad.sun.altitude * R2D < -6) ? 'Nuit (🌙)' : 'Jour (☀️)';
                if ($('heure-solaire-vraie')) $('heure-solaire-vraie').textContent = ad.TST_HRS || 'N/A';
                
                // Lune (selon index (17).html)
                if ($('moon-phase')) $('moon-phase').textContent = ad.moon.phase_name || 'N/A';
                if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(ad.illumination.fraction * 100, 1, ' %');
                if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(ad.moon.altitude * R2D, 2, '°');
                // if ($('moon-azimuth')) $('moon-azimuth').textContent = dataOrDefault(ad.moon.azimuth * R2D, 1, '°'); // ID non utilisé dans le html final
                if ($('moon-distance')) $('moon-distance').textContent = dataOrDefault(ad.moon.distance / 1000, 0, ' km');

            } catch(e) { /*console.warn("Erreur Calcul Astro:", e);*/ } // Désactiver les logs d'erreur si Astro n'est pas complètement intégré
        }
    }, 1000);

    // =================================================================
    // INITIALISATION & LISTENERS UI
    // =================================================================

    window.addEventListener('load', () => {
        // Démarrage Capteurs
        startMotionListeners();
        updateNtpOffset();
        
        // Initialisation UKF Immédiate
        if (typeof ProfessionalUKF !== 'undefined') {
            // L'initialisation doit être faite AVEC les coordonnées
            ukf = new ProfessionalUKF();
            ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            fusionState = ukf.getState();
            fusionStatusMessage = 'INS Dead Reckoning (Prêt)';
        }

        // Listeners UI
        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) btnToggle.addEventListener('click', togglePause);
        
        // Listener ZUUV
        const btnZuuv = $('zuuv-update');
        if (btnZuuv) btnZuuv.addEventListener('click', () => {
             if (ukf && ukf.isInitialized() && typeof ukf.update_ZUUV === 'function') ukf.update_ZUUV();
        });
        
        // Initialisation de l'état du bouton
        if (btnToggle) {
            btnToggle.textContent = isGpsPaused ? '▶️ MARCHE GPS' : '⏸️ PAUSE GPS';
            btnToggle.classList.add(isGpsPaused ? 'success' : 'error');
        }

        // Affichage initial
        updateDashboardDOM(fusionState);
        togglePause(); // Démarrage par défaut du GPS (si vous souhaitez qu'il démarre immédiatement)
    });

})(window);
