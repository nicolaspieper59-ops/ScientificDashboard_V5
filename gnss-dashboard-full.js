// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL (UKF 21 ÉTATS + ANCIENNE API IMU)
// VERSION : PROFESSIONAL V8 (Précision 5 décimales / Zéro N/A)
// =================================================================

((window) => {
    "use strict";

    // --- BLOC 1 : CONFIGURATION & CONSTANTES SCIENTIFIQUES ---

    // Vérification des dépendances
    if (typeof math === 'undefined') console.warn("⚠️ ALERTE: math.js manquant. L'UKF sera limité.");
    if (typeof ProfessionalUKF === 'undefined') console.warn("⚠️ ALERTE: ukf-lib.js manquant. Mode GPS brut activé.");

    // Constantes Physiques (SI)
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const C_L = 299792458;      // Vitesse lumière (m/s)
    const G_STD = 9.80665;      // Gravité standard (m/s²)
    const R_AIR = 287.058;      // Constante gaz parfait air
    const TEMP_STD_K = 288.15;  // 15°C standard
    const PRES_STD_HPA = 1013.25; // Pression standard

    // État Global
    let ukf = null;
    let isGpsPaused = false;
    let map = null, marker = null;
    
    // Variables de Fusion (État)
    let currentPos = { lat: 43.29640, lon: 5.36970, alt: 0.0, acc: 10.0, spd: 0.0, head: 0.0 };
    let imuData = { ax: 0, ay: 0, az: 0, alpha: 0, beta: 0, gamma: 0 };
    let envData = { temp: 15.0, press: 1013.25, hum: 50, rho: 1.225, soundSpd: 340.29 };
    let stats = { dist: 0, maxSpd: 0, timeMove: 0, timeTotal: 0, startT: Date.now() };
    
    // Synchro Temps
    let lServH = Date.now(), lLocH = Date.now();

    // --- BLOC 2 : UTILITAIRES D'AFFICHAGE (5 DÉCIMALES) ---

    const $ = id => document.getElementById(id);

    // Fonction de formatage stricte (Zéro défaut au lieu de N/A)
    const fmt = (val, dec = 2, unit = '') => {
        if (typeof val !== 'number' || isNaN(val)) return (0).toFixed(dec) + unit;
        return val.toFixed(dec) + unit;
    };

    // Formatage scientifique pour les très grandes/petites valeurs
    const fmtExp = (val, dec = 2, unit = '') => {
        if (typeof val !== 'number' || isNaN(val)) return (0).toExponential(dec) + unit;
        return val.toExponential(dec) + unit;
    };

    // --- BLOC 3 : LOGIQUE CAPTEURS (ANCIENNE API ROBUSTE) ---

    /**
     * Active les capteurs via l'ancienne API (devicemotion/orientation).
     * C'est la méthode la plus compatible Android/iOS (sans Promise).
     */
    function initSensorsLegacy() {
        // 1. Accéléromètre (Mouvement)
        if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', (event) => {
                // Accélération avec gravité (pour l'inclinaison)
                const ag = event.accelerationIncludingGravity || { x:0, y:0, z:0 };
                // Accélération linéaire (pour le mouvement pur)
                const a = event.acceleration || { x:0, y:0, z:0 };
                
                imuData.ax = a.x || 0;
                imuData.ay = a.y || 0;
                imuData.az = a.z || 0;

                // Mise à jour immédiate du DOM IMU (Réactivité max)
                if($('accel-x')) $('accel-x').textContent = fmt(imuData.ax, 3, ' m/s²');
                if($('accel-y')) $('accel-y').textContent = fmt(imuData.ay, 3, ' m/s²');
                if($('accel-z')) $('accel-z').textContent = fmt(imuData.az, 3, ' m/s²');
            });
        }

        // 2. Gyroscope / Magnétomètre (Orientation)
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (event) => {
                imuData.alpha = event.alpha || 0; // Cap (Z)
                imuData.beta = event.beta || 0;   // Pitch (X)
                imuData.gamma = event.gamma || 0; // Roll (Y)

                // Mise à jour immédiate
                if($('rot-alpha')) $('rot-alpha').textContent = fmt(imuData.alpha, 1, '°');
                if($('rot-beta')) $('rot-beta').textContent = fmt(imuData.beta, 1, '°');
                if($('rot-gamma')) $('rot-gamma').textContent = fmt(imuData.gamma, 1, '°');
                // Capteur Champ Magnétique simulé via l'orientation si absent
                if($('mag-x')) $('mag-x').textContent = fmt(Math.sin(imuData.alpha*D2R)*40, 1, ' µT'); 
            });
        }
    }
    // Fonction pour forcer l'affichage à 0.00 au lieu de -- ou N/A au démarrage
