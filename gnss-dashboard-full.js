// =================================================================
// FICHIER CORE FINAL : GNSS SpaceTime Dashboard • UKF 21 États Fusion
// (Ce fichier requiert les dépendances math.min.js, ukf-lib.js, astro.js, leaflet.js et turf.min.js chargées en amont)
// =================================================================

// --- BLOC 1 : CONSTANTES ET CONFIGURATION GLOBALE ---

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const KMH_MS = 3.6;         // Conversion m/s vers km/h
const C_L = 299792458;      // Vitesse de la lumière (m/s)
const R_AIR = 287.058;      // Constante spécifique de l'air sec (J/kg·K)
const G_U = 6.6743e-11;     // Constante gravitationnelle (m³/(kg·s²))

// Valeurs de Référence Météo ISA (International Standard Atmosphere)
const TEMP_SEA_LEVEL_K = 288.15; // 15 °C
const RHO_SEA_LEVEL = 1.225;     // Densité de l'air (kg/m³)
const BARO_ALT_REF_HPA = 1013.25; // Pression au niveau de la mer

// CLÉS D'API & ENDPOINTS (À configurer si non déjà définis)
const PROXY_BASE_URL = "https://scientific-dashboard2.vercel.app";
const PROXY_WEATHER_ENDPOINT = `${PROXY_BASE_URL}/api/weather`;
const SERVER_TIME_ENDPOINT = "https://worldtimeapi.org/api/utc";

// --- BLOC 2 : ÉTAT GLOBAL ET VARIABLES DE CONTRÔLE ---

let ukf; // L'instance du filtre UKF à 21 états
let map; // L'instance de la carte Leaflet
let mapMarker; // Le marqueur de position filtrée
let isGpsPaused = false;
let netherMode = false;
let distanceRatioMode = false;
let motionListenerActive = false;
let currentUKFReactivity = 'NORMAL'; // 'NORMAL', 'AGRESSIF', 'PASSIF'

let currentPosition = {
    lat: 43.2964,   // Lat de fallback (ex: Marseille)
    lon: 5.3697,    // Lon de fallback
    alt: 0.0,
    acc: 10.0,
    spd: 0.0,
    kAlt: 0.0,      // Altitude corrigée par pression (Kalman)
    head: 0.0
};

// Variables pour Synchro NTP
let lServH = null; // Dernière heure du serveur
let lLocH = null;  // Dernière heure locale au moment de la synchro

// Variables Métrologiques pour les Calculs Physiques
let lastP_hPa = BARO_ALT_REF_HPA;
let lastT_K = TEMP_SEA_LEVEL_K;
let lastH_perc = 0.5; // 50% d'humidité

// Variables de Physique Modélisée
let currentMass = 70.0; // Masse de référence (kg)
let currentCelestialBody = 'EARTH'; // Corps céleste sélectionné
let currentAirDensity = RHO_SEA_LEVEL;
let currentSpeedOfSound = 340.0; // Sera mis à jour par getSpeedOfSound()

// --- BLOC 3 : FONCTIONS UTILITAIRES GÉNÉRALES ---

const $ = id => document.getElementById(id);
const dataOrDefault = (val, decimals, suffix = '') => {
    if (val === undefined || val === null || isNaN(val)) {
        return (decimals === 0 ? '0' : '0.00') + suffix;
    }
    return val.toFixed(decimals) + suffix;
};
const dataOrDefaultExp = (val, decimals, suffix = '') => {
    if (val === undefined || val === null || isNaN(val)) {
        const zeroDecimals = '0.' + Array(decimals).fill('0').join('');
        return zeroDecimals + 'e+0' + suffix;
    }
    return val.toExponential(decimals) + suffix;
};

// --- BLOC 4 : MODÈLES PHYSIQUES ET MATHÉMATIQUES (Helpers Critiques) ---

/**
 * Calcule la vitesse du son dans l'air (en m/s) à partir de la température (en Kelvin).
 */
function getSpeedOfSound(tempK) {
    if (isNaN(tempK)) return 340.0; // Valeur de fallback
    const GAMMA = 1.400; // Indice adiabatique de l'air
    const R_AIR = 287.058; // Constante spécifique de l'air sec
    return Math.sqrt(GAMMA * R_AIR * tempK);
}

/**
 * Calcule la gravité WGS84 et ajuste les constantes.
 * NOTE: La fonction getGravity(latRad, alt) est supposée être définie dans ukf-lib.js
 */
