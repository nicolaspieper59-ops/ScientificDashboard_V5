// =================================================================
// BLOC 1/4 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
// Version Professionnelle V8.2
// =================================================================

((window) => {
    "use strict";

    // --- CLÉS D'API & ENDPOINTS (Ajustez si nécessaire) ---
    const PROXY_BASE_URL = "https://scientific-dashboard2.vercel.app";
    const PROXY_WEATHER_ENDPOINT = `${PROXY_BASE_URL}/api/weather`;
    const SERVER_TIME_ENDPOINT = "https://worldtimeapi.org/api/utc";

    // --- CONSTANTES PHYSIQUES ET MATHÉMATIQUES FONDAMENTALES (SI) ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI; 
    const KMH_MS = 3.6;         
    const C_L = 299792458;      // Vitesse de la lumière (m/s)
    const G_STD = 9.80665;      // Gravité standard (m/s²)
    const R_AIR = 287.058;      // Constante gaz parfait air (J/kg·K)
    const R_E_BASE = 6371000.0; // Rayon terrestre moyen (m)
    const TEMP_SEA_LEVEL_K = 288.15; // 15°C standard (K)
    const BARO_ALT_REF_HPA = 1013.25; // Pression niveau mer standard (hPa)
    const RHO_SEA_LEVEL = 1.225; // Densité air niveau mer (kg/m³)
    const DOM_SLOW_UPDATE_MS = 5000; // Intervalle de rafraîchissement lent (Météo/Astro)

    // --- ÉTAT GLOBAL ET VARIABLES DE CONTRÔLE ---
    let ukf = null; // Instance de ProfessionalUKF
    let isGpsPaused = true; // Démarre en pause pour attendre le clic utilisateur
    let map = null, marker = null;
    let currentUKFReactivity = 'MEDIUM'; // 'LOW', 'MEDIUM', 'HIGH'
    let netherMode = false; // Mode Nether (1:8)

    // Position/Vitesse/Altitude (Stable/UKF)
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
    let currentAccelMs2_X = 0.0; // Gravité retirée si possible
    let currentAccelMs2_Y = 0.0;
    let currentAccelMs2_Z = 0.0;
    let lastUKFUpdateT = Date.now(); // Temps de la dernière mise à jour UKF

    // Variables pour la météo et l'environnement
    let lastT_K = TEMP_SEA_LEVEL_K; // Température en Kelvin (pour la physique)
    let lastP_hPa = BARO_ALT_REF_HPA; // Pression en hPa
    let currentAirDensity = RHO_SEA_LEVEL;
    let currentSpeedOfSound = 343.2; // ~15°C
    let lastKnownWeather = null;
    let currentMass = 70.0; // Masse de référence (kg)
    let currentCelestialBody = 'EARTH'; // Terre par défaut
    let currentG_Acc = G_STD; // Gravité actuelle
    let currentR_Alt_Center = R_E_BASE; // Rayon au centre

    // Synchronisation NTP
    let lServH = 0; // Heure serveur (UTC) au moment de la synchro
    let lLocH = 0;  // Heure locale au moment de la synchro

    // Début de l'IIFE (Immediately Invoked Function Expression)
    // Le reste du code JS sera dans cette enveloppe.
// ... (Fin du Bloc 1)
 // =================================================================
// BLOC 2/4 : FONCTIONS UTILITAIRES ET MODÈLES PHYSIQUES
// =================================================================

    // --- FONCTIONS UTILITAIRES GLOBALES ---
    const $ = id => document.getElementById(id);

    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
            return (decimals === 0 ? '0' : '0.00') + suffix;
        }
        return val.toFixed(decimals) + suffix;
    };
    
    // Pour l'affichage des très petits ou grands nombres
    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
            const zeroDecimals = '0.' + Array(decimals).fill('0').join('');
            return zeroDecimals + 'e+0' + suffix;
        }
        return val.toExponential(decimals) + suffix;
    };
    
    // Formate une valeur en distance (m ou km)
    const formatDistance = (m) => {
        if (m === undefined || m === null || isNaN(m)) return 'N/A';
        if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
        return `${m.toFixed(2)} m`;
    };

    // --- MODÈLES PHYSIQUES ---

    /** Calcule la vitesse du son (m/s) à partir de la température en Kelvin. */
    const getSpeedOfSound = (T_K) => {
        // Formule de la vitesse du son dans l'air sec (gamma=1.400)
        return Math.sqrt(1.400 * R_AIR * T_K);
    };

    /** Calcule la densité de l'air (kg/m³) à partir de la pression (Pa) et de la température (K). */
    const getAirDensity = (P_Pa, T_K) => {
        // Équation des gaz parfaits pour la densité (Rho = P / (R_AIR * T))
        return P_Pa / (R_AIR * T_K);
    };

    /**
     * Calcule la gravité locale (g) en fonction de la latitude (en radians) et de l'altitude (m/s²).
     * (Basé sur le modèle WGS84 - simplifié ici)
     */
    const getGravity = (latRad, alt) => {
        // g_0 (Gravité au niveau de la mer)
        const g_0 = 9.780327 * (1 + 0.0053024 * Math.sin(latRad)**2);
        
        // Correction d'altitude (anomalie à l'air libre)
        const G_ACC_NEW = g_0 - 3.086e-6 * alt;
        
        return G_ACC_NEW;
    };


    // --- GESTION MÉTÉO ET NTP (RÉSEAU) ---
    
    /**
     * Appelle l'API Météo via le proxy Vercel.
     * @returns {Promise<object|null>} Données météo ou null en cas d'échec.
     */
    async function fetchWeather(lat, lon) {
        if (lat === 0.0 && lon === 0.0) return null; // Ne pas appeler avec 0,0
        try {
            const response = await fetch(`${PROXY_WEATHER_ENDPOINT}?lat=${lat}&lon=${lon}`);
            if (!response.ok) {
                console.warn(`Erreur météo: ${response.status}`);
                return null;
            }
            const data = await response.json();
            
            // Calculs physiques pour l'UKF/les affichages
            data.tempK = data.main.temp + 273.15; // Conversion en Kelvin
            data.pressure_hPa = data.main.pressure;
            data.pressure_Pa = data.pressure_hPa * 100; // Conversion en Pascal
            data.air_density = getAirDensity(data.pressure_Pa, data.tempK);
            
            return data;
        } catch (error) {
            console.error("Échec de la récupération météo:", error);
            return null;
        }
    }

    /**
     * Synchronise l'horloge avec un serveur NTP.
     */
    function syncH() {
        return fetch(SERVER_TIME_ENDPOINT)
            .then(r => r.json())
            .then(data => {
                lServH = data.unixtime * 1000;
                lLocH = Date.now();
                if ($('local-time')) $('local-time').textContent = new Date(lServH).toLocaleTimeString('fr-FR');
            })
            .catch(() => {
                if ($('local-time')) $('local-time').textContent = 'SYNCHRO ÉCHOUÉE (Mode Local)';
            });
    }
    
    /** Calcule la date corrigée à partir de la synchro NTP. */
    const getCDate = (serverTime, localTimeAtSync) => {
        if (serverTime === 0) return new Date(); // Fallback
        return new Date(serverTime + (Date.now() - localTimeAtSync));
    };