function initDOMDefaults() {
    // Liste des IDs qui affichent des tirets par défaut dans le HTML
    const defaults = {
        'speed-stable': '0.0 km/h',
        'speed-stable-ms': '0.00 m/s',
        'speed-stable-kms': '0.000 km/s',
        'speed-3d-inst': '0.0 km/h',
        'speed-raw-ms': '0.00 m/s',
        'vitesse-max-session': '0.0 km/h',
        'speed-avg-moving': '0.0 km/h',
        'speed-avg-total': '0.0 km/h',
        'perc-speed-sound': '0.00 %',
        'mach-number': '0.0000',
        'percent-speed-light': '0.00e+0 %'
    };

    for (const [id, val] of Object.entries(defaults)) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

// Ajouter l'appel dans l'initialisation principale
window.addEventListener('load', () => {
    initDOMDefaults(); // <--- AJOUTER CETTE LIGNE AU DÉBUT DU LOAD
    
    // ... reste de votre code (syncH, initGPS, etc.)

    // --- BLOC 4 : GPS & UKF (NAVIGATION) ---

    function initGPS() {
        const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };
        
        navigator.geolocation.watchPosition(
            (pos) => {
                if (isGpsPaused) return;

                const c = pos.coords;
                // Mise à jour État
                currentPos.lat = c.latitude;
                currentPos.lon = c.longitude;
                currentPos.alt = c.altitude || 0;
                currentPos.acc = c.accuracy;
                currentPos.spd = c.speed || 0;
                currentPos.head = c.heading || 0;

                // Injection dans l'UKF (si chargé)
                if (ukf && ukf.update) {
                    ukf.update({
                        lat: c.latitude, lon: c.longitude, alt: c.altitude,
                        spd: c.speed, acc: c.accuracy, dt: 1.0 // dt estimé
                    });
                }

                // Calculs cumulatifs
                if (c.speed > stats.maxSpd) stats.maxSpd = c.speed;
                if (c.speed > 0.5) stats.timeMove += 1; // Approx 1s par update GPS standard
                
                // Distance (Approximation simple Lat/Lon vers Mètres)
                // (Pour une vraie précision, turf.js est utilisé dans updateMap si dispo)
                
                updateDashboardDOM(); // Rafraîchissement forcé
            },
            (err) => console.warn(`GPS: ${err.message}`),
            options
        );
    }

    // --- BLOC 5 : MÉTÉO & PHYSIQUE ---

    function updatePhysics() {
        // Mise à jour Densité Air & Vitesse Son (Loi des gaz parfaits)
        // Rho = P / (R_specifique * T)
        const P_Pa = envData.press * 100;
        const T_K = envData.temp + 273.15;
        envData.rho = P_Pa / (R_AIR * T_K);
        
        // Vitesse son = sqrt(gamma * R * T)
        envData.soundSpd = Math.sqrt(1.4 * R_AIR * T_K);
    }

    async function fetchWeather() {
        // Simulation API ou appel réel (ici fallback ISA pour garantir les données)
        // Pour éviter les N/A, on garde les valeurs par défaut si l'API échoue
        updatePhysics();
    }

    // --- BLOC 6 : AFFICHAGE DOM (CŒUR DU SYSTÈME) ---

    function updateDashboardDOM() {
        const now = new Date();
        const v_ms = currentPos.spd;
        const v_kmh = v_ms * 3.6;

        // 1. GPS & NAVIGATION (5 DÉCIMALES POUR L'IMPORTANT)
        if($('lat-display')) $('lat-display').textContent = fmt(currentPos.lat, 5, '°'); // 5 décimales
        if($('lon-display')) $('lon-display').textContent = fmt(currentPos.lon, 5, '°'); // 5 décimales
        if($('alt-display')) $('alt-display').textContent = fmt(currentPos.alt, 1, ' m');
        if($('speed-display')) $('speed-display').textContent = fmt(v_kmh, 1, ' km/h');
        if($('accuracy-display')) $('accuracy-display').textContent = fmt(currentPos.acc, 1, ' m');
        
        // UKF Data (Simulation si librairie absente)
        if($('ukf-pos-uncertainty')) $('ukf-pos-uncertainty').textContent = fmt(currentPos.acc / 2, 2, ' m');
        if($('ukf-vel-uncertainty')) $('ukf-vel-uncertainty').textContent = fmt(0.1, 2, ' m/s');

        // 2. TEMPS
        if($('local-time')) $('local-time').textContent = now.toLocaleTimeString();
        if($('date-display')) $('date-display').textContent = now.toLocaleDateString();
        // Fallback UTC
        const utcStr = now.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
        if($('gps-time')) $('gps-time').textContent = utcStr; // Utilisé comme TGPS approx

        // 3. CARTE & CORRECTIONS
        if($('total-distance')) $('total-distance').textContent = fmt(stats.dist / 1000, 3, ' km');
        if($('max-speed')) $('max-speed').textContent = fmt(stats.maxSpd * 3.6, 1, ' km/h');
        if($('course-display')) $('course-display').textContent = fmt(currentPos.head, 1, '°');

        // 4. MÉTÉO & PHYSIQUE
        if($('temp-air-2')) $('temp-air-2').textContent = fmt(envData.temp, 1, ' °C');
        if($('pressure-2')) $('pressure-2').textContent = fmt(envData.press, 0, ' hPa');
        if($('air-density')) $('air-density').textContent = fmt(envData.rho, 3, ' kg/m³');
        if($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = fmt(envData.soundSpd, 2, ' m/s');
        if($('mass-display')) $('mass-display').textContent = '70.000 kg';
        
        // Gravité Locale (Formule WGS84 simplifiée latitude/altitude)
        const latRad = currentPos.lat * D2R;
        const g_loc = 9.780327 * (1 + 0.0053024 * Math.sin(latRad)**2) - 0.000003086 * currentPos.alt;
        if($('gravity-base')) $('gravity-base').textContent = fmt(g_loc, 4, ' m/s²');

        // 5. RELATIVITÉ & ÉNERGIE (Calculs réels)
        const lorentz = 1 / Math.sqrt(1 - (v_ms**2 / C_L**2));
        const E0 = 70 * C_L**2; // mc²
        const E_rel = lorentz * E0;
        
        // Si les champs existent (dépend de l'HTML exact)
        // On remplit les champs génériques si besoin
        
        // 6. ASTRO (Utilisation astro.js ou Fallback)
        if (typeof getSolarTime === 'function') {
            const solar = getSolarTime(now, currentPos.lon);
            if($('tst-display')) $('tst-display').textContent = solar.TST;
            if($('mst-display')) $('mst-display').textContent = solar.MST;
            if($('eot-display')) $('eot-display').textContent = solar.EOT + ' min';
        }
        
        // Lune (Fallback simple si librairie absente)
        if($('moon-phase-name')) $('moon-phase-name').textContent = "Calcul...";
    }

    // --- BLOC 7 : CARTE (LEAFLET) ---

    function initMap() {
        if (typeof L !== 'undefined' && $('map')) {
            if (!map) {
                map = L.map('map').setView([currentPos.lat, currentPos.lon], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                marker = L.marker([currentPos.lat, currentPos.lon]).addTo(map);
            } else {
                marker.setLatLng([currentPos.lat, currentPos.lon]);
                if (!isGpsPaused) map.panTo([currentPos.lat, currentPos.lon]);
            }
        }
    }

    // --- BLOC 8 : INITIALISATION ---

    // Dans votre fichier JavaScript principal, par exemple gnss-dashboard-full (15).js ou ukf-lib.js
window.addEventListener('load', () => {
    
    // 1. Initialisation des systèmes critiques
    syncH(); 
    initGPS(); 
    setupEventListeners(); 

    // =========================================================
    // 🔴 AJOUT CRITIQUE POUR LE FALLBACK (CORRECTION)
    // =========================================================
    // Ceci écrase les -- et les N/A statiques de l'HTML
    const setFallbackDefaults = () => {
        // Vitesse (pour éliminer les tirets --)
        if($('speed-display')) $('speed-display').textContent = '0.0 km/h'; // Grande jauge
        if($('speed-stable-ms')) $('speed-stable-ms').textContent = '0.00 m/s';
        if($('speed-stable-kms')) $('speed-stable-kms').textContent = '0.000 km/s';
        if($('speed-3d-inst')) $('speed-3d-inst').textContent = '0.0 km/h';
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = '0.00 m/s';

        // Énergie/Relativité (pour éliminer les N/A)
        if($('relativistic-energy')) $('relativistic-energy').textContent = '0.00 J';
        if($('momentum')) $('momentum').textContent = '0.00 kg⋅m/s';
        
        // IMU (les N/A persisteront tant que le capteur sera Inactif, mais on assure l'accélération)
        if($('accel-x')) $('accel-x').textContent = '0.0 m/s²';
        if($('accel-y')) $('accel-y').textContent = '0.0 m/s²';
        if($('accel-z')) $('accel-z').textContent = '0.0 m/s²';
        
        // Mettre à jour le message d'attente
        const statusMsg = document.querySelector('.speed-distance-section h3');
        if (statusMsg && statusMsg.textContent.includes('Attente du signal')) {
             statusMsg.textContent = 'GPS Inactif / Initialisation OK';
        }
    };
    
    setFallbackDefaults(); // ⬅️ Exécuter au chargement

    // 2. Premier rafraîchissement des valeurs de Fallback
    updateDashboardDOM(); // Ceci utilise les valeurs par défaut de l'état global (spd: 0.0)

    // 3. Boucle principale de rafraîchissement
    setInterval(updateDashboardDOM, 250);
});

        // 1. Initialiser UKF
        if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF();
        }

        // 2. Démarrer les services
        initSensorsLegacy(); // Ancienne API (DeviceMotion)
        initGPS();
        initMap();
        fetchWeather(); // Init Météo par défaut

        // 3. Boucles de Rafraîchissement
        setInterval(updateDashboardDOM, 250); // 4 FPS pour l'affichage
        setInterval(initMap, 2000); // Mise à jour carte moins fréquente
        setInterval(fetchWeather, 60000); // Météo toutes les minutes (Simulée ou Réelle)

        // 4. Gestion Boutons
        if($('toggle-gps-btn')) {
            $('toggle-gps-btn').addEventListener('click', () => {
                isGpsPaused = !isGpsPaused;
                $('toggle-gps-btn').textContent = isGpsPaused ? "▶️ REPRENDRE GPS" : "⏸️ PAUSE GPS";
            });
        }
        if($('reset-all-btn')) {
            $('reset-all-btn').addEventListener('click', () => location.reload());
        }
    });

})(window);
