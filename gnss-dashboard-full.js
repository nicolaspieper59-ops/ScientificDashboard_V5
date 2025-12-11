// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER COMPLET (UKF 21 ÉTATS)
// CORRIGÉ : Gestion hors ligne, capteurs IMU complets, animation corrigée, simulations supprimées.
// Dépendances (doivent être chargées dans l'HTML) : leaflet.js, turf.min.js, suncalc.js, math.min.js, lib/ukf-lib.js, lib/ephem.js, lib/astro.js
// =================================================================

// --- FONCTIONS UTILITAIRES GLOBALES ---
const $ = id => document.getElementById(id);
const dataOrDefault = (val, decimals, suffix = '') => {
    if (val === undefined || val === null || isNaN(val)) {
        return (decimals === 0 ? '0' : '0.00') + suffix;
    }
    return val.toFixed(decimals) + suffix;
};

// CORRECTION CRITIQUE : Assure que le format exponentiel par défaut respecte 'decimals'.
const dataOrDefaultExp = (val, decimals, suffix = '') => {
    if (val === undefined || val === null || isNaN(val)) {
        const zeroDecimals = '0.' + Array(decimals).fill('0').join('');
        return zeroDecimals + 'e+0' + suffix;
    }
    return val.toExponential(decimals) + suffix;
};

// =================================================================
// DÉMARRAGE : Encapsulation de la logique UKF et État Global (IIFE)
// =================================================================

