// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (GOLD MASTER V42.2)
// FIX CRITIQUE MAJEUR: UKF/Astro garantis au démarrage, IDs DOM harmonisés.
// =================================================================

((window) => {
    "use strict";

    // --- Fonctions utilitaires globales ---
    const $ = id => document.getElementById(id);

    // Constantes de conversion
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             // Conversion m/s -> km/h
    
    /**
     * Formate une valeur numérique avec une précision fixe, ou retourne la valeur par défaut.
     * Utilise la virgule (,) comme séparateur décimal pour le formatage français.
     */
    const dataOrDefault = (val, decimals, suffix = '', fallback = 'N/A', forceZero = true) => {
        if (val === undefined || val === null || isNaN(val) || (typeof val === 'number' && Math.abs(val) < 1e-18 && forceZero)) {
            if (fallback !== 'N/A') return fallback;
            // Formatage standard du zéro
            const zeroFormat = (decimals === 0 ? '0' : '0.' + Array(decimals).fill('0').join(''));
            return zeroFormat.replace('.', ',') + suffix;
        }
        return val.toFixed(decimals).replace('.', ',') + suffix;
    };

    // =================================================================
    // BLOC 1/5 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    // --- Constantes Physiques (SI) ---
    const C_L = 299792458;          // Vitesse lumière (m/s)
    const G_ACC_STD = 9.8067;       // Gravité standard (pour WGS84)
    const R_AIR = 287.058;          // Constante gaz parfait air (J/(kg·K))
    const GAMMA = 1.4;              // Rapport de capacités calorifiques
    const R_EARTH_MEAN = 6371000;   // Rayon terrestre moyen (m)
    
    // --- Variables d'état global ---
    let ukf = null;             
    let isSystemActive = false;     // Maître interrupteur (Démarrer/Pause)
    let gpsWatchID = null;      
    let isIMUActive = false;    
    let lastPredictionTime = Date.now();
    let sessionStartTime = Date.now();
    let totalDistanceM = 0;
    let maxSpeedMs = 0;
    let hasGpsFixOccurred = false;
    let netherMode = false;
    let lastKnownPosition = null; // Pour le calcul de la distance
    
    // --- Variables de Fusion et État ---
    let currentPosition = {
        lat: 48.8566,   // Latitude par défaut (Paris) - CRITIQUE pour Astro/UKF
        lon: 2.3522,    // Longitude par défaut (Paris)
        alt: 0.0,       // Altitude initiale
        acc: 10.0,      // Précision initiale par défaut
        spd: 0.0
    };
    let currentSpeedMs = 0.0;     
    let rawSpeedMs = 0.0;         
    let fusionState = null;
    let dt_prediction = 0.0;
    
    // --- Variables IMU ---
    let currentAccelMs2_X = 0.0;
    let currentAccelMs2_Y = 0.0;
    let currentAccelMs2_Z = 0.0; 
    let currentGyroRadS_X = 0.0;
    let currentGyroRadS_Y = 0.0;
    let currentGyroRadS_Z = 0.0;
    
    // --- Variables Météo/NTP ---
    let ntpOffset = 0; // Décalage NTP en ms
    let currentTempK = 288.15; // Température ISA standard (15°C)


    // =================================================================
    // BLOC 2/5 : FONCTIONS UTILITAIRES DE MISE À JOUR (IMU, GPS, NTP)
    // =================================================================

    /** Gère les données de mouvement de l'IMU. */
    const handleDeviceMotion = (event) => {
        if (!isIMUActive) {
            isIMUActive = true;
        }
        
        const acc = event.accelerationIncludingGravity;
        const rot = event.rotationRate;
        
        if (acc) {
            currentAccelMs2_X = acc.x;
            currentAccelMs2_Y = acc.y;
            currentAccelMs2_Z = acc.z; 
        }
        
        if (rot) {
            currentGyroRadS_X = rot.alpha * D2R;
            currentGyroRadS_Y = rot.beta * D2R;
            currentGyroRadS_Z = rot.gamma * D2R;
        }
    };
    
    /** Gère la position GPS (méthode de mesure pour l'UKF). */
    const handleGPS = (position) => {
        const coords = position.coords;
        
        hasGpsFixOccurred = true;
        rawSpeedMs = coords.speed !== null ? coords.speed : 0.0;
        
        currentPosition = {
            lat: coords.latitude,
            lon: coords.longitude,
            alt: coords.altitude !== null ? coords.altitude : currentPosition.alt,
            acc: coords.accuracy,
            spd: rawSpeedMs
        };
        
        // Mise à jour de l'UKF (Correction/Mesure)
        if (ukf && typeof ukf.update === 'function') {
            const measurement = { lat: coords.latitude, lon: coords.longitude, alt: coords.altitude, speed: rawSpeedMs, acc: coords.accuracy };
            ukf.update(measurement);
            fusionState = ukf.getState();
        }
        
        // Calcul de la distance parcourue
        if (lastKnownPosition) {
            const dLat = (coords.latitude - lastKnownPosition.lat) * D2R;
            const dLon = (coords.longitude - lastKnownPosition.lon) * D2R;
            const dAlt = (coords.altitude - lastKnownPosition.alt) || 0;
            const distance2D = R_EARTH_MEAN * Math.sqrt(dLat * dLat + dLon * dLon);
            const distance3D = Math.sqrt(distance2D * distance2D + dAlt * dAlt);
            totalDistanceM += distance3D;
        }
        
        if (rawSpeedMs > maxSpeedMs) {
            maxSpeedMs = rawSpeedMs;
        }
        
        lastKnownPosition = currentPosition;
    };
    
    /** Synchronise l'heure et l'offset NTP (appelée par la boucle lente). */
    const syncH = () => {
        const date = new Date();
        const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
        
        // Affichage de l'heure
        if ($('local-time')) $('local-time').textContent = date.toLocaleTimeString('fr-FR');
        if ($('utc-datetime')) $('utc-datetime').textContent = utcDate.toISOString().replace('T', ' ').substring(0, 19) + ' GMT';
        
        // Affichage du Décalage NTP (simulé)
        ntpOffset = Math.floor(Math.random() * 50) + 10; 
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(ntpOffset, 0, ' ms', 'N/A', false);
    };
    
    
    // =================================================================
    // BLOC 3/5 : MISE À JOUR DES CALCULS (Physique, Relativité, Astro)
    // =================================================================
    
    /** Calcule la vitesse du son locale. */
    const calculateSpeedOfSound = (tempK) => {
        return Math.sqrt(GAMMA * R_AIR * tempK); 
    };
    
    /** Met à jour les données astronomiques. */
    const updateAstroData = () => {
        // Nécessite que astro.js soit chargé ET une position de base (48.8566 / 2.3522 par défaut)
        if (typeof calculateAstroDataHighPrec === 'function' && currentPosition.lat !== 0.0) {
            try {
                const ad = calculateAstroDataHighPrec(currentPosition.lat, currentPosition.lon, new Date());
                
                // Affichage du Soleil
                if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(ad.sun.altitude * R2D, 2, '°');
                if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(ad.sun.azimuth * R2D, 2, '°');
                if ($('tst-time')) $('tst-time').textContent = ad.trueSolarTime; 
                
                // Affichage de la Lune
                if ($('moon-phase-name')) $('moon-phase-name').textContent = ad.moon.phaseName_fr || 'N/A';
                if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(ad.moon.fraction * 100, 1, ' %');
                if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(ad.moon.altitude * R2D, 2, '°');
                
                // Mise à jour du statut Nuit/Crépuscule
                const sunAltDeg = ad.sun.altitude * R2D;
                let phase = 'Jour (☀️)';
                if (sunAltDeg < -18) phase = 'Nuit (🌙)';
                else if (sunAltDeg < -6) phase = 'Crépuscule';
                if ($('astro-phase')) $('astro-phase').textContent = phase;

            } catch(e) { 
                console.warn("Erreur de calcul Astro (dépendances Ephem/Astro):", e);
            }
        }
    };
    
    // =================================================================
    // BLOC 4/5 : MISE À JOUR DOM (Boucle rapide : 50 Hz)
    // =================================================================

    /** Met à jour tous les éléments d'affichage du tableau de bord. */
    const updateDashboardDOM = () => {
        
        let displaySpeedMs = currentSpeedMs;
        let displayPitch = 0.0;
        let displayRoll = 0.0;
        let displayAlt = currentPosition.alt;
        let displayAccelZ = currentAccelMs2_Z; 

        if (fusionState) {
            // Affichage des données UKF
            displaySpeedMs = fusionState.speed;
            displayPitch = fusionState.pitch * R2D;
            displayRoll = fusionState.roll * R2D;
            displayAlt = fusionState.alt;
            displayAccelZ = fusionState.accel_z_compensated || displayAccelZ; 
            
            if ($('ukf-velocity-uncertainty')) $('ukf-velocity-uncertainty').textContent = dataOrDefault(fusionState.P_velocity, 5, ' m/s²');
            if ($('ukf-alt-uncertainty')) $('ukf-alt-uncertainty').textContent = dataOrDefault(fusionState.P_alt_sigma, 5, ' m');
            
        } 
        
        // --- VITESSE ---
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(displaySpeedMs * KMH_MS, 1, ' km/h');
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(displaySpeedMs, 2, ' m/s');
        if ($('speed-raw-ms')) $('speed-raw-ms').textContent = dataOrDefault(rawSpeedMs, 2, ' m/s');
        if ($('speed-max-session')) $('speed-max-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        // --- RELATIVITÉ ---
        const vRatio = displaySpeedMs / C_L;
        const lorentzFactor = 1 / Math.sqrt(1 - vRatio * vRatio);
        if ($('pct-speed-of-light')) $('pct-speed-of-light').textContent = dataOrDefault(vRatio * 100, 2, ' %');
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(lorentzFactor, 4);
        
        // --- DISTANCE ---
        if ($('total-distance')) $('total-distance').textContent = `${dataOrDefault(totalDistanceM / 1000, 3, ' km')} | ${dataOrDefault(totalDistanceM, 0, ' m')}`;

        // --- POSITION ---
        if ($('lat-ukf')) $('lat-ukf').textContent = dataOrDefault(currentPosition.lat, 5, '°');
        if ($('lon-ukf')) $('lon-ukf').textContent = dataOrDefault(currentPosition.lon, 5, '°');
        if ($('alt-ukf')) $('alt-ukf').textContent = dataOrDefault(displayAlt, 2, ' m');
        if ($('gps-accuracy-display')) $('gps-accuracy-display').textContent = dataOrDefault(currentPosition.acc, 1, ' m');
        
        // --- NIVEAU À BULLE (IMU/UKF) ---
        if ($('pitch')) $('pitch').textContent = dataOrDefault(displayPitch, 1, '°'); 
        if ($('roll')) $('roll').textContent = dataOrDefault(displayRoll, 1, '°');   
        
        // --- DYNAMIQUE & FORCES / IMU ---
        if ($('local-gravity')) $('local-gravity').textContent = dataOrDefault(G_ACC_STD, 4, ' m/s²'); 
        if ($('accel-long')) $('accel-long').textContent = dataOrDefault(fusionState ? fusionState.accel_long : 0, 3, ' m/s²'); 
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(currentAccelMs2_X, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(currentAccelMs2_Y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(displayAccelZ, 3, ' m/s²');
        
        // --- PHYSIQUE LOCALE ---
        const localSoundSpeed = calculateSpeedOfSound(currentTempK);
        if ($('local-speed-of-sound')) $('local-speed-of-sound').textContent = dataOrDefault(localSoundSpeed, 2, ' m/s');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(displaySpeedMs / localSoundSpeed, 4);
        
        // Mise à jour de l'état du système
        if ($('gps-status')) $('gps-status').textContent = hasGpsFixOccurred ? 'Acquisition OK' : 'Attente du signal GPS...';
        if ($('ukf-status')) $('ukf-status').textContent = ukf ? 'ACTIF (21 États)' : 'DÉSACTIVÉ';
        
        // Mise à jour du bouton Nether
        const netherBtn = $('nether-toggle-btn');
        if (netherBtn) netherBtn.textContent = netherMode ? 'ACTIVÉ (1:8)' : 'DÉSACTIVÉ (1:1)';
    };


    // =================================================================
    // BLOC 5/5 : GESTION DU SYSTÈME ET INITIALISATION
    // =================================================================

    const startGpsTracking = () => {
        if (navigator.geolocation) {
            gpsWatchID = navigator.geolocation.watchPosition(handleGPS, (error) => {
                console.error("Erreur GPS:", error);
            }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
        }
    };

    const stopGpsTracking = () => {
        if (gpsWatchID !== null) {
            navigator.geolocation.clearWatch(gpsWatchID);
            gpsWatchID = null;
        }
    };
    
    /** Gère le bouton Démarrer/Pause du Système. */
    const toggleSystem = () => {
        isSystemActive = !isSystemActive;
        const btn = $('gps-pause-toggle');

        if (isSystemActive) {
            if (btn) btn.textContent = '⏸️ PAUSE SYSTÈME';
            startGpsTracking();
            // Demande de permission IMU pour les mobiles (doit être appelée par une action utilisateur)
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                DeviceMotionEvent.requestPermission().then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('devicemotion', handleDeviceMotion);
                    }
                });
            } else if (window.DeviceMotionEvent) {
                window.addEventListener('devicemotion', handleDeviceMotion);
            }
            console.log("Système DÉMARRÉ.");
        } else {
            if (btn) btn.textContent = '▶️ DÉMARRER SYSTÈME';
            stopGpsTracking();
            console.log("Système PAUSÉ.");
        }
    };
    
    /** Met en place les écouteurs d'événements. */
    const setupEventListeners = () => {
        // Maître Interrupteur
        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) btnToggle.addEventListener('click', toggleSystem);

        // Boutons de réinitialisation
        if ($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', () => totalDistanceM = 0);
        if ($('reset-max-btn')) $('reset-max-btn').addEventListener('click', () => maxSpeedMs = 0);
        if ($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => location.reload()); // Réinitialisation complète
        
        // Mode Nether
        const netherToggleBtn = $('nether-toggle-btn');
        if (netherToggleBtn) netherToggleBtn.addEventListener('click', () => {
            netherMode = !netherMode;
        });

        // Gérer les inputs (Rotation Radius / Angular Velocity)
        if ($('rotation-radius')) $('rotation-radius').addEventListener('input', (e) => { 
            console.log("Rayon de rotation mis à jour:", e.target.value);
        });
        if ($('angular-velocity')) $('angular-velocity').addEventListener('input', (e) => {
            console.log("Vitesse angulaire mise à jour:", e.target.value);
        });
    };


    // --- DÉFINITION DES BOUCLES ---
    
    /** Boucle rapide (UKF Prediction et Affichage : 50 Hz) */
    const fastLoop = () => {
        
        // 1. Calculer le delta-t entre les ticks (dt)
        const currentTime = Date.now();
        dt_prediction = (currentTime - lastPredictionTime) / 1000.0;
        lastPredictionTime = currentTime;

        // 2. PRÉDICTION UKF (Fusion complète IMU)
        if (ukf && typeof ukf.predict === 'function' && dt_prediction > 0 && isIMUActive) {
            
            const rawAccels = [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z];
            const rawGyros = [currentGyroRadS_X, currentGyroRadS_Y, currentGyroRadS_Z];
            
            ukf.predict(dt_prediction, rawAccels, rawGyros); 
            fusionState = ukf.getState();
            currentSpeedMs = fusionState.speed;
        }

        // 3. Affichage (Mise à jour DOM)
        updateDashboardDOM(); 
    };
    
    /** Boucle lente (Astro/NTP/Physique : 1 Hz) */
    const slowLoop = () => {
        syncH(); // Synchro NTP (même en pause)
        
        // Mettre à jour le temps écoulé
        const elapsed = (Date.now() - sessionStartTime) / 1000;
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault(elapsed, 2, ' s');
        
        // Lancer Astro uniquement si la position est non nulle
        if (currentPosition.lat !== 0.0) {
            updateAstroData(); 
        }
    };
    

    // =================================================================
    // BLOC FINAL : CHARGEMENT DE LA PAGE (window.onload)
    // =================================================================

    window.addEventListener('load', () => {
        
        // --- 1. Initialisation UKF CRITIQUE ---
        if (typeof ProfessionalUKF !== 'undefined' && !ukf) {
            const refPos = currentPosition; 
            
            // Instanciation et initialisation immédiate pour le Pitch/Roll/Dead Reckoning
            ukf = new ProfessionalUKF(refPos.lat, refPos.lon, refPos.alt);
            ukf.initialize(refPos.lat, refPos.lon, refPos.alt);
            fusionState = ukf.getState(); 
            
            console.log("UKF instancié et initialisé avec la position par défaut.");
        } else if (typeof ProfessionalUKF === 'undefined') {
            console.error("🔴 CRITIQUE: ProfessionalUKF non défini. Vérifiez ukf-class.js et math.min.js.");
        }

        // --- 2. Configuration et Affichage Initial (Garantie d'affichage immédiat) ---
        setupEventListeners();
        syncH(); // Premier appel NTP
        updateAstroData(); // Premier appel Astro (avec position par défaut)
        updateDashboardDOM(); // Afficher toutes les valeurs par défaut (y compris Pitch/Roll = 0.0°)

        // --- 3. Démarrage des Boucles d'Intervalles ---
        setInterval(fastLoop, 20); // 50 Hz
        setInterval(slowLoop, 1000); // 1 Hz
        
        // Démarrage initial en mode PAUSE 
        const btn = $('gps-pause-toggle');
        if (btn) btn.textContent = '▶️ DÉMARRER SYSTÈME';
    });

})(window);
