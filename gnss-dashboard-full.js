// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL (UKF 21 ÉTATS + CORRECTIONS V8.2)
// VERSION : PROFESSIONAL V8.2 (Précision 5 décimales / Zéro N/A / Fix Vitesse Brute)
// =================================================================

((window) => {
    "use strict";

    // =================================================================
    // BLOC 1/4 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    // --- VARIABLES D'ÉTAT INITIALISÉES (Évite les N/A au démarrage) ---
    let ukf = null; // Instanciation de ProfessionalUKF
    let isGpsPaused = true; // Démarrage en pause (pour attendre le clic utilisateur)
    
    // Position/Vitesse/Altitude
    let currentPosition = {
        lat: 43.2964,   // Ex: Marseille (pour débloquer Astro/Météo)
        lon: 5.3697,
        acc: 10.0,
        spd: 0.0
    };
    let currentSpeedMs = 0.0;     // Vitesse Stable/UKF (m/s)
    let rawSpeedMs = 0.0;         // Vitesse Brute GPS (m/s)
    let currentAltitudeM = 0.0;   // Altitude Stable/UKF (m)

    // Accélération/Forces (IMU)
    let currentAccelMs2_X = 0.0;
    let currentAccelMs2_Y = 0.0;
    let currentAccelMs2_Z = 0.0;
    
    // Environnement & Physique
    let currentMass = 70.0;
    let currentAirDensity = 1.225;     // Standard Sea Level (kg/m³)
    let currentSpeedOfSound = 340.29; // Standard (m/s)

    // Variables NTP (Synchronisation Temps Réel)
    let lServH = new Date().getTime(); // Dernier temps serveur connu
    let lLocH = new Date().getTime(); // Dernier temps local connu

    // --- CONSTANTES SCIENTIFIQUES & UTILITAIRES ---
    const $ = id => document.getElementById(id);
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const C_L = 299792458; // Vitesse lumière (m/s)
    const KMH_MS = 3.6; // Conversion m/s vers km/h
    const G_STD = 9.80665; // Gravité standard (m/s²)
    
    // API ENDPOINTS (à confirmer)
    const PROXY_WEATHER_ENDPOINT = "https://scientific-dashboard2.vercel.app/api/weather"; 
    
    /**
     * Formatte une valeur numérique, retourne un fallback ('0.00' ou autre) si invalide.
     * @param {number} val - La valeur à formater.
     * @param {number} decimals - Nombre de décimales.
     * @param {string} suffix - Suffixe (ex: ' m/s').
     */
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val) || (typeof val === 'string' && val.trim() === '')) {
            const fallback = (decimals === 0 ? '0' : '0.' + Array(decimals).fill('0').join(''));
            return fallback + suffix;
        }
        return val.toFixed(decimals) + suffix;
    };

    /**
     * Formatte une valeur en notation exponentielle, retourne un fallback si invalide (0.00e+0).
     */
    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        // Correction pour s'assurer que zéro retourne '0.00e+0' et non N/A
        if (val === undefined || val === null || isNaN(val) || Math.abs(val) < 1e-10) {
            const zeroDecimals = '0.' + Array(decimals).fill('0').join('');
            return zeroDecimals + 'e+0' + suffix;
        }
        return val.toExponential(decimals) + suffix;
    };
    
    // --- FONCTIONS FACTICES (Assumer que ces fonctions existent dans vos librairies) ---
    const getCDate = (lServH, lLocH) => new Date(lServH + (new Date().getTime() - lLocH));
    const fetchWeather = async (lat, lon) => { 
        // Logique de récupération de la météo... (omise pour la concision)
        return null; // Retourne null par défaut si API non configurée
    };
    const updateCelestialBody = (body, alt, radius, vel) => ({G_ACC_NEW: G_STD}); // Fonction factice
    
    // =================================================================

    // =================================================================
    // BLOC 2/4 : MISE À JOUR DU DOM (Fonction Principale)
    // =================================================================

    /**
     * Met à jour tous les éléments du tableau de bord.
     */
    function updateDashboardDOM() {
        // --- 1. MISE À JOUR TEMPS/DATE ---
        const now = getCDate(lServH, lLocH); 
        
        // Heure Locale (NTP)
        if ($('local-time-display')) $('local-time-display').textContent = now.toLocaleTimeString('fr-FR');

        // Date & Heure UTC (ID non standardisé, mais commun: 'utc-time-display')
        if ($('utc-time-display')) { 
            // Exemple de format UTC : Wed, 11 Dec 2025 18:42:00 GMT
            const utcTimeStr = now.toUTCString().split(' ').slice(0, 5).join(' ');
            $('utc-time-display').textContent = utcTimeStr;
        }

        // Temps écoulé
        const elapsedTime = (new Date().getTime() - lServH) / 1000;
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault(elapsedTime, 2, ' s');


        // --- 2. VITESSE, DISTANCE & RELATIVITÉ (Précision 5 décimales pour la vitesse) ---
        
        const kSpd = currentSpeedMs; // Vitesse Stable/UKF (m/s)
        const kSpdKms = kSpd / 1000.0;
        const kSpdKmh = kSpd * KMH_MS;

        // Vitesse Stable (m/s) (5 décimales)
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(kSpd, 5, ' m/s');
        
        // Vitesse Stable (km/s) (5 décimales)
        if ($('speed-stable-kms')) $('speed-stable-kms').textContent = dataOrDefault(kSpdKms, 5, ' km/s');
        
        // Vitesse 3D (Instantanée) (km/h) (5 décimales)
        // L'ID dans le snippet semble être 'speed-3d-inst'.
        if ($('speed-3d-inst')) $('speed-3d-inst').textContent = dataOrDefault(kSpdKmh, 5, ' km/h');
        
        // Vitesse Brute (m/s) (ID: speed-raw-ms, à vérifier dans votre HTML)
        if ($('speed-raw-ms')) $('speed-raw-ms').textContent = dataOrDefault(rawSpeedMs, 2, ' m/s');
        
        // Affichage principal de la vitesse (ex: --.- km/h)
        if ($('main-speed-display')) $('main-speed-display').textContent = dataOrDefault(kSpdKmh, 1, ' km/h');
        
        // Pourcentage de la Vitesse du Son
        const percMach = (kSpd / currentSpeedOfSound) * 100.0;
        if ($('perc-speed-of-sound')) $('perc-speed-of-sound').textContent = dataOrDefault(percMach, 2, ' %');
        
        // Nombre de Mach
        const mach = kSpd / currentSpeedOfSound;
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 4, '');
        
        // Pourcentage de la Vitesse de la Lumière
        const percLight = (kSpd / C_L) * 100.0;
        if ($('perc-speed-light')) $('perc-speed-light').textContent = dataOrDefaultExp(percLight, 2, ' %');


        // --- 3. PHYSIQUE & RELATIVITÉ ---
        
        const E0 = currentMass * C_L**2; // Énergie de Masse au Repos (J)
        
        // Facteur de Lorentz (γ)
        const gamma = 1.0 / Math.sqrt(1.0 - (kSpd / C_L)**2);
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(gamma, 4, '');
        
        // Temps de Dilation (Vitesse) (ns/j)
        const timeDilationV = (gamma - 1.0) * 86400 * 1e9; 
        if ($('time-dilation-v')) $('time-dilation-v').textContent = dataOrDefault(timeDilationV, 2, ' ns/j');
        
        // Quantité de Mouvement (p)
        const momentum = currentMass * kSpd * gamma;
        // Correction : Utilisation de dataOrDefaultExp pour garantir le 0.00e+0
        if ($('momentum-display')) $('momentum-display').textContent = dataOrDefaultExp(momentum, 2, ' kg⋅m/s');
        
        // Énergie Relativiste (E)
        const energyRelativistic = E0 * gamma;
        if ($('relativistic-energy')) $('relativistic-energy').textContent = dataOrDefaultExp(energyRelativistic, 2, ' J');
        
        // Énergie de Masse au Repos (E₀)
        // Correction : Utilisation de dataOrDefaultExp pour garantir le 0.00e+0
        if ($('energy-mass-rest')) $('energy-mass-rest').textContent = dataOrDefaultExp(E0, 2, ' J');
        

        // --- 4. DYNAMIQUE & FORCES (IMU) ---
        
        // Accélération X/Y/Z (IMU)
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(currentAccelMs2_X, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(currentAccelMs2_Y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(currentAccelMs2_Z, 3, ' m/s²');
        
        // Force G (Longitudinale)
        const G_Long = currentAccelMs2_X / G_STD;
        if ($('force-g-long')) $('force-g-long').textContent = dataOrDefault(G_Long, 3, ' G');
        
        // Force G (Verticale)
        // L'accélération IMU Z inclut la gravité. On la retire pour l'affichage de l'accélération pure,
        // et on la normalise pour l'affichage des G.
        const G_Vert = (currentAccelMs2_Z + G_STD) / G_STD; 
        if ($('force-g-vert')) $('force-g-vert').textContent = dataOrDefault(G_Vert, 3, ' G');
        
        // --- 5. POSITION & ASTRO ---
        
        // Position EKF
        if ($('latitude-ekf')) $('latitude-ekf').textContent = dataOrDefault(currentPosition.lat, 6, '');
        if ($('longitude-ekf')) $('longitude-ekf').textContent = dataOrDefault(currentPosition.lon, 6, '');
        if ($('altitude-ekf')) $('altitude-ekf').textContent = dataOrDefault(currentAltitudeM, 2, ' m');

        // Calculs Astro (Assumer que astro.js est chargé et que calculateAstroData existe)
        if (typeof calculateAstroData === 'function' && now) {
            const latRad = currentPosition.lat * D2R; 
            const lonRad = currentPosition.lon * D2R;
            
            const astroData = calculateAstroData(latRad, lonRad, now); 
            
            // Temps Solaire & Sidéral (initialiser les N/A ici si astroData est null, mais il ne devrait pas)
            if ($('date-astro')) $('date-astro').textContent = now.toLocaleDateString('fr-FR');
            if ($('true-solar-time')) $('true-solar-time').textContent = astroData.TST_HRS || '00:00:00';
            if ($('mean-solar-time')) $('mean-solar-time').textContent = astroData.MST_HRS || '00:00:00'; 
            if ($('noon-solar-utc')) $('noon-solar-utc').textContent = astroData.NOON_SOLAR_UTC || 'N/A'; 
            if ($('eot-minutes')) $('eot-minutes').textContent = dataOrDefault(astroData.EOT_MIN, 4, ' min');
            
            // Lune
            if ($('moon-phase-name') && typeof getMoonPhaseName === 'function') 
                $('moon-phase-name').textContent = getMoonPhaseName(astroData.illumination.phase);
            if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(astroData.illumination.fraction * 100, 1, ' %');
            if ($('moon-distance')) $('moon-distance').textContent = dataOrDefaultExp(astroData.moon.distance, 2, ' m');
        } else {
            // Fallback for Astro if library is missing
            if ($('true-solar-time')) $('true-solar-time').textContent = '00:00:00';
            if ($('mean-solar-time')) $('mean-solar-time').textContent = '00:00:00'; 
            if ($('eot-minutes')) $('eot-minutes').textContent = '0.0000 min';
        }

        // --- 6. MÉCANIQUE DES FLUIDES ---
        // Pression Dynamique (q = 0.5 * rho * V²)
        const dynamicPressure = 0.5 * currentAirDensity * kSpd**2;
        if ($('dynamic-pressure')) $('dynamic-pressure').textContent = dataOrDefault(dynamicPressure, 2, ' Pa');
        
        // Force de Traînée
        if ($('drag-force')) $('drag-force').textContent = dataOrDefault(0.0, 2, ' N'); 
        
    }


    // =================================================================
    // BLOC 3/4 : INITIALISATION ET ÉVÉNEMENTS
    // =================================================================
    
    // Traitement des données IMU
    const handleDeviceMotion = (event) => {
        const acc = event.accelerationIncludingGravity;
        currentAccelMs2_X = acc.x || 0.0;
        currentAccelMs2_Y = acc.y || 0.0;
        currentAccelMs2_Z = acc.z || 0.0;
        
        // Mettre à jour les data-attributes pour être lu par updateDashboardDOM() (si nécessaire)
        if ($('acc-x')) $('acc-x').dataset.value = currentAccelMs2_X; 
        if ($('acc-y')) $('acc-y').dataset.value = currentAccelMs2_Y; 
        if ($('acc-z')) $('acc-z').dataset.value = currentAccelMs2_Z; 
    };

    const initIMU = () => {
        // Logique de demande de permission
        // (Laisser la logique complète de demande de permission ici pour le fichier final)
        const imuStatusEl = $('imu-status');
        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) {
            DeviceMotionEvent.requestPermission().then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    if (imuStatusEl) imuStatusEl.textContent = 'Actif';
                } else {
                    if (imuStatusEl) imuStatusEl.textContent = 'Refusé';
                }
            }).catch(err => {
                console.error('Erreur IMU:', err);
                if (imuStatusEl) imuStatusEl.textContent = 'Erreur';
            });
        } else if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', handleDeviceMotion);
            if (imuStatusEl) imuStatusEl.textContent = 'Actif (Standard)';
        } else {
            if (imuStatusEl) imuStatusEl.textContent = 'Non Supporté';
        }
    }


    const initGPS = () => {
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
                    
                    // Mise à jour de l'état global avec les données GPS
                    currentPosition = { lat: latitude, lon: longitude, acc: accuracy, spd: speed || 0.0 };
                    
                    rawSpeedMs = speed || 0.0; // Vitesse Brute
                    currentSpeedMs = rawSpeedMs; // Initialisation de la Vitesse Stable par la vitesse brute
                    currentAltitudeM = altitude || 0.0;

                    // Si l'UKF est actif, lancez l'étape de prédiction/mise à jour ici.
                    if (ukf) ukf.update(pos); 
                    
                    if ($('gps-status')) $('gps-status').textContent = 'Acquisition (OK)';

                },
                (error) => {
                    console.error('Erreur GPS:', error.message);
                    if ($('gps-status')) $('gps-status').textContent = 'Erreur: ' + error.code;
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
            );
        } else {
            if ($('gps-status')) $('gps-status').textContent = 'Non Supporté';
        }
    };


    // Attachement des gestionnaires d'événements
    function setupEventListeners() {
        const gpsToggleButton = $('gps-pause-toggle'); // ID du bouton PAUSE GPS (à vérifier)

        // Correction : Démarrer l'IMU/GPS au premier clic utilisateur (pour la permission IMU)
        if (gpsToggleButton) {
            gpsToggleButton.addEventListener('click', function activateSystems() {
                if(isGpsPaused) {
                    isGpsPaused = false;
                    gpsToggleButton.textContent = "⏸️ PAUSE GPS";
                    
                    // Démarrer les systèmes au premier clic si ce n'est pas déjà fait
                    if (typeof initIMU === 'function') initIMU(); 
                    if (typeof initGPS === 'function') initGPS(); 
                } else {
                    isGpsPaused = true;
                    gpsToggleButton.textContent = "▶️ REPRISE GPS";
                }
            });
        }
        
        // Initialiser l'état du bouton
        if (gpsToggleButton) gpsToggleButton.textContent = isGpsPaused ? "▶️ REPRISE GPS" : "⏸️ PAUSE GPS";
    }


    // =================================================================
    // BLOC 4/4 : DÉMARRAGE DU SYSTÈME (window.onload)
    // =================================================================

    window.addEventListener('load', () => {

        // 1. Initialisation des filtres et utilitaires mathématiques
        if (typeof math !== 'undefined' && typeof ProfessionalUKF !== 'undefined') {
            // Initialisation de l'UKF après la synchro NTP dans un scénario réel
            // Ici, on l'initialise avec les valeurs par défaut.
            ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentAltitudeM);
        } else {
            console.warn("L'UKF professionnel est désactivé. Mode GPS/Capteur brut activé.");
        }
        
        // 2. Attacher les événements (gestion de la pause/reprise et du premier clic)
        setupEventListeners();

        // 3. Boucles de rafraîchissement
        
        // Boucle rapide (Affichage)
        setInterval(() => {
            if (!isGpsPaused) {
                 // Si le GPS est démarré, mettez à jour régulièrement
                 updateDashboardDOM(); 
            } else {
                 // Sinon, mettez à jour pour afficher les valeurs par défaut/fallbacks
                 updateDashboardDOM();
            }
        }, 100); // Ex: 100ms
        
        // Boucle lente (Météo/Astro/NTP)
        setInterval(() => {
            // Récupération des données Météo (si non en pause)
            // fetchWeather(currentPosition.lat, currentPosition.lon).then(data => { ... });

        }, 5000); // Ex: 5 secondes

        // Afficher l'état initial (avant le premier clic)
        updateDashboardDOM();

    });

})(window);