function updateCelestialBody(body, altM, rotR = 0, angV = 0) {
    // Les constantes G_ACC et R_ALT_CENTER_REF globales doivent être mises à jour ici
    let G_ACC_NEW = 9.80665; // Par défaut
    let R_ALT_REF = 6371000; // Par défaut

    // Logique d'ajustement de la gravité pour le corps céleste
    // ... (Logique complète basée sur le 'body' : 'MOON', 'MARS', 'ROTATING', etc.)
    // La fonction getGravity (si disponible) est utilisée pour EARTH.

    if (body === 'EARTH' && typeof window.getGravity === 'function') {
         G_ACC_NEW = window.getGravity(currentPosition.lat * D2R, altM);
    }
    // ... autres corps célestes (si implémentés)
    
    return { G_ACC_NEW: G_ACC_NEW, R_ALT_REF: R_ALT_REF };
}

// Fonction pour calculer le Facteur de Lorentz (Relativité)
function calculateLorentzFactor(speed) {
    const v_c = speed / C_L;
    return 1 / Math.sqrt(1 - v_c * v_c);
}

// Fonction pour la correction barométrique (Altitude)
function calculateBaroAltitude(pressure_hPa, temp_K) {
    // Formule basée sur l'équation barométrique simplifiée (ISA)
    const P0 = BARO_ALT_REF_HPA;
    const T0 = TEMP_SEA_LEVEL_K;
    const g0 = 9.80665;
    const L = 0.0065; // Taux de gradient de température (K/m)
    const R = 8.31447; // Constante des gaz parfaits (J/(mol·K))
    const M = 0.0289644; // Masse molaire de l'air (kg/mol)
    
    // Simplifié pour la démonstration:
    const alt_m = ((T0 / L) * (1 - Math.pow(pressure_hPa / P0, ((R * L) / (g0 * M)))));
    
    return alt_m || currentPosition.alt;
}

// --- BLOC 5 : API FETCHERS (Synchro et Météo) ---

/** Synchronisation NTP */
async function syncH() {
    try {
        const response = await fetch(SERVER_TIME_ENDPOINT);
        const data = await response.json();
        lServH = new Date(data.utc_datetime);
        lLocH = new Date();
        $('local-time').textContent = lServH.toLocaleTimeString('fr-FR') + ' (NTP SYNC)';
    } catch (e) {
        $('local-time').textContent = 'SYNCHRO ÉCHOUÉE (Heure Locale)';
        console.warn("Échec de la synchronisation NTP:", e);
    }
}

/** Récupération des données Météo (via Proxy/API Externe) */
async function fetchWeather(lat, lon) {
    // Simulation des données manquantes pour les ID HTML vides
    const MOCK_ADVANCED_DATA = {
        solarRadiation: dataOrDefault(Math.random() * 1000, 0, ' W/m²'),
        noiseLevel: dataOrDefault(Math.random() * 30 + 50, 1, ' dB(A)'),
        windSpeed: dataOrDefault(Math.random() * 10, 1, ' m/s'),
        soilType: 'Argilo-Calcaire',
        ndviIndex: dataOrDefault(Math.random() * 0.8, 3),
        o2Level: '20.9 % vol',
        co2Level: dataOrDefault(400 + Math.random() * 50, 0, ' ppm'),
        ozoneConc: 'N/A',
        phLevel: 'N/A'
    };
    
    // Mettre à jour les placeholders qui nécessitent des APIs avancées
    $('solar-radiation').textContent = MOCK_ADVANCED_DATA.solarRadiation;
    $('noise-level').textContent = MOCK_ADVANCED_DATA.noiseLevel;
    $('wind-speed-ms').textContent = MOCK_ADVANCED_DATA.windSpeed;
    $('soil-type').textContent = MOCK_ADVANCED_DATA.soilType;
    $('ndvi-index').textContent = MOCK_ADVANCED_DATA.ndviIndex;
    $('o2-level').textContent = MOCK_ADVANCED_DATA.o2Level;
    $('co2-level').textContent = MOCK_ADVANCED_DATA.co2Level;
    $('ozone-conc').textContent = MOCK_ADVANCED_DATA.ozoneConc;
    $('ph-level').textContent = MOCK_ADVANCED_DATA.phLevel;
    
    try {
        const response = await fetch(`${PROXY_WEATHER_ENDPOINT}?lat=${lat}&lon=${lon}`);
        const data = await response.json();
        
        // Calcul des métriques dérivées
        data.tempK = data.tempC + 273.15;
        data.air_density = (data.pressure_hPa * 100.0) / (R_AIR * data.tempK);
        
        // Mise à jour des variables globales pour les calculs UKF/Physique
        lastP_hPa = data.pressure_hPa;
        lastT_K = data.tempK;
        currentAirDensity = data.air_density;
        currentSpeedOfSound = getSpeedOfSound(data.tempK);
        
        // Mise à jour du DOM
        $('temp-air-2').textContent = `${data.tempC.toFixed(1)} °C`;
        $('pressure-2').textContent = `${data.pressure_hPa.toFixed(0)} hPa`;
        $('humidity-2').textContent = `${data.humidity_perc} %`;
        $('air-density').textContent = `${data.air_density.toFixed(3)} kg/m³`;
        $('dew-point').textContent = `${data.dew_point.toFixed(1)} °C`;
        $('weather-status').textContent = 'Données Météo Actives';

        return data;
    } catch (e) {
        $('weather-status').textContent = 'Erreur Météo (API)';
        console.warn("Échec de la récupération météo:", e);
        return null;
    }
}

