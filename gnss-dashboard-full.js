// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (V45 - GOLD MASTER)
// CORRECTIONS: Astro & IMU débloqués en PAUSE, Statuts initialisés.
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances ---
    if (typeof math === 'undefined') console.error("🔴 CRITIQUE: math.js manquant.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 CRITIQUE: ProfessionalUKF manquant.");

    // =================================================================
    // BLOC 1: CONFIGURATION & ÉTAT
    // =================================================================

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             
    const C_L = 299792458;          
    const G_ACC_STD = 9.8067;       
    const G_CONST = 6.67430e-11;    

    // État Système
    let ukf = null;             
    let isGpsPaused = true;     
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let isMagActive = false;    
    
    // Statuts (Initialisés pour éviter N/A)
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
    
    // Position par défaut (Marseille) pour Astro immédiat
    let currentPosition = {lat: 43.284611, lon: 5.358715, alt: 100.00, speed: 0.0, acc: 0};
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
    
    // Synchro NTP
    const updateNtpOffset = async () => {
        try {
            const t0 = Date.now(); 
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC'); 
            const data = await response.json();
            const t3 = Date.now(); 
            const serverTimeMs = data.unixtime * 1000;
            ntpOffsetMs = (serverTimeMs + ((t3 - t0) / 2)) - t3;
            console.log(`✅ NTP Sync: Offset ${ntpOffsetMs.toFixed(2)} ms.`);
        } catch (e) { console.warn("NTP Sync Failed (Offline?)"); }
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
                    curMag.x = Math.sin(e.alpha * D2R) * 10;
                    curMag.y = Math.cos(e.alpha * D2R) * 10;
                    curMag.z = 45; 
                }
             });
             isMagActive = true;
        }
    };
    
    const handleGpsUpdate = (pos) => {
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lon = pos.coords.longitude;
        currentPosition.alt = pos.coords.altitude || lastKnownAlt;
        currentPosition.speed = pos.coords.speed || 0.0;
        currentPosition.acc = pos.coords.accuracy || 25.0; 

        gpsStatusMessage = `Acquisition OK (Préc: ${currentPosition.acc.toFixed(1)}m)`;
        hasGpsFixOccurred = true;
        
        // Initialisation ou Correction UKF
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
            if (!gpsWatchID) {
                gpsWatchID = navigator.geolocation.watchPosition(
                    handleGpsUpdate, 
                    (err) => { gpsStatusMessage = `Erreur GPS ${err.code}`; }, 
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                );
            }
            gpsStatusMessage = 'Recherche satellites...';
        } else {
            btn.textContent = '▶️ MARCHE GPS';
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
        
        // Calcul Fallback Pitch/Roll si UKF pas encore chaud
        let pitch, roll;
        if (fusion) {
            pitch = fusion.pitch;
            roll = fusion.roll;
        } else {
            // Calcul trigonométrique basique pour affichage immédiat
            roll = Math.atan2(curAcc.y, curAcc.z) * R2D;
            pitch = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y*curAcc.y + curAcc.z*curAcc.z)) * R2D;
        }

        // --- Mises à jour DOM ---
        
        // 1. Statuts
        if ($('statut-gps')) $('statut-gps').textContent = gpsStatusMessage;
        
        if (ukf && ukf.isInitialized()) {
             fusionStatusMessage = isGpsPaused ? 'INS Dead Reckoning (Sans GPS)' : 'UKF Actif (Fusion)';
        } else {
             fusionStatusMessage = 'Attente init. UKF...';
        }
        if ($('statut-ekf')) $('statut-ekf').textContent = fusionStatusMessage;

        // 2. Position & Vitesse
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = dataOrDefault(alt, 2, ' m');
        
        if ($('vitesse-stable-kmh')) $('vitesse-stable-kmh').textContent = dataOrDefault(speed * KMH_MS, 1, ' km/h');
        if ($('dist-totale')) $('dist-totale').textContent = dataOrDefault(totalDistanceM, 2, ' m');

        // 3. IMU (Affichage immédiat)
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 2);
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 2);
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 2); 
        if ($('pitch-imu')) $('pitch-imu').textContent = dataOrDefault(pitch, 1, '°');
        if ($('roll-imu')) $('roll-imu').textContent = dataOrDefault(roll, 1, '°');

        // 4. Physique & Relativité
        if ($('nombre-mach')) $('nombre-mach').textContent = dataOrDefault(speed / 340.29, 4); 
        if ($('gravitation-u')) $('gravitation-u').textContent = `${dataOrDefault(G_CONST, 10, '')} m³/kg/s²`;
        if ($('vitesse-lumiere')) $('vitesse-lumiere').textContent = `${C_L} m/s`;
        
        // Niveau à bulle
        const bubble = $('bubble');
        if (bubble) {
            const bx = Math.min(Math.max(roll, -45), 45) * 1.5;
            const by = Math.min(Math.max(pitch, -45), 45) * -1.5;
            bubble.style.transform = `translate(${bx}px, ${by}px)`;
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

    // Boucle Rapide (Physique/UKF)
    setInterval(() => {
         const now = Date.now();
         let dt = (now - lastPredictionTime) / 1000.0;
         lastPredictionTime = now;
         
         // L'UKF doit tourner TOUT LE TEMPS s'il est initialisé (même sans GPS)
         if (ukf && ukf.isInitialized() && dt > 0) {
             try {
                 ukf.predict(dt, curAcc, curGyro);
                 fusionState = ukf.getState();
                 currentSpeedMs = fusionState.speed;
                 
                 if (isMagActive) ukf.update_Mag(curMag);
             } catch (e) { console.error(e); }
         } else {
             // Fallback si UKF pas prêt
             currentSpeedMs = currentPosition.speed;
         }
         
         if (!isGpsPaused && currentSpeedMs * KMH_MS > 0.1) { 
            totalDistanceM += currentSpeedMs * dt;
         }
         maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
         
         updateDashboardDOM(fusionState); 
         
    }, 20); 

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
                // Mise à jour DOM Astro (exemple partiel)
                if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(ad.sun.altitude * R2D, 2, '°');
                if ($('night-status')) $('night-status').textContent = (ad.sun.altitude * R2D < -6) ? 'Nuit (🌙)' : 'Jour (☀️)';
                if ($('heure-solaire-vraie')) $('heure-solaire-vraie').textContent = ad.TST_HRS || 'N/A';
            } catch(e) {}
        }
    }, 1000);

    // =================================================================
    // INITIALISATION
    // =================================================================

    window.addEventListener('load', () => {
        // Démarrage Capteurs
        startMotionListeners();
        updateNtpOffset();
        
        // Initialisation UKF Immédiate
        if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            fusionState = ukf.getState();
            fusionStatusMessage = 'INS Dead Reckoning (Prêt)';
        }

        // Listeners UI
        const btn = $('gps-pause-toggle');
        if (btn) btn.addEventListener('click', togglePause);
        
        // Affichage initial
        updateDashboardDOM(fusionState);
    });

})(window);