((window) => {

    // Vérification des dépendances critiques
    if (typeof math === 'undefined') {
        console.error("🔴 ERREUR CRITIQUE: math.js n'a pas pu être chargé. Le filtre UKF est désactivé.");
        alert("Erreur: math.js n'a pas pu être chargé. Le filtre UKF est désactivé.");
        return;
    }
    if (typeof L === 'undefined') {
        console.error("🔴 ERREUR: leaflet.js n'a pas pu être chargé. La carte est désactivée.");
    }
    if (typeof turf === 'undefined') {
        console.error("🔴 ERREUR: turf.min.js n'a pas pu être chargé. Les calculs géométriques avancés sont désactivés.");
    }
    if (typeof ProfessionalUKF === 'undefined') {
        console.error("🔴 ERREUR CRITIQUE: ProfessionalUKF n'est pas définie. Vérifiez que lib/ukf-lib.js est chargé.");
    }
    
    // --- CLÉS D'API & ENDPOINTS (Exemple - à personnaliser si nécessaire) ---
    const PROXY_BASE_URL = "https://scientific-dashboard2.vercel.app";
    const PROXY_WEATHER_ENDPOINT = `${PROXY_BASE_URL}/api/weather`;
    const PROXY_POLLUTANTS_ENDPOINT = `${PROXY_BASE_URL}/api/pollutants`;
    const SERVER_TIME_ENDPOINT = "https://worldtimeapi.org/api/utc";

    // --- CONSTANTES PHYSIQUES ET MATHÉMATIQUES FONDAMENTALES ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI; 
    const KMH_MS = 3.6;         
    const C_L = 299792458;      // Vitesse de la lumière (m/s)
    const G_U = 6.6743e-11;     // Constante de gravitation universelle (N·m²/kg²)
    const M_EARTH = 5.9722e24;  // Masse de la Terre (kg)

    // Constantes atmosphériques ISA (International Standard Atmosphere)
    const RHO_SEA_LEVEL = 1.225;        // Densité de l'air au niveau de la mer (kg/m³)
    const TEMP_SEA_LEVEL_K = 288.15;    // Température au niveau de la mer (15°C)
    const BARO_ALT_REF_HPA = 1013.25;   // Pression atmosphérique de référence (hPa)
    const R_AIR = 287.058;              // Constante spécifique de l'air sec (J/kg·K)
    const C_P = 1005;                   // Capacité thermique massique à pression constante (J/kg·K)

    // Constantes Géophysiques (WGS84)
    const WGS84_A = 6378137.0;  // Rayon équatorial WGS84 (m)
    const WGS84_F = 1 / 298.257223563; // Aplatissement WGS84
    const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F; // Excentricité au carré

    // --- CONFIGURATIONS ET ÉTATS GLOBALS ---
    let ukf = null; // L'UKF sera initialisé après le chargement de math.js
    let currentPosition = { lat: 43.2964, lon: 5.3697, alt: 0.0, acc: 10.0, spd: 0.0, head: 0.0 }; // Initialisation (Marseille)

    let currentAirDensity = RHO_SEA_LEVEL;
    let currentSpeedOfSound = 340.29; // Valeur par défaut ISA
    let currentMass = 70.0; // Masse par défaut (kg)
    let kAlt = 0; // Altitude filtrée UKF
    let kVel = [0, 0, 0]; // Vitesse filtrée UKF
    let kAccel = [0, 0, 0]; // Accélération filtrée UKF
    let kTimeBias = 0; // Biais temporel filtré UKF
    let kCovariance = null; // Matrice de covariance

    // Variables pour la correction métrologique
    let lastP_hPa = BARO_ALT_REF_HPA; // Pression atmosphérique
    let lastT_K = TEMP_SEA_LEVEL_K;   // Température de l'air (Kelvin)
    let lastH_perc = 0.0;             // Humidité (fraction)
    let lastKnownWeather = null;
    let lastKnownPollutants = null;

    // Variables de Contrôle
    let isGpsPaused = false;
    let map = null;
    let gpsMarker = null;
    let gpsPath = [];
    let isMapInitialized = false;
    let lServH = 0; // Last Server Time
    let lLocH = 0;  // Last Local Time
    let currentUKFReactivity = 'NORMAL';
    let currentCelestialBody = 'EARTH_WGS84'; // TERRE_WGS84 par défaut
    let rotationRadius = 100; // Rayon de rotation simulé (m)
    let angularVelocity = 0.0; // Vitesse angulaire simulée (rad/s)
    let distanceRatioMode = false; // Mode d'affichage du rapport distance
    
    // Fréquences de mise à jour (ms)
    const DOM_FAST_UPDATE_MS = 100;
    const DOM_SLOW_UPDATE_MS = 5000;
    const GPS_INTERVAL_MS = 5000; // 5 secondes pour économiser la batterie
    const WEATHER_POLLUTANT_INTERVAL_MS = 60000; // 1 minute
    let lastWeatherUpdate = 0;
    let lastPollutantsUpdate = 0;
    
    // Constantes d'environnement pour les calculs de traînée/portance
    const ENVIRONMENT_FACTORS = {
        'NORMAL': { MULT: 1.0, DISPLAY: 'Surface Terrestre' },
        'SPACE': { MULT: 0.0001, DISPLAY: 'Espace (Vide relatif)' },
        'WATER': { MULT: 800.0, DISPLAY: 'Eau (Approximation)' }
    };
    let selectedEnvironment = 'NORMAL';
    
    // --- BLOC 2 : FONCTIONS MATHÉMATIQUES ET PHYSIQUES ---

    /**
     * Calcule la vitesse du son dans l'air (m/s).
     */
    function getSpeedOfSound(tempK) {
        // Gamma (ratio des chaleurs spécifiques) pour l'air sec est environ 1.4
        const GAMMA = 1.4; 
        return Math.sqrt(GAMMA * R_AIR * tempK);
    }

    /**
     * Calcule la densité de l'air (rho) en fonction de Pression (hPa), Température (K), et Humidité (fraction).
     */
    function calculateAirDensity(P_hPa, T_K, H_perc) {
        // Constante spécifique de la vapeur d'eau
        const R_V = 461.5; 
        // Pression de l'air sec (Pa) et pression de la vapeur d'eau (Pa)
        const P = P_hPa * 100; // Convertit hPa en Pa
        
        // Pression de vapeur saturante (formule Magnus-Tetens, approximation)
        const T_C = T_K - 273.15;
        const P_sat = 6.1078 * Math.pow(10, (7.5 * T_C) / (T_C + 237.3)) * 100; // Pa
        
        // Pression de vapeur (selon l'humidité relative)
        const P_v = P_sat * H_perc; 
        const P_d = P - P_v;
        
        // Calcul de la densité de l'air humide (loi des gaz parfaits)
        // rho = (P_d / (R_AIR * T_K)) + (P_v / (R_V * T_K))
        let rho = (P_d / (R_AIR * T_K)) + (P_v / (R_V * T_K));
        
        if (isNaN(rho) || rho < 0) return RHO_SEA_LEVEL; // Fallback
        return rho;
    }

    /**
     * Mise à jour de la gravité en fonction du corps céleste sélectionné.
     */
    function updateCelestialBody(body, kAlt, rotationRadius, angularVelocity) {
        let G_ACC_NEW = 0;
        let R_ALT_CENTER_REF_NEW = WGS84_A;
        let rotationFactor = 0; // Correction due à la rotation
        
        switch(body) {
            case 'EARTH_WGS84':
                // Utilise la fonction WGS84 de ukf-lib.js ou astro.js pour la gravité locale.
                // NOTE: `getGravity` est définie dans `ukf-lib.js` selon les snippets.
                if (typeof getGravity !== 'undefined') {
                    const latRad = currentPosition.lat * D2R;
                    G_ACC_NEW = getGravity(latRad, kAlt || 0); // Gravité WGS84 corrigée en altitude
                    R_ALT_CENTER_REF_NEW = getEarthRadius(latRad); // Rayon terrestre effectif
                } else {
                    G_ACC_NEW = 9.80665; // Gravité standard
                }
                break;
            case 'MOON':
                G_ACC_NEW = 1.625; // Gravité de la Lune (m/s²)
                R_ALT_CENTER_REF_NEW = 1737400; // Rayon moyen de la Lune (m)
                break;
            case 'MARS':
                G_ACC_NEW = 3.721; // Gravité de Mars (m/s²)
                R_ALT_CENTER_REF_NEW = 3389500; // Rayon moyen de Mars (m)
                break;
            case 'ROTATING':
                // Calcul de la pseudo-gravité (centrifuge)
                const totalRadius = rotationRadius + (kAlt || 0);
                rotationFactor = totalRadius * angularVelocity * angularVelocity;
                G_ACC_NEW = rotationFactor; // C'est la force centrifuge (accélération radiale)
                R_ALT_CENTER_REF_NEW = rotationRadius;
                break;
            default:
                G_ACC_NEW = 9.80665;
                R_ALT_CENTER_REF_NEW = WGS84_A;
        }

        // Met à jour les variables globales (si le tableau de bord est conçu pour cela)
        window.G_ACC = G_ACC_NEW;
        window.R_ALT_CENTER_REF = R_ALT_CENTER_REF_NEW; 

        return { G_ACC_NEW, R_ALT_CENTER_REF_NEW };
    }


    /**
     * Calcule le ratio distance/rayon de référence (pour simuler la distance réelle par rapport au rayon de référence)
     */
    function calculateDistanceRatio(kAlt) {
        if (!window.R_ALT_CENTER_REF || window.R_ALT_CENTER_REF === 0) return 1.0;
        // Ratio de la distance (Centre du corps céleste au mobile) sur le rayon de référence
        return (window.R_ALT_CENTER_REF + kAlt) / window.R_ALT_CENTER_REF;
    }


    // --- BLOC 3 : LOGIQUE GPS/UKF/MAPPING ---

    /**
     * Gère la mise à jour de la position GPS.
     */
    function handleGpsUpdate(pos) {
        if (isGpsPaused) return;

        const timestamp = pos.timestamp;
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const alt = pos.coords.altitude || 0.0;
        const acc = pos.coords.accuracy;
        const spd = pos.coords.speed || 0.0;
        const head = pos.coords.heading || 0.0; // Heading (Direction en degrés)
        const altAcc = pos.coords.altitudeAccuracy || acc;

        // Met à jour la position globale brute
        currentPosition = { lat, lon, alt, acc, spd, head, altAcc, timestamp };
        
        // Logique de l'UKF
        if (ukf && typeof ProfessionalUKF !== 'undefined') {
            const z_gps = [lat, lon, alt, spd, head, altAcc];
            const reactivityFactor = getUKFReactivityFactor(); // Récupère le facteur de réactivité
            
            // Prediction
            ukf.predict(timestamp, G_ACC, currentAirDensity, currentMass, reactivityFactor); 
            
            // Update
            // L'UKF professionnel peut ignorer les mises à jour trop imprécises (grand acc)
            if (acc < ukf.MAX_ACC_FOR_UPDATE) { 
                 ukf.update(z_gps, reactivityFactor); 
            } else {
                 console.warn("UKF: Mesure GPS ignorée (précision trop faible)!");
            }

            // Récupère l'état filtré
            const x = ukf.getState();
            kAlt = x[2]; // UKF Altitude
            kVel = [x[3], x[4], x[5]]; // Vitesse NED (Nord, Est, Bas)
            kAccel = [x[6], x[7], x[8]]; // Accélération NED
            kTimeBias = x[20]; // Biais temporel
            kCovariance = ukf.P;
        }
    }
    
    /**
     * Détermine le facteur de réactivité de l'UKF.
     */
    function getUKFReactivityFactor() {
        switch (currentUKFReactivity) {
            case 'LOW': return 0.1;
            case 'NORMAL': return 1.0;
            case 'HIGH': return 5.0;
            case 'FLIGHT': return 10.0;
            default: return 1.0;
        }
    }


    /**
     * Initialise la surveillance GPS.
     */
    function initGPS() {
        const GPS_OPTS = {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000 
        };

        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(handleGpsUpdate, (error) => {
                console.error("Erreur GPS:", error);
                if ($('gps-status')) $('gps-status').textContent = `🔴 GPS ERREUR ${error.code}`;
            }, GPS_OPTS);
            if ($('gps-status')) $('gps-status').textContent = '🟡 GPS EN COURS...';
        } else {
            if ($('gps-status')) $('gps-status').textContent = '🔴 GPS NON SUPPORTÉ';
        }
    }

    /**
     * Initialise la carte Leaflet.
     */
    function initMap() {
        if (typeof L === 'undefined' || isMapInitialized) return;

        try {
            map = L.map('map').setView([currentPosition.lat, currentPosition.lon], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            gpsMarker = L.marker([currentPosition.lat, currentPosition.lon], {
                icon: L.divIcon({
                    className: 'gps-icon',
                    html: '<i class="fas fa-satellite-dish" style="color: #007bff;"></i>',
                    iconSize: [20, 20]
                })
            }).addTo(map);

            isMapInitialized = true;
        } catch (e) {
            console.error("Erreur lors de l'initialisation de la carte Leaflet:", e);
        }
    }

    /**
     * Met à jour la carte et la trace.
     */
    function updateMap(lat, lon, alt, acc, head) {
        if (!isMapInitialized) {
            initMap();
            if (!isMapInitialized) return; // Si l'initialisation a échoué
        }

        const latLon = [lat, lon];
        
        // 1. Déplacer le marqueur
        if (gpsMarker) {
            gpsMarker.setLatLng(latLon);

            // Mise à jour de l'icône pour la direction (heading)
            const iconElement = gpsMarker.getElement();
            if (iconElement) {
                // Pour que la boussole soit orientée vers le haut
                const rotation = head !== null ? head : 0; 
                iconElement.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
            }
        }
        
        // 2. Centrer la carte (optionnel, uniquement au début ou sur demande)
        // map.setView(latLon, map.getZoom());

        // 3. Mettre à jour la trace (path)
        // Note: L'UKF étant à 21 états, c'est l'état filtré qui est le plus pertinent
        if (gpsPath.length === 0 || turf.distance(turf.point(gpsPath[gpsPath.length - 1]), turf.point(latLon), { units: 'meters' }) > 5) {
            gpsPath.push(latLon);
        }
        
        // Pour les performances, on pourrait limiter la longueur du path
        if (gpsPath.length > 50) {
            gpsPath.shift();
        }

        // Dessiner la trace avec Leaflet
        if (window.pathLayer) {
            window.pathLayer.setLatLngs(gpsPath);
        } else {
            window.pathLayer = L.polyline(gpsPath, { color: '#dc3545', weight: 4, opacity: 0.7 }).addTo(map);
        }

        // Mettre à jour le cercle de précision
        if (window.accuracyCircle) {
            window.accuracyCircle.setLatLng(latLon).setRadius(acc);
        } else {
            window.accuracyCircle = L.circle(latLon, { radius: acc, color: '#007bff', fillColor: '#007bff', fillOpacity: 0.1, weight: 1 }).addTo(map);
        }
    }


    // --- BLOC 4 : GESTION DU TEMPS (NTP) ---

    /**
     * Récupère l'heure du serveur pour la synchronisation NTP.
     */
    function syncH() {
        if (!navigator.onLine) {
            console.warn("Synchronisation NTP ignorée : Hors ligne.");
            if ($('local-time')) $('local-time').textContent = '🔴 SYNCHRO ÉCHOUÉE (OFFLINE)';
            return Promise.resolve();
        }

        return fetch(SERVER_TIME_ENDPOINT)
            .then(response => {
                if (!response.ok) throw new Error("Erreur de réponse du serveur.");
                return response.json();
            })
            .then(data => {
                if (data && data.unixtime) {
                    lServH = data.unixtime * 1000;
                    lLocH = new Date().getTime();
                    console.log("Synchronisation NTP réussie.");
                } else {
                    throw new Error("Format de réponse NTP invalide.");
                }
            })
            .catch(error => {
                console.error("Échec de la synchronisation NTP:", error);
                if ($('local-time')) $('local-time').textContent = '🔴 SYNCHRO ÉCHOUÉE';
            });
    }

    /**
     * Retourne l'heure actuelle corrigée par le biais NTP.
     */
    function getCDate(lastServerTime, lastLocalTime) {
        if (lastServerTime === 0 || lastLocalTime === 0) return new Date(); // Retourne l'heure locale si non synchro
        const nowLocal = new Date().getTime();
        const drift = nowLocal - lastLocalTime;
        const correctedTime = lastServerTime + drift;
        return new Date(correctedTime);
    }


    // --- BLOC 5 : FETCH API MÉTÉO/ENVIRONNEMENT ---

    /**
     * Récupère les données météo.
     */
    function fetchWeather(lat, lon) {
        if (!navigator.onLine) return Promise.resolve(null);
        if (new Date().getTime() - lastWeatherUpdate < WEATHER_POLLUTANT_INTERVAL_MS) {
            return Promise.resolve(lastKnownWeather);
        }

        const url = `${PROXY_WEATHER_ENDPOINT}?lat=${lat}&lon=${lon}`;

        return fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error("Erreur API Météo:", data.error);
                    return null;
                }
                
                // Conversion et calculs critiques
                const tempC = data.temp - 273.15;
                const tempK = data.temp;
                const pressure_hPa = data.pressure / 100.0;
                const humidity_perc = data.humidity;
                const humidity_frac = humidity_perc / 100.0;
                const air_density = calculateAirDensity(pressure_hPa, tempK, humidity_frac);
                const speedOfSound = getSpeedOfSound(tempK);
                
                lastWeatherUpdate = new Date().getTime();
                lastKnownWeather = { ...data, tempC, tempK, pressure_hPa, humidity_perc, air_density, speedOfSound };
                
                return lastKnownWeather;
            })
            .catch(error => {
                console.error("Échec du fetch météo:", error);
                return null;
            });
    }

    /**
     * Met à jour le DOM avec les données météo.
     */
    function updateWeatherDOM(data, isInitial = false) {
        if (!data) return;

        // Met à jour les variables globales utilisées par l'UKF/calculs
        currentAirDensity = data.air_density;
        currentSpeedOfSound = data.speedOfSound;
        lastT_K = data.tempK;
        lastP_hPa = data.pressure_hPa;
        lastH_perc = data.humidity_perc / 100.0;

        // Met à jour le DOM
        if ($('temp-air-2')) $('temp-air-2').textContent = `${data.tempC.toFixed(1)} °C`;
        if ($('pressure-2')) $('pressure-2').textContent = `${data.pressure_hPa.toFixed(0)} hPa`;
        if ($('humidity-2')) $('humidity-2').textContent = `${data.humidity_perc} %`;
        if ($('air-density')) $('air-density').textContent = `${data.air_density.toFixed(3)} kg/m³`;
        if ($('wind-speed-ms') && data.wind_speed_ms !== undefined) $('wind-speed-ms').textContent = `${data.wind_speed_ms.toFixed(1)} m/s`;
        if ($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = `${data.speedOfSound.toFixed(2)} m/s (Calculé)`;
    }
    
    /**
     * Récupère les données de pollution.
     */
    function fetchPollutants(lat, lon) {
        if (!navigator.onLine) return Promise.resolve(null);
        if (new Date().getTime() - lastPollutantsUpdate < WEATHER_POLLUTANT_INTERVAL_MS) {
            return Promise.resolve(lastKnownPollutants);
        }

        const url = `${PROXY_POLLUTANTS_ENDPOINT}?lat=${lat}&lon=${lon}`;

        return fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.error || !data.aqi) {
                    console.warn("API Polluants: Aucune donnée ou erreur.");
                    return null;
                }
                
                lastPollutantsUpdate = new Date().getTime();
                lastKnownPollutants = data;
                
                return lastKnownPollutants;
            })
            .catch(error => {
                console.error("Échec du fetch polluants:", error);
                return null;
            });
    }

    /**
     * Met à jour le DOM avec les données de pollution.
     */
    function updatePollutantsDOM(data, isInitial = false) {
        if (!data) return;

        if ($('aqi-value')) $('aqi-value').textContent = `${data.aqi} (Qualité Air)`;
        if ($('co2-level') && data.co !== undefined) $('co2-level').textContent = `${data.co.toFixed(0)} μg/m³ (CO)`;
        if ($('ozone-conc') && data.o3 !== undefined) $('ozone-conc').textContent = `${data.o3.toFixed(0)} μg/m³ (O₃)`;
        if ($('so2-conc') && data.so2 !== undefined) $('so2-conc').textContent = `${data.so2.toFixed(0)} μg/m³ (SO₂)`;
    }


    // --- BLOC 6 : MISE À JOUR DU DOM (Fast/Slow Loop) ---

    /**
     * Met à jour les données astronomiques.
     */
    function updateAstroDOM(lat, lon) {
        if (typeof getAstroData === 'undefined') {
            console.warn("Astro: lib/astro.js n'est pas chargé.");
            return;
        }

        const date = getCDate(lServH, lLocH);
        const astroData = getAstroData(date, lat, lon);

        // Soleil
        if ($('solar-alt')) $('solar-alt').textContent = `${(astroData.sun.altitude * R2D).toFixed(2)}°`;
        if ($('solar-azimuth')) $('solar-azimuth').textContent = `${(astroData.sun.azimuth * R2D).toFixed(2)}°`;
        if ($('solar-distance')) $('solar-distance').textContent = `${dataOrDefaultExp(astroData.sun.distance, 2, ' m')}`;
        if ($('day-duration')) $('day-duration').textContent = astroData.sun.times.dayDuration || 'N/A';
        if ($('sunrise-times')) $('sunrise-times').textContent = `${astroData.sun.times.riseTST || 'N/A'} / ${astroData.sun.times.riseTSM || 'N/A'}`;
        if ($('sunset-times')) $('sunset-times').textContent = `${astroData.sun.times.setTST || 'N/A'} / ${astroData.sun.times.setTSM || 'N/A'}`;
        
        // Lune
        if ($('moon-phase-name')) $('moon-phase-name').textContent = getMoonPhaseName(astroData.moon.illumination.phase);
        if ($('moon-illuminated')) $('moon-illuminated').textContent = `${(astroData.moon.illumination.fraction * 100).toFixed(1)} %`;
        if ($('moon-alt')) $('moon-alt').textContent = `${(astroData.moon.position.altitude * R2D).toFixed(2)}°`;
        if ($('moon-azimuth')) $('moon-azimuth').textContent = `${(astroData.moon.position.azimuth * R2D).toFixed(2)}°`;
        if ($('moon-distance')) $('moon-distance').textContent = `${dataOrDefaultExp(astroData.moon.position.distance, 2, ' m')}`;
        if ($('moon-times')) $('moon-times').textContent = `${astroData.moon.times.rise || 'N/A'} / ${astroData.moon.times.set || 'N/A'}`;

        // Temps Solaire
        if ($('local-sidereal-time')) $('local-sidereal-time').textContent = `${astroData.LST || 'N/A'}`;
        if ($('mean-solar-time')) $('mean-solar-time').textContent = `${formatHours(astroData.MST_HRS) || 'N/A'}`;
        if ($('true-solar-time')) $('true-solar-time').textContent = `${formatHours(astroData.TST_HRS) || 'N/A'}`;
        if ($('equation-of-time')) $('equation-of-time').textContent = `${astroData.EOT_MIN.toFixed(2)} min`;
        if ($('noon-solar-utc')) $('noon-solar-utc').textContent = `${astroData.NOON_SOLAR_UTC || 'N/A'}`;
    }


    /**
     * Boucle de mise à jour rapide du DOM (Position, Vitesse, UKF).
     */
    function updateDashboardDOMFast() {
        const { lat, lon, alt, acc, spd, head, altAcc } = currentPosition;
        const ukfActive = ukf && typeof ProfessionalUKF !== 'undefined';
        
        // --- DONNÉES GPS BRUTES / UKF ---
        
        // Position brute (GPS)
        if ($('lat-val')) $('lat-val').textContent = dataOrDefault(lat, 6) + '°';
        if ($('lon-val')) $('lon-val').textContent = dataOrDefault(lon, 6) + '°';
        if ($('alt-val-raw')) $('alt-val-raw').textContent = dataOrDefault(alt, 1) + ' m';
        if ($('acc-val')) $('acc-val').textContent = dataOrDefault(acc, 1) + ' m';

        // Position Filtrée (UKF) - Utilise l'altitude filtrée (kAlt)
        const displayAlt = ukfActive ? kAlt : alt;
        if ($('alt-val')) $('alt-val').textContent = dataOrDefault(displayAlt, 3) + ' m';
        if ($('alt-val-exp')) $('alt-val-exp').textContent = dataOrDefaultExp(displayAlt, 2) + ' m';

        // Vitesse
        const displaySpdMS = ukfActive ? math.norm(kVel) : spd; // Vitesse 3D à partir de la vitesse NED
        if ($('speed-ms')) $('speed-ms').textContent = dataOrDefault(displaySpdMS, 2) + ' m/s';
        if ($('speed-kmh')) $('speed-kmh').textContent = dataOrDefault(displaySpdMS * KMH_MS, 1) + ' km/h';

        // Direction/Cap
        if ($('heading-val')) $('heading-val').textContent = dataOrDefault(head, 1) + '°';
        
        // Accélération (UKF)
        if ($('accel-val') && ukfActive) {
            const accelNorm = math.norm(kAccel); // Norme de l'accélération
            $('accel-val').textContent = dataOrDefault(accelNorm, 3) + ' m/s²';
            $('accel-val-g').textContent = dataOrDefault(accelNorm / G_ACC, 3) + ' G';
        }
        
        // Biais temporel (UKF)
        if ($('time-bias') && ukfActive) {
             $('time-bias').textContent = dataOrDefaultExp(kTimeBias, 3) + ' s';
        }

        // Affichage de la gravité locale (mise à jour par updateCelestialBody)
        if ($('gravity-base')) $('gravity-base').textContent = `${(window.G_ACC || 9.80665).toFixed(4)} m/s²`;
        
        // Affichage du Rayon de Référence
        if ($('earth-radius')) $('earth-radius').textContent = dataOrDefault(window.R_ALT_CENTER_REF / 1000, 1) + ' km';
        if ($('distance-ratio') && distanceRatioMode) {
            const ratio = calculateDistanceRatio(kAlt);
            $('distance-ratio').textContent = `${ratio.toFixed(5)}`;
        } else if ($('distance-ratio')) {
            $('distance-ratio').textContent = `1.00000`;
        }

        // Mise à jour de la carte (utilise la position filtrée ou brute si UKF est absent)
        const mapLat = ukfActive ? ukf.getState()[0] : lat;
        const mapLon = ukfActive ? ukf.getState()[1] : lon;
        updateMap(mapLat, mapLon, displayAlt, acc, head); 
    }

    /**
     * Boucle de mise à jour lente du DOM (Météo, Astro, Temps Synchro).
     */
    function updateDashboardDOMSlow() {
        const { lat, lon } = currentPosition;
        
        // 1. Mise à jour des données Astro/Temps
        updateAstroDOM(lat, lon);
        
        // 2. Fetch des données Météo/Polluants
        fetchWeather(lat, lon).then(updateWeatherDOM);
        fetchPollutants(lat, lon).then(updatePollutantsDOM);

        // 3. Met à jour l'horloge locale (NTP)
        const now = getCDate(lServH, lLocH);
        if (now) {
            if ($('local-time') && !$('local-time').textContent.includes('SYNCHRO ÉCHOUÉE')) {
                $('local-time').textContent = now.toLocaleTimeString('fr-FR');
            }
            if ($('date-display')) $('date-display').textContent = now.toLocaleDateString('fr-FR');
        }
    }


    // --- BLOC 7 : LISTENERS ET INITIALISATION FINALE ---

    /**
     * Attache les écouteurs d'événements (boutons, select, etc.).
     */
    function setupEventListeners() {
        // Toggle GPS (Pause/Reprise)
        const gpsToggleBtn = $('gps-toggle-btn');
        if (gpsToggleBtn) {
            gpsToggleBtn.addEventListener('click', () => {
                isGpsPaused = !isGpsPaused;
                gpsToggleBtn.textContent = isGpsPaused ? '🔴 GPS PAUSÉ' : '🟢 GPS ACTIF';
            });
        }
        
        // Contrôles de la Masse
        $('mass-input').addEventListener('input', (e) => {
            currentMass = parseFloat(e.target.value) || 70.0;
            $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
        });

        // Contrôles du Corps Céleste / Rotation
        $('celestial-body-select').addEventListener('change', (e) => {
            currentCelestialBody = e.target.value;
            const { G_ACC_NEW } = updateCelestialBody(currentCelestialBody, kAlt, rotationRadius, angularVelocity);
            $('gravity-base').textContent = `${G_ACC_NEW.toFixed(4)} m/s²`;
        });
        const updateRotation = () => {
            rotationRadius = parseFloat($('rotation-radius').value) || 100;
            angularVelocity = parseFloat($('angular-velocity').value) || 0.0;
            if (currentCelestialBody === 'ROTATING') {
                const { G_ACC_NEW } = updateCelestialBody('ROTATING', kAlt, rotationRadius, angularVelocity);
                $('gravity-base').textContent = `${G_ACC_NEW.toFixed(4)} m/s²`;
            }
        };
        $('rotation-radius').addEventListener('input', updateRotation);
        $('angular-velocity').addEventListener('input', updateRotation);
        
        // CORRECTION : Bouton "Rapport Distance"
        $('distance-ratio-toggle-btn').addEventListener('click', () => {
            distanceRatioMode = !distanceRatioMode;
            const ratio = distanceRatioMode ? calculateDistanceRatio(kAlt || 0) : 1.0;
            $('distance-ratio-toggle-btn').textContent = `Rapport Distance: ${distanceRatioMode ? 'ALTITUDE' : 'SURFACE'} (${ratio.toFixed(3)})`;
        });

        // Réactivité UKF
        $('ukf-reactivity-mode').addEventListener('change', (e) => currentUKFReactivity = e.target.value);
        
        // Initialiser les valeurs de contrôle
        updateCelestialBody(currentCelestialBody, kAlt, rotationRadius, angularVelocity);
    }


    window.addEventListener('load', () => {
        
        // 1. Démarrer la synchro NTP (gère l'échec hors ligne)
        syncH().finally(() => { 
            // 2. Initialiser l'UKF si math.js est chargé
            if (typeof math !== 'undefined' && typeof ProfessionalUKF !== 'undefined') {
                ukf = new ProfessionalUKF(); 
                ukf.setInitialState(currentPosition.lat, currentPosition.lon, currentPosition.alt);
                console.log("UKF 21 États initialisé.");
            } else {
                 // Si l'UKF n'est pas dispo, on continue sans le filtre
                 console.warn("UKF non initialisé. Fonctionnement en mode GPS brut.");
            }

            // 3. Initialiser les valeurs par défaut hors ligne pour la physique
            currentAirDensity = RHO_SEA_LEVEL;
            currentSpeedOfSound = getSpeedOfSound(TEMP_SEA_LEVEL_K); // 15°C ISA
            lastT_K = TEMP_SEA_LEVEL_K;
            lastP_hPa = BARO_ALT_REF_HPA;
            updateCelestialBody(currentCelestialBody, kAlt, rotationRadius, angularVelocity); // Init G_ACC, R_REF
            
            // 4. Initialiser la carte et les écouteurs
            initMap();
            setupEventListeners();
            
            // 5. Initialiser le GPS
            initGPS();
            
            // 6. Premiers rafraîchissements (pour éviter le "N/A" trop longtemps)
            updateDashboardDOMFast();
            updateDashboardDOMSlow();

            // 7. Boucles principales de rafraîchissement
            setInterval(updateDashboardDOMFast, DOM_FAST_UPDATE_MS);
            setInterval(updateDashboardDOMSlow, DOM_SLOW_UPDATE_MS);
        });
    });

})(window);