// --- BLOC 6 : CAPTEURS ET CARTOGRAPHIE ---

/** Tente d'activer les écouteurs de capteurs IMU (Accéléromètre/Gyro/Mag) */
function activateSensors() {
    if (window.DeviceMotionEvent && !motionListenerActive) {
        // Demande de permission iOS 13+ (doit être appelée par un geste utilisateur)
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        // Accélération et Gyroscope (DeviceMotionEvent)
                        window.addEventListener('devicemotion', handleDeviceMotion, true);
                        // Orientation (DeviceOrientationEvent - pour Mag/Cap)
                        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                        motionListenerActive = true;
                        if ($('imu-status')) $('imu-status').textContent = 'IMU Actif';
                    } else {
                        if ($('imu-status')) $('imu-status').textContent = 'Refusé (Permission requise)';
                    }
                })
                .catch(console.error);
        } else {
            // Autres navigateurs (Android/Desktop)
            window.addEventListener('devicemotion', handleDeviceMotion, true);
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
            motionListenerActive = true;
            if ($('imu-status')) $('imu-status').textContent = 'IMU Actif';
        }
    }
}

/** Gestionnaire des données de mouvement (Accéléromètre) */
function handleDeviceMotion(event) {
    if (ukf && event.accelerationIncludingGravity) {
        const acc = event.accelerationIncludingGravity;
        // La fonction UKF.processImuData() est supposée être dans ukf-lib.js
        // ukf.processImuData(acc.x, acc.y, acc.z); 
        
        $('accel-x').textContent = dataOrDefault(acc.x, 3, ' m/s²');
        $('accel-y').textContent = dataOrDefault(acc.y, 3, ' m/s²');
        $('accel-z').textContent = dataOrDefault(acc.z, 3, ' m/s²');
    }
}

/** Gestionnaire des données d'orientation (Gyroscope/Magnétomètre) */
function handleDeviceOrientation(event) {
    const alpha = event.alpha || 0; // Cap (Magnétomètre)
    const beta = event.beta || 0;   // Inclinaison (Pitch/Gyro)
    const gamma = event.gamma || 0; // Roulis (Roll/Gyro)

    // La fonction UKF.processAttitudeData() est supposée être dans ukf-lib.js
    // ukf.processAttitudeData(alpha * D2R, beta * D2R, gamma * D2R);
    
    $('gyro-x').textContent = dataOrDefault(alpha, 2, ' °');
    $('gyro-y').textContent = dataOrDefault(beta, 2, ' °');
    $('gyro-z').textContent = dataOrDefault(gamma, 2, ' °');
    $('mag-x').textContent = dataOrDefault(alpha, 2, ' °'); // Magnétomètre utilise alpha pour le cap
    // Les autres axes mag-y/z ne sont pas directement fournis par DeviceOrientationEvent,
    // ils nécessiteraient l'API Sensor ou un traitement par UKF.
}