// ... (Fin du Bloc 2)
 // =================================================================
// BLOC 3/4 : GESTION DES CAPTEURS ET LOGIQUE UKF
// Dépend de l'UKF (ProfessionalUKF) et de math.js
// =================================================================

    // --- GESTIONNAIRE IMU (DeviceMotion) ---

    /**
     * Traite les données d'accélération de l'IMU.
     */
    function handleDeviceMotion(event) {
        if (isGpsPaused) return;

        // Accélération linéaire (gravité soustraite par le système si disponible)
        const accel = event.accelerationIncludingGravity || event.acceleration;

        // Mise à jour des variables globales
        currentAccelMs2_X = accel.x || 0.0;
        currentAccelMs2_Y = accel.y || 0.0;
        currentAccelMs2_Z = accel.z || 0.0;

        // MISE À JOUR UKF - Phase de prédiction (Si l'UKF est actif)
        if (ukf) {
             const dt = (Date.now() - lastUKFUpdateT) / 1000.0;
             if (dt > 0.0) {
                 // Prédiction utilisant les accélérations de l'IMU
                 ukf.predict(dt, [currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z]);
                 lastUKFUpdateT = Date.now();
             }
        }
    }

    // --- INITIALISATION IMU (Avec gestion des permissions iOS/Android) ---
    
    function initIMU() {
        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) {
            // Logique spécifique aux mobiles iOS/Android pour la permission
            DeviceMotionEvent.requestPermission().then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    if ($('imu-status')) $('imu-status').textContent = 'Actif';
                } else {
                    if ($('imu-status')) $('imu-status').textContent = 'Refusé';
                }
            }).catch(err => {
                console.error('Erreur IMU:', err);
                if ($('imu-status')) $('imu-status').textContent = 'Erreur';
            });
        } else if (window.DeviceMotionEvent) {
            // Navigateurs de bureau / Anciens systèmes : Démarrer directement
            window.addEventListener('devicemotion', handleDeviceMotion);
            if ($('imu-status')) $('imu-status').textContent = 'Actif';
        } else {
            if ($('imu-status')) $('imu-status').textContent = 'Non Supporté';
        }
    }
    
    // --- GESTIONNAIRE GPS (Geolocation API) ---

    /**
     * Traite les données de position du GPS.
     */
    function handlePositionUpdate(position) {
        if (isGpsPaused) return;

        const rawLat = position.coords.latitude;
        const rawLon = position.coords.longitude;
        const rawAlt = position.coords.altitude || currentAltitudeM; // Utiliser la dernière alt si non dispo
        const rawAcc = position.coords.accuracy || 10.0;
        rawSpeedMs = position.coords.speed || 0.0; // Vitesse brute GPS
        const heading = position.coords.heading || 0.0; // Cap

        // MISE À JOUR UKF - Phase de correction (Si l'UKF est actif)
        if (ukf) {
            // Le UKF gère la fusion des données GPS (position, vitesse) et IMU (accel)
            const UKF_OUTPUT = ukf.update(
                rawLat, rawLon, rawAlt, rawAcc, rawSpeedMs, heading,
                currentG_Acc, currentAirDensity, currentSpeedOfSound, currentUKFReactivity
            );
            
            // Mise à jour de l'état global avec les valeurs filtrées
            currentPosition.lat = UKF_OUTPUT.lat;
            currentPosition.lon = UKF_OUTPUT.lon;
            currentPosition.acc = UKF_OUTPUT.pos_std;
            currentSpeedMs = UKF_OUTPUT.speed_ms;
            currentAltitudeM = UKF_OUTPUT.alt_m;

        } else {
            // Mode brut si UKF désactivé
            currentPosition.lat = rawLat;
            currentPosition.lon = rawLon;
            currentPosition.acc = rawAcc;
            currentSpeedMs = rawSpeedMs;
            currentAltitudeM = rawAlt;
        }

        // Mise à jour de la carte (Leaflet)
        if (map && marker) {
            const newLatLon = [currentPosition.lat, currentPosition.lon];
            marker.setLatLng(newLatLon);
            map.setView(newLatLon, map.getZoom() || 13);
        }
    }

    function handlePositionError(error) {
        console.error("Erreur GPS: ", error.message);
        // Afficher l'erreur à l'utilisateur
        if ($('gps-status')) $('gps-status').textContent = `Erreur: ${error.code} (${error.message})`;
    }

    function initGPS() {
        if (!("geolocation" in navigator)) {
            if ($('gps-status')) $('gps-status').textContent = 'Non Supporté';
            return;
        }

        // Configuration GPS pour la haute fréquence et précision
        const GPS_OPTS = {
            enableHighAccuracy: true, 
            maximumAge: 0, 
            timeout: 10000 
        };

        // Démarrage du Watcher GPS
        navigator.geolocation.watchPosition(
            handlePositionUpdate, 
            handlePositionError, 
            GPS_OPTS
        );
        if ($('gps-status')) $('gps-status').textContent = 'Actif';
    }

