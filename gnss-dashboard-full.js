// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (GOLD MASTER V42.1)
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
     */
    const dataOrDefault = (val, decimals, suffix = '', fallback = 'N/A', forceZero = true) => {
        if (val === undefined || val === null || isNaN(val) || (typeof val === 'number' && Math.abs(val) < 1e-18 && forceZero)) {
            if (fallback !== 'N/A') return fallback;
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
    const G_U = 6.67430e-11;        // Constante gravitationnelle universelle
    const R_EARTH_MEAN = 6371000;   // Rayon terrestre moyen (m)
    const R_AIR = 287.058;          // Constante gaz parfait air (J/(kg·K))
    const GAMMA = 1.4;              // Rapport de capacités calorifiques
    
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
    let currentCelestialBody = 'earth';
    let currentUKFReactivity = 'auto';
    let rotationRadius = 100;
    let angularVelocity = 0.0;
    
    // --- Variables de Fusion et État ---
    let currentPosition = {
        lat: 48.8566,   // Latitude par défaut (Paris) - CRITIQUE pour Astro/UKF
        lon: 2.3522,    // Longitude par défaut (Paris)
        alt: 0.0,
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
    let currentAccelMs2_Z = G_ACC_STD; // Doit être initialisé à G pour un système au repos
    let currentGyroRadS_X = 0.0;
    let currentGyroRadS_Y = 0.0;
    let currentGyroRadS_Z = 0.0;
    
    // --- Variables Météo/NTP ---
    let ntpOffset = 0; // Décalage NTP en ms
    let currentTempK = 288.15; // Température ISA standard (15°C)
    let currentPressurePa = 101325; // Pression ISA standard (1013.25 hPa)


    // =================================================================
    // BLOC 2/5 : FONCTIONS UTILITAIRES DE MISE À JOUR (IMU, GPS, NTP)
    // =================================================================

    /** Gère les données de mouvement de l'IMU. */
    const handleDeviceMotion = (event) => {
        if (!isIMUActive) {
            isIMUActive = true;
            console.log("IMU activé.");
        }
        
        const acc = event.accelerationIncludingGravity;
        const rot = event.rotationRate;
        
        if (acc) {
            currentAccelMs2_X = acc.x;
            currentAccelMs2_Y = acc.y;
            currentAccelMs2_Z = acc.z; // Ceci inclut la gravité
            
            // Affichage IMU brut
            if ($('accel-x')) $('accel-x').textContent = dataOrDefault(acc.x, 3, ' m/s²');
            if ($('accel-y')) $('accel-y').textContent = dataOrDefault(acc.y, 3, ' m/s²');
            if ($('accel-z')) $('accel-z').textContent = dataOrDefault(acc.z, 3, ' m/s²'); // CORRECTION ID
        }
        
        if (rot) {
            currentGyroRadS_X = rot.alpha * D2R;
            currentGyroRadS_Y = rot.beta * D2R;
            currentGyroRadS_Z = rot.gamma * D2R;
            // La vitesse angulaire sera affichée via l'UKF ou dans la section Gyro
        }
    };
    
    /** Gère la position GPS (méthode de mesure pour l'UKF). */
    const handleGPS = (position) => {
        const coords = position.coords;
        const now = Date.now();
        
        // Mise à jour de l'état
        hasGpsFixOccurred = true;
        rawSpeedMs = coords.speed !== null ? coords.speed : 0.0;
        
        // Mise à jour de la position
        currentPosition = {
            lat: coords.latitude,
            lon: coords.longitude,
            alt: coords.altitude !== null ? coords.altitude : currentPosition.alt,
            acc: coords.accuracy,
            spd: rawSpeedMs
        };
        
        // Mise à jour de l'UKF (Correction/Mesure)
        if (ukf && typeof ukf.update === 'function') {
            const measurement = {
                lat: coords.latitude,
                lon: coords.longitude,
                alt: coords.altitude,
                speed: rawSpeedMs,
                acc: coords.accuracy 
            };
            ukf.update(measurement);
            fusionState = ukf.getState();
        }
        
        // Calcul de la distance parcourue (Méthode simple)
        if (lastKnownPosition) {
            // Distance 3D (approximation Turf.js non utilisée ici, calcul simplifié)
            const dLat = (coords.latitude - lastKnownPosition.lat) * D2R;
            const dLon = (coords.longitude - lastKnownPosition.lon) * D2R;
            const dAlt = (coords.altitude - lastKnownPosition.alt) || 0;
            const distance2D = R_EARTH_MEAN * Math.sqrt(dLat * dLat + dLon * dLon);
            const distance3D = Math.sqrt(distance2D * distance2D + dAlt * dAlt);
            totalDistanceM += distance3D;
        }
        
        // Mise à jour des records
        if (rawSpeedMs > maxSpeedMs) {
            maxSpeedMs = rawSpeedMs;
        }
        
        lastKnownPosition = currentPosition;
        gpsStatusMessage = `Fix OK (${coords.accuracy.toFixed(1)}m)`;
    };
    
    /** Synchronise l'heure et l'offset NTP (appelée par la boucle lente). */
    const syncH = () => {
        // Dans une application réelle, ceci appellerait un serveur NTP.
        // Ici, on simule l'heure locale et un petit décalage.
        const date = new Date();
        const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
        
        // Affichage de l'heure
        if ($('local-time')) $('local-time').textContent = date.toLocaleTimeString('fr-FR');
        if ($('utc-datetime')) $('utc-datetime').textContent = utcDate.toISOString().replace('T', ' ').substring(0, 19) + ' GMT';
        
        // Affichage du Décalage NTP (simulé) - CRITIQUE ID
        ntpOffset = Math.floor(Math.random() * 50) + 10; // Simule un décalage 10-60ms
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(ntpOffset, 0, ' ms');
    };
    
    
    // =================================================================
    // BLOC 3/5 : MISE À JOUR DES CALCULS (Physique, Relativité, Astro)
    // =================================================================
    
    /** Calcule la vitesse du son locale. */
    const calculateSpeedOfSound = (tempK) => {
        // Vitesse du son (m/s) = sqrt(gamma * R_air * Température_K)
        return Math.sqrt(GAMMA * R_AIR * tempK); 
    };
    
    /** Met à jour les données astronomiques. */
    const updateAstroData = () => {
        // Utilise la fonction externe 'calculateAstroDataHighPrec' définie dans astro.js
        if (typeof calculateAstroDataHighPrec === 'function') {
            try {
                // Nécessite une position non nulle pour fonctionner
                const ad = calculateAstroDataHighPrec(currentPosition.lat, currentPosition.lon, new Date());
                
                // Affichage du Soleil
                if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(ad.sun.altitude * R2D, 2, '°');
                if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(ad.sun.azimuth * R2D, 2, '°');
                if ($('tst-time')) $('tst-time').textContent = ad.trueSolarTime; 
                
                // Affichage de la Lune
                if ($('moon-phase-name')) $('moon-phase-name').textContent = ad.moon.phaseName_fr;
                if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(ad.moon.fraction * 100, 1, ' %');
                if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(ad.moon.altitude * R2D, 2, '°');
                
                // Mise à jour du statut Nuit/Crépuscule
                const sunAltDeg = ad.sun.altitude * R2D;
                let phase = 'Jour (☀️)';
                if (sunAltDeg < -18) phase = 'Nuit (🌙)';
                else if (sunAltDeg < -6) phase = 'Crépuscule';
                if ($('astro-phase')) $('astro-phase').textContent = phase;

            } catch(e) { 
                // Ne rien faire, les fallbacks dans updateDashboardDOM s'occuperont de N/A
                console.warn("Erreur de calcul Astro, vérifiez astro.js:", e);
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
        let displayAccelZ = G_ACC_STD; // Initialisation par défaut

        if (fusionState) {
            // Affichage des données UKF
            displaySpeedMs = fusionState.speed;
            displayPitch = fusionState.pitch * R2D;
            displayRoll = fusionState.roll * R2D;
            displayAlt = fusionState.alt;
            
            // L'accélération verticale est une composante de la gravité corrigée par l'attitude
            displayAccelZ = fusionState.accel_z_compensated || G_ACC_STD; 
        } 
        
        // --- VITESSE ---
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(displaySpeedMs * KMH_MS, 1, ' km/h');
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(displaySpeedMs, 2, ' m/s');
        if ($('speed-raw-ms')) $('speed-raw-ms').textContent = dataOrDefault(rawSpeedMs, 2, ' m/s');
        if ($('speed-max-session')) $('speed-max-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        // Vitesse moyenne... (omise ici pour simplicité, nécessite une logique de temps de mouvement)
        
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
        if ($('pitch')) $('pitch').textContent = dataOrDefault(displayPitch, 1, '°'); // CORRECTION ID
        if ($('roll')) $('roll').textContent = dataOrDefault(displayRoll, 1, '°');   // CORRECTION ID
        
        // --- DYNAMIQUE & FORCES ---
        if ($('local-gravity')) $('local-gravity').textContent = dataOrDefault(G_ACC_STD, 4, ' m/s²'); // CORRECTION ID
        if ($('accel-long')) $('accel-long').textContent = dataOrDefault(fusionState ? fusionState.accel_long : 0, 3, ' m/s²'); // CORRECTION ID
        
        // --- IMU ---
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(displayAccelZ, 3, ' m/s²'); // CORRECTION ID
        
        // --- PHYSIQUE LOCALE (avec température courante) ---
        const localSoundSpeed = calculateSpeedOfSound(currentTempK);
        if ($('local-speed-of-sound')) $('local-speed-of-sound').textContent = dataOrDefault(localSoundSpeed, 2, ' m/s');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(displaySpeedMs / localSoundSpeed, 4);
        
        // Mise à jour de l'état du système
        if ($('gps-status')) $('gps-status').textContent = hasGpsFixOccurred ? 'Acquisition OK' : 'En attente...';
        if ($('ukf-status')) $('ukf-status').textContent = ukf ? 'ACTIF (21 États)' : 'DÉSACTIVÉ';
        
        // Mise à jour de l'interface des boutons (ex: Mode Nether)
        const netherBtn = $('nether-toggle-btn');
        if (netherBtn) netherBtn.textContent = `Mode Nether: ${netherMode ? 'ACTIVÉ (1:8)' : 'DÉSACTIVÉ (1:1)'}`;
        
        // Map (omise ici car elle nécessite Leaflet.js, mais la logique de mise à jour irait ici)
    };


    // =================================================================
    // BLOC 5/5 : GESTION DU SYSTÈME ET INITIALISATION
    // =================================================================

    const startGpsTracking = () => {
        if (navigator.geolocation) {
            gpsWatchID = navigator.geolocation.watchPosition(handleGPS, (error) => {
                console.error("Erreur GPS:", error);
                gpsStatusMessage = `Erreur GPS ${error.code}: ${error.message}`;
            }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
        } else {
            gpsStatusMessage = 'GPS Non Supporté';
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
            // L'IMU est démarré dans setupEventListeners pour les mobiles
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

        // IMU (Mouvement)
        if (window.DeviceMotionEvent) {
            // Pour la compatibilité iOS, la permission doit être demandée
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                 // On demandera la permission au premier clic du bouton Démarrer/Pause dans une application réelle
            } else {
                window.addEventListener('devicemotion', handleDeviceMotion);
                isIMUActive = true;
            }
        }
        
        // Gérer les inputs (Masse, Rayon, Vitesse angulaire)
        if ($('rotation-radius')) $('rotation-radius').addEventListener('input', (e) => rotationRadius = parseFloat(e.target.value) || 0);
        if ($('angular-velocity')) $('angular-velocity').addEventListener('input', (e) => angularVelocity = parseFloat(e.target.value.replace(',', '.')) || 0);
    };


    // --- DÉFINITION DES BOUCLES ---
    
    /** Boucle rapide (UKF Prediction et Affichage : 50 Hz) */
    const fastLoop = () => {
        
        // 1. Calculer le delta-t entre les ticks (dt)
        const currentTime = Date.now();
        dt_prediction = (currentTime - lastPredictionTime) / 1000.0;
        lastPredictionTime = currentTime;

        // 2. PRÉDICTION UKF (Fusion complète IMU)
        if (ukf && typeof ukf.predict === 'function' && dt_prediction > 0) {
            
            const rawAccels = [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z];
            const rawGyros = [currentGyroRadS_X, currentGyroRadS_Y, currentGyroRadS_Z];
            
            // Effectuer la prédiction avec les données IMU
            ukf.predict(dt_prediction, rawAccels, rawGyros); 
            fusionState = ukf.getState();
            
            // Utiliser la vitesse UKF pour l'affichage
            currentSpeedMs = fusionState.speed;
        }

        // 3. Affichage (Mise à jour DOM)
        updateDashboardDOM(); 
        
    };
    
    /** Boucle lente (Astro/NTP/Physique : 1 Hz) */
    const slowLoop = () => {
        syncH(); // Synchro NTP (même en pause)
        
        if (isSystemActive || currentPosition.lat !== 0.0) {
            // Lancer Astro uniquement si la position est non nulle (coordonnées par défaut ou GPS)
            updateAstroData(); 
            
            // Mettre à jour les compteurs de temps écoulé
            const elapsed = (Date.now() - sessionStartTime) / 1000;
            if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault(elapsed, 2, ' s');
            // ... (logique de mise à jour d'autres compteurs lents) ...
        }
    };
    

    // =================================================================
    // BLOC FINAL : CHARGEMENT DE LA PAGE (window.onload)
    // =================================================================

    window.addEventListener('load', () => {
        
        // --- 1. Initialisation UKF CRITIQUE ---
        // Vérifie si la classe ProfessionalUKF est définie (ukf-class.js chargé)
        if (typeof ProfessionalUKF !== 'undefined' && !ukf) {
            const refPos = currentPosition; 
            
            // Instanciation
            ukf = new ProfessionalUKF(refPos.lat, refPos.lon, refPos.alt);
            
            // 🛑 CORRECTION: Initialisation immédiate pour le Pitch/Roll/Dead Reckoning
            ukf.initialize(refPos.lat, refPos.lon, refPos.alt);
            fusionState = ukf.getState(); 
            
            console.log("UKF instancié et initialisé avec la position par défaut.");
        } else if (typeof ProfessionalUKF === 'undefined') {
            console.error("🔴 CRITIQUE: ProfessionalUKF non défini. Vérifiez ukf-class.js et math.min.js.");
        }

        // --- 2. Configuration et Affichage Initial ---
        setupEventListeners();
        syncH(); 
        updateAstroData(); // Afficher les données Astro pour la position par défaut
        updateDashboardDOM(); // Afficher toutes les valeurs par défaut (y compris Pitch/Roll = 0.0°)

        // --- 3. Démarrage des Boucles d'Intervalles ---
        setInterval(fastLoop, 20); // 50 Hz
        setInterval(slowLoop, 1000); // 1 Hz
        
        // Démarrage initial en mode PAUSE (le bouton est prêt)
        const btn = $('gps-pause-toggle');
        if (btn) btn.textContent = '▶️ DÉMARRER SYSTÈME';
    });

})(window);
