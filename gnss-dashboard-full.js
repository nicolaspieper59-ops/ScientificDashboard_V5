// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL (UKF 21 ÉTATS + CORRECTIONS V8)
// VERSION : PROFESSIONAL V8.1 (Précision 5 décimales / Zéro N/A)
// =================================================================

((window) => {
    "use strict";

    // =================================================================
    // BLOC 1/4 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    // --- VARIABLES D'ÉTAT ---
    let ukf = null; // Instanciation de ProfessionalUKF
    let isGpsPaused = false;
    let currentPosition = {
        // Coordonnées initiales pour débloquer Astro/Météo au démarrage
        lat: 43.2964,
        lon: 5.3697,
        acc: 10.0,
        spd: 0.0
    };
    let currentSpeedMs = 0.0;
    let currentAltitudeM = 0.0;
    let currentAccelMs2 = 0.0;
    let currentMass = 70.0;
    let currentAirDensity = 1.225; // Standard Sea Level (kg/m³)
    let currentSpeedOfSound = 340.29; // Standard (m/s)

    // Variables NTP (Synchronisation Temps Réel)
    let lServH = new Date().getTime(); // Dernier temps serveur connu
    let lLocH = new Date().getTime(); // Dernier temps local connu

    // --- CONSTANTES SCIENTIFIQUES & UTILITAIRES ---
    const $ = id => document.getElementById(id);
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const C_L = 299792458; // Vitesse lumière (m/s)
    const KMH_MS = 3.6; // Conversion m/s vers km/h
    
    // API ENDPOINTS (à confirmer)
    const PROXY_WEATHER_ENDPOINT = "https://scientific-dashboard2.vercel.app/api/weather"; 
    const SERVER_TIME_ENDPOINT = "https://worldtimeapi.org/api/utc";

    /**
     * Formatte une valeur numérique, retourne un fallback ('0.00') si invalide.
     * @param {number} val - La valeur à formater.
     * @param {number} decimals - Nombre de décimales.
     * @param {string} suffix - Suffixe (ex: ' m/s').
     */
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
            const fallback = (decimals === 0 ? '0' : '0.' + Array(decimals).fill('0').join(''));
            return fallback + suffix;
        }
        return val.toFixed(decimals) + suffix;
    };

    /**
     * Formatte une valeur en notation exponentielle, retourne un fallback si invalide.
     */
    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val) || Math.abs(val) < 1e-10) {
            const zeroDecimals = '0.' + Array(decimals).fill('0').join('');
            return zeroDecimals + 'e+0' + suffix;
        }
        return val.toExponential(decimals) + suffix;
    };
    
    // --- FONCTIONS FACTICES (Assumer que ces fonctions existent dans vos librairies) ---
    // (A remplacer par vos implémentations réelles si elles ne sont pas dans ukf-lib.js)
    const getCDate = (lServH, lLocH) => new Date(lServH + (new Date().getTime() - lLocH));
    const fetchWeather = async (lat, lon) => { 
        // Logique de récupération de la météo via le proxy Vercel
        try {
            const response = await fetch(`${PROXY_WEATHER_ENDPOINT}?lat=${lat}&lon=${lon}`);
            const data = await response.json();
            if (data.error) { throw new Error(data.error); }
            // Extraction des données OpenWeatherMap et conversion en format interne (exemple)
            return {
                tempC: data.main.temp, 
                pressure_hPa: data.main.pressure, 
                humidity_perc: data.main.humidity,
                // ... autres données requises pour le filtre
            }; 
        } catch (e) {
            console.warn("Météo hors ligne ou erreur API. Utilisation des valeurs par défaut.");
            return null;
        }
    };
    // =================================================================

    // =================================================================
    // BLOC 2/4 : MISE À JOUR DU DOM (Fonction Principale)
    // =================================================================

    /**
     * Met à jour tous les éléments du tableau de bord.
     */
    function updateDashboardDOM() {
        // --- 1. MISE À JOUR TEMPS/DATE (Critique pour Astro) ---
        const now = getCDate(lServH, lLocH); 
        
        // Heure Locale (NTP) (Déjà dans le tableau de bord initial)
        if ($('local-time-display')) $('local-time-display').textContent = now.toLocaleTimeString('fr-FR');

        // Heure UTC (Critique : L'ID est N/A dans l'exemple initial, à confirmer)
        if ($('utc-time-display')) { 
            const utcTimeStr = now.toUTCString().split(' ').slice(0, 5).join(' ');
            $('utc-time-display').textContent = utcTimeStr;
        }

        // Temps écoulé
        const elapsedTime = (now.getTime() - lServH) / 1000;
        if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault(elapsedTime, 2, ' s');


        // --- 2. VITESSE, DISTANCE & RELATIVITÉ (Précision 5 décimales pour la vitesse) ---
        
        // Assurez-vous que currentSpeedMs est mis à jour par l'UKF ou le GPS
        const kSpd = currentSpeedMs; // Vitesse en m/s (du GPS ou UKF)
        const kSpdKms = kSpd / 1000.0;
        const kSpdKmh = kSpd * KMH_MS;

        // Vitesse Stable (m/s) (5 décimales)
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(kSpd, 5, ' m/s');
        
        // Vitesse Stable (km/s) (5 décimales)
        if ($('speed-stable-kms')) $('speed-stable-kms').textContent = dataOrDefault(kSpdKms, 5, ' km/s');
        
        // Vitesse 3D (Instantanée) (km/h) (5 décimales)
        if ($('speed-3d-inst')) $('speed-3d-inst').textContent = dataOrDefault(kSpdKmh, 5, ' km/h');
        
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
        const timeDilationV = (gamma - 1.0) * 86400 * 1e9; // 86400s/jour * 1e9 ns/s
        if ($('time-dilation-v')) $('time-dilation-v').textContent = dataOrDefault(timeDilationV, 2, ' ns/j');
        
        // Quantité de Mouvement (p)
        const momentum = currentMass * kSpd * gamma;
        if ($('momentum-display')) $('momentum-display').textContent = dataOrDefaultExp(momentum, 2, ' kg⋅m/s');
        
        // Énergie Relativiste (E)
        const energyRelativistic = E0 * gamma;
        if ($('relativistic-energy')) $('relativistic-energy').textContent = dataOrDefaultExp(energyRelativistic, 2, ' J');
        
        // Énergie de Masse au Repos (E₀)
        if ($('energy-mass-rest')) $('energy-mass-rest').textContent = dataOrDefaultExp(E0, 2, ' J');
        

        // --- 4. DYNAMIQUE & FORCES (Utilisation des données IMU ou Fallback) ---
        // Assurez-vous que les IDs HTML existent : acc-x, acc-y, acc-z, roll, pitch, etc.
        const accX = parseFloat($('acc-x')?.dataset.value) || 0.0; // Exemple: Récupération de la valeur IMU stockée dans un data-attribute
        const accY = parseFloat($('acc-y')?.dataset.value) || 0.0;
        const accZ = parseFloat($('acc-z')?.dataset.value) || 0.0;
        
        // Accélération X/Y/Z (IMU)
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(accX, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(accY, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(accZ, 3, ' m/s²');
        
        // Force G (Longitudinale)
        const G_Long = accX / 9.80665;
        if ($('force-g-long')) $('force-g-long').textContent = dataOrDefault(G_Long, 3, ' G');
        
        // Force G (Verticale)
        const G_Vert = (accZ + 9.80665) / 9.80665; // Accélération verticale + Gravité
        if ($('force-g-vert')) $('force-g-vert').textContent = dataOrDefault(G_Vert, 3, ' G');

        
        // --- 5. POSITION & ASTRO ---
        
        // Position EKF (Initialisée à 43.2964, 5.3697)
        if ($('latitude-ekf')) $('latitude-ekf').textContent = dataOrDefault(currentPosition.lat, 6, '');
        if ($('longitude-ekf')) $('longitude-ekf').textContent = dataOrDefault(currentPosition.lon, 6, '');
        if ($('altitude-ekf')) $('altitude-ekf').textContent = dataOrDefault(currentAltitudeM, 2, ' m');

        // Calculs Astro
        if (typeof calculateAstroData === 'function' && now) {
            const latRad = currentPosition.lat * D2R; 
            const lonRad = currentPosition.lon * D2R;
            
            // Assurez-vous que calculateAstroData est la fonction de votre astro.js
            const astroData = calculateAstroData(latRad, lonRad, now); 
            
            // Temps Solaire & Sidéral
            if ($('date-astro')) $('date-astro').textContent = now.toLocaleDateString('fr-FR');
            if ($('true-solar-time')) $('true-solar-time').textContent = astroData.TST_HRS; // formatHours est dans astro.js
            if ($('mean-solar-time')) $('mean-solar-time').textContent = astroData.MST_HRS; 
            if ($('noon-solar-utc')) $('noon-solar-utc').textContent = astroData.NOON_SOLAR_UTC; 
            if ($('eot-minutes')) $('eot-minutes').textContent = dataOrDefault(astroData.EOT_MIN, 4, ' min');
            
            // Soleil
            if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(astroData.sun.altitude * R2D, 2, '°');
            if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(astroData.sun.azimuth * R2D, 2, '°');
            // ... Mettez à jour les Lever/Coucher/Durée du Jour ici (IDs: day-duration, sunrise-times, sunset-times)
            
            // Lune
            if ($('moon-phase-name') && typeof getMoonPhaseName === 'function') 
                $('moon-phase-name').textContent = getMoonPhaseName(astroData.illumination.phase);
            if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(astroData.illumination.fraction * 100, 1, ' %');
            if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(astroData.moon.altitude * R2D, 2, '°');
            if ($('moon-distance')) $('moon-distance').textContent = dataOrDefaultExp(astroData.moon.distance, 2, ' m');
        }

        // --- 6. MÉCANIQUE DES FLUIDES (Dépend de la vitesse et de la densité de l'air) ---
        // Pression Dynamique (q = 0.5 * rho * V²)
        const dynamicPressure = 0.5 * currentAirDensity * kSpd**2;
        if ($('dynamic-pressure')) $('dynamic-pressure').textContent = dataOrDefault(dynamicPressure, 2, ' Pa');
        
        // Force de Traînée (Nécessite Cd et A, ici forcé à 0 si non en mouvement)
        if ($('drag-force')) $('drag-force').textContent = dataOrDefault(0.0, 2, ' N'); 
        
    }


    // =================================================================
    // BLOC 3/4 : INITIALISATION ET ÉVÉNEMENTS
    // =================================================================
    
    // Fonction d'initialisation du GPS (à implémenter ou à récupérer de votre fichier)
    const initGPS = () => {
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
                    
                    // Mise à jour de l'état global avec les données GPS
                    currentPosition = { lat: latitude, lon: longitude, acc: accuracy, spd: speed || 0.0 };
                    currentSpeedMs = speed || 0.0;
                    currentAltitudeM = altitude || 0.0;

                    // Si l'UKF est actif, lancez l'étape de prédiction/mise à jour ici.
                    if (ukf) ukf.update(pos); 
                    
                    // Affichage de l'état GPS
                    if ($('gps-status')) $('gps-status').textContent = 'Acquisition (OK)';

                },
                (error) => {
                    console.error('Erreur GPS:', error.message);
                    if ($('gps-status')) $('gps-status').textContent = 'Erreur: ' + error.code;
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 } // High-Freq
            );
        } else {
            console.error("Géolocalisation non supportée.");
            if ($('gps-status')) $('gps-status').textContent = 'Non Supporté';
        }
    };

    // Fonction d'initialisation IMU avec demande de permission (Cruciale pour mobiles)
    const initIMU = () => {
        const imuStatusEl = $('imu-status');
        const handleDeviceMotion = (event) => {
            // Mettre à jour les data-attributes pour être lu par updateDashboardDOM()
            const acc = event.accelerationIncludingGravity;
            if ($('acc-x')) $('acc-x').dataset.value = acc.x; 
            if ($('acc-y')) $('acc-y').dataset.value = acc.y; 
            if ($('acc-z')) $('acc-z').dataset.value = acc.z; 
        };

        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) {
            DeviceMotionEvent.requestPermission().then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    if (imuStatusEl) imuStatusEl.textContent = 'Actif (Grant)';
                } else {
                    if (imuStatusEl) imuStatusEl.textContent = 'Refusé (Bloqué)';
                }
            }).catch(err => {
                console.error('Erreur IMU:', err);
                if (imuStatusEl) imuStatusEl.textContent = 'Erreur';
            });
        } else if (window.DeviceMotionEvent) {
            // Navigateurs de bureau / Anciens systèmes
            window.addEventListener('devicemotion', handleDeviceMotion);
            if (imuStatusEl) imuStatusEl.textContent = 'Actif (Standard)';
        } else {
            if (imuStatusEl) imuStatusEl.textContent = 'Non Supporté';
        }
    }


    // Attachement des gestionnaires d'événements
    function setupEventListeners() {
        const gpsToggleButton = $('gps-pause-toggle'); // ID du bouton PAUSE GPS (à vérifier)

        // 🚨 CORRECTION CRITIQUE IMU/GPS : Démarrer l'IMU au premier clic utilisateur
        if (gpsToggleButton) {
            gpsToggleButton.addEventListener('click', function activateSystems() {
                if (typeof initIMU === 'function') {
                    initIMU(); // Démarrage de l'IMU
                }
                if (typeof initGPS === 'function') {
                    initGPS(); // Démarrage du GPS
                }
                
                // Le reste de votre logique de pause/reprise doit aller ici
                isGpsPaused = !isGpsPaused;
                gpsToggleButton.textContent = isGpsPaused ? "▶️ REPRISE GPS" : "⏸️ PAUSE GPS";

                // Retirer l'écouteur pour éviter de redemander la permission IMU
                gpsToggleButton.removeEventListener('click', activateSystems);
                
            }, { once: true }); 
        }

        // ... Vos autres écouteurs (réinitialisation, mode nuit, etc.) ici ...
    }


    // =================================================================
    // BLOC 4/4 : DÉMARRAGE DU SYSTÈME (window.onload)
    // =================================================================

    window.addEventListener('load', () => {

        // 1. Initialisation des filtres et utilitaires mathématiques
        if (typeof math !== 'undefined' && typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentAltitudeM);
        } else {
            console.warn("L'UKF professionnel est désactivé. Vérifiez le chargement de math.js et ukf-lib.js.");
        }
        
        // 2. Attacher les événements (ceci attendra le premier clic pour démarrer GPS/IMU)
        setupEventListeners();

        // 3. Boucles de rafraîchissement
        
        // Boucle rapide (Fréquence GPS / IMU)
        setInterval(() => {
            if (!isGpsPaused) {
                // Mise à jour rapide des valeurs (vitesse, accélération, etc.)
                // (Normalement, l'UKF ou le GPS appelle updateDashboardDOM)
                // Ici, nous l'appelons explicitement pour forcer l'affichage 0.00000 
                updateDashboardDOM(); 
            }
        }, 100); // Ex: 100ms
        
        // Boucle lente (Météo/Astro/NTP)
        setInterval(() => {
            // Synchronisation de l'heure NTP (à implémenter)
            // Exemple: syncH(); 

            // Récupération des données Météo (si non en pause)
            fetchWeather(currentPosition.lat, currentPosition.lon).then(data => {
                if (data) {
                    // Mettre à jour currentAirDensity et currentSpeedOfSound
                    // Et mettre à jour les champs Météo dans le DOM
                }
            });

            // Forcer une mise à jour du DOM pour les données lentes
            updateDashboardDOM();

        }, 5000); // Ex: 5 secondes

        // Afficher l'état initial (avant le premier clic)
        updateDashboardDOM();

    });

})(window);