// ... (Fin du Bloc 3)
 // =================================================================
// BLOC 4/4 : MISE À JOUR DOM, ÉVÉNEMENTS ET INITIALISATION
// =================================================================

    // --- FONCTIONS DE MISE À JOUR DOM ---

    /**
     * Met à jour les valeurs de l'interface liées à l'UKF/GPS.
     */
    function updateDashboardDOM() {
        // Position et Vitesse
        if ($('lat-coord')) $('lat-coord').textContent = dataOrDefault(currentPosition.lat, 6, '°');
        if ($('lon-coord')) $('lon-coord').textContent = dataOrDefault(currentPosition.lon, 6, '°');
        if ($('alt-meter')) $('alt-meter').textContent = formatDistance(currentAltitudeM);
        if ($('speed-ms')) $('speed-ms').textContent = dataOrDefault(currentSpeedMs, 2, ' m/s');
        if ($('speed-kmh')) $('speed-kmh').textContent = dataOrDefault(currentSpeedMs * KMH_MS, 1, ' km/h');
        
        // Vitesse Brute (pour comparaison)
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 2, ' m/s (Brut)');

        // UKF et Précision
        if ($('ukf-pos-acc')) $('ukf-pos-acc').textContent = formatDistance(currentPosition.acc);
        if ($('ukf-vel-acc')) $('ukf-vel-acc').textContent = ukf ? dataOrDefault(ukf.getStateCovariance().get([4, 4]), 3, ' m²/s²') : 'N/A';
        
        // Météo (si les données ont été récupérées)
        if (lastKnownWeather) {
            if ($('temp-air-2')) $('temp-air-2').textContent = dataOrDefault(lastKnownWeather.main.temp, 1, ' °C');
            if ($('pressure-2')) $('pressure-2').textContent = dataOrDefault(lastKnownWeather.main.pressure, 0, ' hPa');
            if ($('air-density')) $('air-density').textContent = dataOrDefault(currentAirDensity, 3, ' kg/m³');
        } else {
             // Fallbacks/Valeurs par défaut
             if ($('temp-air-2')) $('temp-air-2').textContent = '15.0 °C (Défaut)';
             if ($('pressure-2')) $('pressure-2').textContent = '1013 hPa (Défaut)';
             if ($('air-density')) $('air-density').textContent = dataOrDefault(RHO_SEA_LEVEL, 3, ' kg/m³ (Défaut)');
        }
        
        // Physique
        if ($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = dataOrDefault(currentSpeedOfSound, 2, ' m/s');
        if ($('gravity-base')) $('gravity-base').textContent = dataOrDefault(currentG_Acc, 4, ' m/s²');
        
        // IMU/Forces
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(currentAccelMs2_X, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(currentAccelMs2_Y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(currentAccelMs2_Z, 3, ' m/s²');

        // Heure NTP
        const now = getCDate(lServH, lLocH);
        if (now && !$('local-time').textContent.includes('SYNCHRO ÉCHOUÉE')) {
            $('local-time').textContent = now.toLocaleTimeString('fr-FR');
            $('date-display').textContent = now.toLocaleDateString('fr-FR');

            // Mise à jour Astro (Nécessite la librairie astro.js et SunCalc)
            if (typeof updateAstro === 'function' && typeof SunCalc !== 'undefined') {
                updateAstro(now, currentPosition.lat, currentPosition.lon);
            }
        }
    }

    /**
     * Met à jour les valeurs d'environnement (densité, vitesse du son, gravité)
     * après une mise à jour météo ou un changement de corps céleste.
     */
    function updatePhysicalState(weatherData = lastKnownWeather) {
        if (weatherData) {
            lastT_K = weatherData.tempK;
            lastP_hPa = weatherData.pressure_hPa;
            currentAirDensity = weatherData.air_density;
            currentSpeedOfSound = getSpeedOfSound(lastT_K);
        }
        
        // Mise à jour de la gravité (Gravité est dynamique)
        currentG_Acc = getGravity(currentPosition.lat * D2R, currentAltitudeM);
        
        // (Logique pour 'ROTATING' ou autres corps célestes omise pour la concision)
    }


    // --- GESTIONNAIRE D'ÉVÉNEMENTS (BOUTONS/MENUS) ---

    function setupEventListeners() {
        // Bouton de Démarrage/Pause
        const toggleGpsBtn = $('toggle-gps-btn');
        if (toggleGpsBtn) {
            toggleGpsBtn.addEventListener('click', () => {
                isGpsPaused = !isGpsPaused;
                if (isGpsPaused) {
                    toggleGpsBtn.textContent = '▶️ Reprendre';
                    if ($('gps-status')) $('gps-status').textContent = 'En Pause';
                } else {
                    toggleGpsBtn.textContent = '⏸️ Pause GPS';
                    if ($('gps-status')) $('gps-status').textContent = 'Actif';
                    // S'assurer que les systèmes sont démarrés si c'est la première fois
                    if (!map) initMap(currentPosition.lat, currentPosition.lon); 
                    if (!ukf) {
                         // Initialiser l'UKF (se fera normalement dans le 'load' si math.js est là)
                    }
                }
            });
        }
        
        // Autres contrôles
        if ($('mass-input')) {
            $('mass-input').addEventListener('input', (e) => {
                currentMass = parseFloat(e.target.value) || 70.0;
                $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
            });
        }
        
        // Mode Nether (1:8)
        if ($('nether-toggle-btn')) {
            $('nether-toggle-btn').addEventListener('click', () => {
                netherMode = !netherMode;
                $('nether-toggle-btn').textContent = `Mode Nether: ${netherMode ? 'ACTIVÉ (1:8)' : 'DÉSACTIVÉ (1:1)'}`;
            });
        }
        
        // Réactivité UKF
        if ($('ukf-reactivity-mode')) {
             $('ukf-reactivity-mode').addEventListener('change', (e) => currentUKFReactivity = e.target.value);
        }
    }

    // --- INITIALISATION PRINCIPALE (ON LOAD) ---

    window.addEventListener('load', () => {
        
        // Vérification et initialisation des systèmes critiques
        if (typeof math !== 'undefined' && typeof ProfessionalUKF !== 'undefined') {
            // Initialisation de l'UKF avec les valeurs par défaut.
            ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentAltitudeM);
        } else {
            console.warn("L'UKF professionnel est désactivé. Mode GPS/Capteur brut activé.");
        }
        
        // 1. Initialisation des systèmes critiques (Même si en pause)
        syncH(); // Synchro NTP (pour avoir l'heure correcte)
        initGPS(); // Démarrer le watcher GPS
        initIMU(); // Demander la permission IMU et démarrer le watcher

        // 2. Attacher les événements utilisateur
        setupEventListeners();

        // 3. Boucles de rafraîchissement
        
        // Boucle rapide (Affichage/Prédiction UKF)
        setInterval(() => {
             // updateDashboardDOM est appelé même en pause pour afficher les valeurs par défaut/fallbacks
             updateDashboardDOM();
        }, 100); // 100ms
        
        // Boucle lente (Météo/Astro/NTP)
        setInterval(() => {
            // Récupération des données Météo (si non en pause et position définie)
            if (!isGpsPaused && currentPosition.lat !== 0.0) {
                 fetchWeather(currentPosition.lat, currentPosition.lon).then(data => {
                    if (data) {
                        lastKnownWeather = data;
                        updatePhysicalState(data);
                    }
                 });
            }
             // Re-synchronisation NTP occasionnelle
             syncH(); 
        }, DOM_SLOW_UPDATE_MS); // Ex: 5 secondes

        // 4. Afficher l'état initial (avant le premier clic)
        updateDashboardDOM();
    });

})(window); // Fin de l'IIFE