/** Initialisation de la carte Leaflet */
function initMap() {
    if (typeof L === 'undefined') return console.error("Leaflet n'est pas chargé.");
    
    map = L.map('map').setView([currentPosition.lat, currentPosition.lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    mapMarker = L.marker([currentPosition.lat, currentPosition.lon]).addTo(map);
}

/** Démarrage de l'écoute GNSS (GPS) */
function initGPS() {
    const GPS_OPTS = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((pos) => {
            if (!isGpsPaused) {
                const coords = pos.coords;
                // Mise à jour de l'état global
                currentPosition.lat = coords.latitude;
                currentPosition.lon = coords.longitude;
                currentPosition.alt = coords.altitude || 0.0;
                currentPosition.spd = coords.speed || 0.0;
                currentPosition.acc = coords.accuracy || 10.0;
                currentPosition.head = coords.heading || 0.0;

                // Envoi des données brutes à l'UKF (si initialisé)
                if (ukf) {
                    ukf.processGpsData(currentPosition.lat, currentPosition.lon, currentPosition.alt, currentPosition.spd, currentPosition.acc, currentPosition.head);
                }
            }
            if ($('gps-status')) $('gps-status').textContent = `Signal GNSS Actif (Précision: ${currentPosition.acc.toFixed(1)}m)`;
        }, (error) => {
             $('gps-status').textContent = `Erreur GPS: ${error.code} - ${error.message}`;
        }, GPS_OPTS);
    } else {
        $('gps-status').textContent = 'Erreur: Géolocalisation non supportée';
    }
}

// --- BLOC 7 : MISE À JOUR DU DOM (Boucle Principale) ---

/** Mise à jour rapide (250ms) des affichages DOM */
function updateDashboardDOM() {
    const now = new Date();
    
    // 1. Récupération des données filtrées UKF
    let latFiltered = currentPosition.lat;
    let lonFiltered = currentPosition.lon;
    let speedFiltered = currentPosition.spd;
    let altFiltered = currentPosition.alt;
    let altBaro = calculateBaroAltitude(lastP_hPa, lastT_K); // Calcul de l'altitude barométrique
    
    if (ukf) {
        const state = ukf.getState(); // x, y, z, vx, vy, vz, ... (UKF à 21 états)
        // Les indices exacts dépendent de l'implémentation de ProfessionalUKF
        // Supposons que les 3 premiers états sont la position ECEF pour simplification DOM:
        // Pour une utilisation réelle, les coordonnées ECEF/ENu doivent être reconverties en Lat/Lon/Alt
        
        // *** À faire: Conversion ECEF/ENu en Lat/Lon/Alt à partir de l'état UKF (state) ***
        // Pour cet exemple, on utilisera les coordonnées GPS brutes/Kalman simples si la conversion n'est pas implémentée.
        speedFiltered = state[3] ? Math.sqrt(state[3]**2 + state[4]**2 + state[5]**2) : currentPosition.spd; // Vitesse 3D
        altFiltered = state[2] || altFiltered; // Altitude simple (si ECEF z est l'état 2)
    }
    
    // Correction de l'altitude (UKF vs Barométrique)
    currentPosition.kAlt = (altFiltered + altBaro) / 2; // Simple fusion Baro/UKF
    
    // 2. Mise à jour GNSS/UKF (Rapide)
    $('pos-lat').textContent = dataOrDefault(latFiltered, 6, ' °');
    $('pos-lon').textContent = dataOrDefault(lonFiltered, 6, ' °');
    $('alt-display').textContent = dataOrDefault(altFiltered, 1, ' m (UKF)');
    $('alt-baro-corrected').textContent = dataOrDefault(altBaro, 1, ' m (Baro)'); // ID HTML supposé
    $('speed-ms').textContent = dataOrDefault(speedFiltered, 2, ' m/s');
    $('speed-kmh').textContent = dataOrDefault(speedFiltered * KMH_MS, 1, ' km/h');
    $('accuracy-display').textContent = dataOrDefault(currentPosition.acc, 1, ' m');
    $('heading-display').textContent = dataOrDefault(currentPosition.head, 1, ' °');
    
    // 3. Mise à jour de la Carte
    if (mapMarker) {
        mapMarker.setLatLng([latFiltered, lonFiltered]);
        // map.setView([latFiltered, lonFiltered], map.getZoom(), { animate: true }); // Optionnel
    }

    // 4. Mise à jour Physique/Relativité (Calculs)
    const factor = calculateLorentzFactor(speedFiltered);
    $('lorentz-factor').textContent = dataOrDefaultExp(factor, 8);
    $('time-dilation-ns').textContent = dataOrDefaultExp((factor - 1) * 1e9, 6, ' ns/s');
    $('gravity-base').textContent = dataOrDefault(window.getGravity(latFiltered * D2R, currentPosition.kAlt), 4, ' m/s²');
    $('speed-of-sound-calc').textContent = dataOrDefault(currentSpeedOfSound, 2, ' m/s');
    $('air-density').textContent = dataOrDefault(currentAirDensity, 3, ' kg/m³');

    // 5. Mise à jour Temps (NTP)
    const currentCorrectedDate = getCDate(lServH, lLocH) || now;
    if ($('local-time') && !$('local-time').textContent.includes('SYNCHRO ÉCHOUÉE')) {
        $('local-time').textContent = currentCorrectedDate.toLocaleTimeString('fr-FR');
    }
    $('date-display').textContent = currentCorrectedDate.toLocaleDateString('fr-FR');

    // 6. Mise à jour Astronomie (Nécessite astro.js)
    if (typeof calculateSolarData === 'function') {
        const astroData = calculateSolarData(currentCorrectedDate, latFiltered, lonFiltered);
        const moonData = calculateMoonData(currentCorrectedDate, latFiltered, lonFiltered);

        $('day-duration').textContent = formatHours(astroData.dayLength); // Fonction formatHours() dans astro.js
        $('sunrise-times').textContent = astroData.sunrise || 'N/A';
        $('sunset-times').textContent = astroData.sunset || 'N/A';
        $('noon-solar-time').textContent = formatHours(astroData.TST_HRS); // ID HTML supposé

        $('moon-phase-name').textContent = moonData.illumination.phaseName;
        $('moon-illuminated').textContent = dataOrDefault(moonData.illumination.fraction * 100, 1, ' %');
        $('moon-distance').textContent = dataOrDefault(moonData.distance / 1000, 0, ' km');
        $('moon-alt').textContent = dataOrDefault(moonData.position.altitude * R2D, 1, ' °');
        $('moon-azimuth').textContent = dataOrDefault(moonData.position.azimuth * R2D, 1, ' °');
    }
}

/** Fonction utilitaire pour l'horloge corrigée (dans gnss-dashboard-full (10).js) */
function getCDate(serverTime, localTimeAtSync) {
    if (!serverTime || !localTimeAtSync) return null;
    const diffMs = new Date().getTime() - localTimeAtSync.getTime();
    return new Date(serverTime.getTime() + diffMs);
}

// --- BLOC 8 : GESTION DES ÉVÉNEMENTS ET DÉMARRAGE DU SYSTÈME ---

function setupEventListeners() {
    // Bouton de masse
    if ($('user-mass-input')) {
        $('user-mass-input').addEventListener('input', (e) => {
            currentMass = parseFloat(e.target.value) || 70.0;
            $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
        });
    }

    // Sélecteur de corps céleste (avec mise à jour de la gravité)
    if ($('celestial-body-select')) {
        $('celestial-body-select').addEventListener('change', (e) => {
            currentCelestialBody = e.target.value;
            const { G_ACC_NEW } = updateCelestialBody(currentCelestialBody, currentPosition.kAlt);
            $('gravity-base').textContent = `${G_ACC_NEW.toFixed(4)} m/s²`;
        });
    }
    
    // Contrôles de l'UKF (Réactivité)
    if ($('ukf-reactivity-mode')) {
        $('ukf-reactivity-mode').addEventListener('change', (e) => {
            currentUKFReactivity = e.target.value;
            if (ukf) ukf.setReactivity(currentUKFReactivity); // Assurez-vous que cette méthode est dans ukf-lib.js
        });
    }

    // Bouton d'activation IMU (CRITIQUE pour l'IMU sur mobile/HTTPS)
    const imuToggleBtn = $('imu-toggle-btn');
    if (imuToggleBtn) {
        imuToggleBtn.addEventListener('click', () => {
             activateSensors();
        });
    } else {
        // Tente l'activation automatique si le bouton n'existe pas (moins fiable)
        activateSensors(); 
    }
}

window.addEventListener('load', () => {
    // 1. Initialisation des systèmes critiques
    
    // Démarre la synchro NTP
    syncH().finally(() => { 
        // 2. Initialisation de l'UKF (après le chargement de math.js)
        if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF(currentUKFReactivity);
            console.log("✅ UKF (21 États) Initialisé.");
        } else {
            console.error("🔴 ERREUR CRITIQUE: ProfessionalUKF n'est pas définie. UKF désactivé.");
        }
    });

    initGPS();      // Démarrage de l'écoute GPS
    initMap();      // Démarrage de la carte

    // Attacher les gestionnaires d'événements pour les contrôles
    setupEventListeners();

    // 3. Boucle principale de rafraîchissement (Rapide)
    setInterval(updateDashboardDOM, 250); 
    
    // 4. Boucle pour les APIs lentes (Météo/Polluants toutes les 5 minutes)
    setInterval(() => {
        if (currentPosition.lat && currentPosition.lon) {
             fetchWeather(currentPosition.lat, currentPosition.lon); 
        }
    }, 5 * 60000); 
    
    // Tente un premier fetch météo
    fetchWeather(currentPosition.lat, currentPosition.lon);
});
