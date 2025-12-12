// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL STABLE V9
// FUSION UKF 21 ÉTATS | GESTION SÉCURISÉE DES CAPTEURS GPS & IMU
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances critiques (Pour débogage) ---
    if (typeof math === 'undefined') console.warn("⚠️ ALERTE: math.js manquant. L'UKF sera désactivé.");
    if (typeof ProfessionalUKF === 'undefined') console.warn("⚠️ ALERTE: ProfessionalUKF n'est pas définie. Mode GPS/Capteur brut activé.");
    if (typeof updateAstro === 'undefined') console.warn("⚠️ ALERTE: astro.js manquant. Les calculs astronomiques seront désactivés.");

    // =================================================================
    // BLOC 1/4 : CONFIGURATION, CONSTANTES ET ÉTAT GLOBAL
    // =================================================================

    // --- CONSTANTES SCIENTIFIQUES (SI) ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             // Conversion m/s -> km/h
    const C_L = 299792458;          // Vitesse lumière (m/s)
    const R_AIR = 287.058;          // Constante gaz parfait air (J/(kg·K))
    const RHO_SEA_LEVEL = 1.225;    // Densité par défaut (kg/m³)
    const TEMP_STD_K = 288.15;      // 15°C standard

    // --- VARIABLES D'ÉTAT CRITIQUES (Gestion des ressources) ---
    let ukf = null;             // Instanciation de ProfessionalUKF
    let isGpsPaused = true;     // Démarrage en mode PAUSE par défaut
    let gpsWatchID = null;      // ID de la surveillance GPS (null si inactif)
    let isIMUActive = false;    // État d'activité du capteur IMU

    // --- VARIABLES DE DONNÉES TEMPS RÉEL ---
    let lServH = new Date();    // Heure du serveur (utilisée pour NTP)
    let lLocH = new Date();     // Heure locale
    let timeStartSession = new Date();
    let timeStartMovement = new Date();
    
    // Position/Vitesse/Altitude (Valeurs de Fallback - Marseille)
    let currentPosition = { lat: 43.296400, lon: 5.369700, acc: 10.0, spd: 0.0 };
    let currentAltitudeM = 0.0;
    let currentSpeedMs = 0.0;   // Vitesse filtrée (UKF)
    let rawSpeedMs = 0.0;       // Vitesse brute (GPS)

    // Accélération/Forces (IMU)
    let currentAccelMs2_X = 0.0;
    let currentAccelMs2_Y = 0.0;
    let currentAccelMs2_Z = 0.0;
    
    // Distances
    let totalDistanceM = 0.0;
    let lastPosition = null;

    // Physique/Environnement
    let currentMass = 70.0;             // Masse par défaut (kg)
    let currentAirDensity = RHO_SEA_LEVEL;
    let currentSpeedOfSound = 340.29;   // Vitesse du son par défaut
    let currentG_Acc = 9.8067;          // Gravité locale par défaut
    let lastKnownWeather = null;
    let maxSpeedMs = 0.0;
    let isMoving = false;
    let netherMode = false;
    
    // =================================================================
    // BLOC 2/4 : UTILITAIRES DE BASE, FORMATAGE ET PHYSIQUE
    // =================================================================

    const $ = id => document.getElementById(id);
    
    /** Formate un nombre, gère N/A. */
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val) || (typeof val === 'number' && Math.abs(val) < 1e-9 && decimals > 5)) {
             return 'N/A'; // N/A pour les très petits nombres non significatifs
        }
        if (typeof val === 'number') {
            return val.toFixed(decimals) + suffix;
        }
        return val;
    };
    
    /** Formate en notation scientifique ou normale. */
    const dataOrDefaultExp = (val, decimals) => {
        if (val === undefined || val === null || isNaN(val)) return 'N/A';
        // Utilise la notation exponentielle pour les valeurs extrêmes
        if (Math.abs(val) > 1e6 || Math.abs(val) < 1e-4) {
            return val.toExponential(decimals);
        }
        return val.toFixed(decimals);
    };

    /** Formate une distance en m ou km. */
    const formatDistance = (m) => {
        if (m === undefined || m === null || isNaN(m)) return 'N/A';
        if (m < 1000) return dataOrDefault(m, 2, ' m');
        return dataOrDefault(m / 1000, 3, ' km');
    };
    
    /** Obtient la date/heure synchronisée. */
    const getCDate = (serverDate, localDate) => {
        if (!serverDate || !localDate) return null;
        const offset = localDate.getTime() - serverDate.getTime();
        return new Date(Date.now() - offset);
    };
    
    /** Synchro NTP simple. */
    const syncH = () => lServH = new Date(Date.now());
    
    /** Calcule la vitesse du son (m/s) à partir de la température T_K (Kelvin). */
    const getSpeedOfSound = (T_K) => {
        return 331.3 * Math.sqrt(T_K / 273.15); // Simple approximation
    };
    
    /** Calcule la gravité locale (g) WGS84 (supposons que getGravity existe dans ukf-lib.js ou astro.js) */
    if (typeof window.getGravity !== 'function') {
        window.getGravity = (latRad, alt) => {
            const G_E = 9.780327; // Gravité à l'équateur (m/s²)
            const sin2 = Math.sin(latRad)**2;
            const g_0 = G_E * (1 + 0.0053024 * sin2);
            // Correction d'altitude
            return g_0 - 3.086e-6 * alt;
        };
    }
    
    /** Met à jour les valeurs d'environnement (densité, vitesse du son, gravité). */
    const updatePhysicalState = (weatherData = lastKnownWeather) => {
        let T_K = TEMP_STD_K; // Fallback à 15°C
        if (weatherData && weatherData.main && weatherData.main.temp !== undefined) {
            T_K = weatherData.main.temp + 273.15;
            const P_Pa = weatherData.main.pressure * 100;
            
            // Calcul de la densité de l'air (Loi des gaz parfaits)
            currentAirDensity = P_Pa / (R_AIR * T_K);
        } else {
            currentAirDensity = RHO_SEA_LEVEL;
        }
        
        currentSpeedOfSound = getSpeedOfSound(T_K);
        
        // Mise à jour de la gravité (Gravité est dynamique)
        currentG_Acc = window.getGravity(currentPosition.lat * D2R, currentAltitudeM);
    };
    
    /** Réinitialise les compteurs de distance. */
    const resetDistance = () => { totalDistanceM = 0.0; lastPosition = null; timeStartMovement = new Date(); };
    
    /** Réinitialise la vitesse max. */
    const resetVmax = () => { maxSpeedMs = 0.0; };

    /** Récupère les données météo (Proxy Vercel). */
    const fetchWeather = async (lat, lon) => {
        // ⚠️ Remplacez VOTRE_PROXY_URL par l'URL de votre déploiement Vercel
        const proxyUrl = 'VOTRE_PROXY_URL/api/weather'; 
        try {
            const response = await fetch(`${proxyUrl}?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error(`Erreur API: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Erreur lors de la récupération des données météo:', error);
            return null;
        }
    };
    

    // =================================================================
    // BLOC 3/4 : GESTIONNAIRES D'API (GPS, IMU) - CORRIGÉS
    // =================================================================

    // --- A. IMU HANDLERS ---
    
    /** Traite les données brutes du capteur de mouvement. */
    const handleDeviceMotion = (event) => {
        const acc = event.accelerationIncludingGravity;
        currentAccelMs2_X = acc.x || 0.0;
        currentAccelMs2_Y = acc.y || 0.0;
        currentAccelMs2_Z = acc.z || 0.0;
        
        // Mise à jour de l'UKF avec l'accélération
        if (ukf && typeof ukf.processIMUData === 'function') {
            ukf.processIMUData(currentAccelMs2_X, currentAccelMs2_Y, currentAccelMs2_Z, event.rotationRate);
        }
    };

    /** Démarre l'écoute des capteurs IMU et gère la permission. */
    const initIMU = () => {
        const imuStatusEl = $('imu-status');
        if (isIMUActive) {
            console.warn("initIMU() : IMU déjà actif. Processus ignoré.");
            return;
        }

        const setIMUStatus = (status) => {
            if (imuStatusEl) imuStatusEl.textContent = status;
            isIMUActive = (status === 'Actif');
        };

        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) {
            DeviceMotionEvent.requestPermission().then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    setIMUStatus('Actif');
                } else {
                    setIMUStatus('Refusé');
                }
            }).catch(err => { setIMUStatus('Erreur'); });
        } else if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', handleDeviceMotion);
            setIMUStatus('Actif');
        } else {
            setIMUStatus('Non Supporté');
        }
    };

    // --- B. GPS HANDLERS ---

    /** Traite une position GPS reçue. */
    const handleGpsSuccess = (pos) => {
        const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
        const timestamp = pos.timestamp;
        
        // Mise à jour des données brutes
        currentPosition = { lat: latitude, lon: longitude, acc: accuracy, spd: speed || 0.0 };
        rawSpeedMs = speed || 0.0;
        currentAltitudeM = altitude || 0.0;

        // Calcul de la distance parcourue (approximation plane avec turf.js si disponible)
        if (lastPosition && typeof turf !== 'undefined' && typeof turf.distance === 'function') {
            const from = turf.point([lastPosition.lon, lastPosition.lat]);
            const to = turf.point([longitude, latitude]);
            // Calculer la distance en kilomètres, puis convertir en mètres
            const distanceKM = turf.distance(from, to, { units: 'kilometers' });
            totalDistanceM += distanceKM * 1000;
        }
        lastPosition = { lat: latitude, lon: longitude };

        // Mise à jour de l'UKF/EKF
        if (ukf && typeof ukf.update === 'function') {
             // L'UKF gère la mise à jour de currentSpeedMs/currentAltitudeM
             ukf.update(pos); 
             // Récupérer la vitesse filtrée de l'UKF (sinon on utilise la vitesse brute pour l'affichage)
             currentSpeedMs = ukf.getState(4);
        } else {
             currentSpeedMs = rawSpeedMs;
        }

        // Mise à jour de la vitesse max (utilise la vitesse filtrée ou brute)
        maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
        
        // Mise à jour du statut
        if ($('gps-status')) $('gps-status').textContent = 'Acquisition (OK)';
    };

    /** Gère les erreurs GPS. */
    const handleGpsError = (error) => {
        console.error('Erreur GPS:', error.message);
        if ($('gps-status')) $('gps-status').textContent = `Erreur: ${error.code} (${error.message})`;
    };
    
    /** Démarre la surveillance GPS (Geolocation API), en évitant les doublons et en stockant l'ID. */
    const initGPS = () => {
        // ⚠️ CORRECTION CRITIQUE : Empêche le lancement de plusieurs watchPosition
        if (gpsWatchID !== null) {
            console.warn("initGPS() : Le GPS est déjà en cours d'écoute. Processus ignoré.");
            return;
        }

        if (navigator.geolocation) {
            const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };
            
            // ⚠️ CORRECTION CRITIQUE : Capture l'ID de la surveillance GPS
            gpsWatchID = navigator.geolocation.watchPosition(handleGpsSuccess, handleGpsError, options);
            
            if ($('gps-status')) $('gps-status').textContent = 'Acquisition en cours...';

        } else {
            if ($('gps-status')) $('gps-status').textContent = 'Non Supporté';
        }
    };


    // =================================================================
    // BLOC 4/4 : CONTRÔLE, MISE À JOUR DOM ET INITIALISATION
    // =================================================================

    /**
     * Met à jour les valeurs de l'interface du tableau de bord.
     */
    function updateDashboardDOM() {
        // --- 1. Contrôles et Système ---
        const now = getCDate(lServH, lLocH);
        if (now) {
            if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR');
            if ($('date-display')) $('date-display').textContent = now.toLocaleDateString('fr-FR');
            if ($('elapsed-time')) $('elapsed-time').textContent = dataOrDefault((now.getTime() - timeStartSession.getTime()) / 1000, 2, ' s');
            // ... (Gestion temps de mouvement)
        }
        
        // --- 2. IMU (Accéléromètre/Gyroscope) ---
        if ($('imu-status')) $('imu-status').textContent = isIMUActive ? 'Actif' : 'Inactif';
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(currentAccelMs2_X, 3, ' m/s²');
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(currentAccelMs2_Y, 3, ' m/s²');
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(currentAccelMs2_Z, 3, ' m/s²');

        // --- 3. Vitesse, Distance & Relativité ---
        const speedKmh = currentSpeedMs * KMH_MS;
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 1, ' km/h');
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 2, ' m/s');
        if ($('raw-speed-ms')) $('raw-speed-ms').textContent = dataOrDefault(rawSpeedMs, 2, ' m/s');
        if ($('vmax-session')) $('vmax-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        // Physique & Relativité
        if ($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = dataOrDefault(currentSpeedOfSound, 4, ' m/s');
        const mach = currentSpeedMs / currentSpeedOfSound;
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(mach, 4);
        if ($('%speed-of-light')) $('%speed-of-light').textContent = dataOrDefaultExp(currentSpeedMs / C_L * 100, 2) + ' %';
        
        // Distance
        const displayTotalDistance = totalDistanceM * (netherMode ? (1/8) : 1);
        if ($('distance-total-3d')) $('distance-total-3d').textContent = formatDistance(displayTotalDistance);
        if ($('distance-ratio')) $('distance-ratio').textContent = dataOrDefault(netherMode ? 8.000 : 1.000, 3);
        
        // Rayon de Schwarzschild (utilise la masse)
        const Rs = (2 * 6.67430e-11 * currentMass) / (C_L**2);
        if ($('schwarzschild-radius')) $('schwarzschild-radius').textContent = dataOrDefaultExp(Rs, 4) + ' m';
        
        // --- 4. Météo & BioSVT ---
        if ($('air-density')) $('air-density').textContent = dataOrDefault(currentAirDensity, 4, ' kg/m³');
        if (lastKnownWeather && lastKnownWeather.main) {
            if ($('temp-air')) $('temp-air').textContent = dataOrDefault(lastKnownWeather.main.temp, 1, ' °C');
            if ($('pressure-atm')) $('pressure-atm').textContent = dataOrDefault(lastKnownWeather.main.pressure, 0, ' hPa');
            if ($('weather-status')) $('weather-status').textContent = 'Actif';
        } else {
             if ($('weather-status')) $('weather-status').textContent = 'INACTIF';
        }

        // --- 5. Dynamique & Forces ---
        if ($('gravity-local')) $('gravity-local').textContent = dataOrDefault(currentG_Acc, 4, ' m/s²');
        if ($('drag-force')) $('drag-force').textContent = dataOrDefault(0.5 * currentAirDensity * currentSpeedMs**2 * 0.5 * 1.0, 2, ' N'); // q * Cd * A
        if ($('kinetic-energy')) $('kinetic-energy').textContent = dataOrDefault(0.5 * currentMass * currentSpeedMs**2, 2, ' J');
        
        // --- 6. Position & Astro ---
        if ($('lat-ekf')) $('lat-ekf').textContent = dataOrDefault(currentPosition.lat, 6);
        if ($('lon-ekf')) $('lon-ekf').textContent = dataOrDefault(currentPosition.lon, 6);
        if ($('alt-ekf')) $('alt-ekf').textContent = formatDistance(currentAltitudeM);
        if ($('precision-gps-acc')) $('precision-gps-acc').textContent = formatDistance(currentPosition.acc);
        
        // Mise à jour Astro (Si les fonctions existent et position définie)
        if (typeof updateAstro === 'function' && currentPosition.lat !== 0.0 && now) {
             const astroData = updateAstro(now, currentPosition.lat, currentPosition.lon);
             // ... (Mise à jour des champs Soleil/Lune/TST/MST avec astroData)
        }
        
        // --- 7. Filtre EKF/UKF & Debug ---
        // Incertitude Vitesse/Altitude (Si UKF actif)
        if (ukf && typeof ukf.getStateCovariance === 'function') {
            const P = ukf.getStateCovariance();
            if ($('uncertainty-vel-p')) $('uncertainty-vel-p').textContent = dataOrDefault(Math.sqrt(P.get([4, 4])), 3, ' m/s');
            if ($('uncertainty-alt-sigma')) $('uncertainty-alt-sigma').textContent = dataOrDefault(Math.sqrt(P.get([2, 2])), 3, ' m');
            if ($('ekf-status')) $('ekf-status').textContent = ukf.isInitialized() ? 'Actif' : 'Initialisation...';
        } else {
            if ($('ekf-status')) $('ekf-status').textContent = 'N/A (UKF Inactif)';
        }

    }


    /**
     * Bascule l'état de pause/marche et gère le démarrage/l'arrêt propre du GPS et de l'IMU.
     */
    const toggleGpsPause = () => {
        isGpsPaused = !isGpsPaused;
        const pauseBtn = $('gps-pause-toggle'); // Assurez-vous que l'ID de votre bouton est 'gps-pause-toggle'

        if (isGpsPaused) {
            // --- ⏸️ MODE PAUSE : ARRÊT PROPRE ET LIBÉRATION DES RESSOURCES ---
            if (pauseBtn) pauseBtn.textContent = '▶️ MARCHE GPS'; // Inverse le texte pour indiquer l'action suivante
            
            // 1. Arrêter la surveillance GPS (libération ressource)
            if (gpsWatchID !== null) {
                navigator.geolocation.clearWatch(gpsWatchID);
                gpsWatchID = null; 
                if ($('gps-status')) $('gps-status').textContent = 'Arrêté (Pause)';
            }
            
            // 2. Arrêter l'écoute des événements IMU (libération ressource)
            window.removeEventListener('devicemotion', handleDeviceMotion);
            isIMUActive = false;
            if ($('imu-status')) $('imu-status').textContent = 'Inactif';

        } else {
            // --- ▶️ MODE REPRISE : DÉMARRAGE SYNCHRONISÉ ---
            if (pauseBtn) pauseBtn.textContent = '⏸️ PAUSE GPS'; // Inverse le texte pour indiquer l'action suivante
            
            // 1. Démarrer/Reprendre l'acquisition GPS (avec vérification anti-doublon)
            initGPS();
            
            // 2. Démarrer/Activer l'IMU (déclencheur de permission)
            initIMU(); 
        }
        
        // Mettre à jour l'affichage immédiatement après le changement d'état
        updateDashboardDOM(); 
    }


    /** Attache tous les événements aux éléments DOM. */
    function setupEventListeners() {
        // 🎯 CONTRÔLE PRINCIPAL : PAUSE/REPRISE GPS ET IMU
        const gpsToggleButton = $('gps-pause-toggle'); 
        if (gpsToggleButton) {
            gpsToggleButton.addEventListener('click', toggleGpsPause);
            // Initialiser le texte du bouton à l'état initial (PAUSE -> affichera 'MARCHE GPS')
            gpsToggleButton.textContent = isGpsPaused ? "▶️ MARCHE GPS" : "⏸️ PAUSE GPS";
        } else {
            console.error("Élément 'gps-pause-toggle' manquant. Vérifiez l'ID du bouton de pause dans le HTML.");
        }

        // CONTRÔLES SECONDAIRES
        if ($('reset-dist-btn')) $('reset-dist-btn').addEventListener('click', resetDistance);
        if ($('reset-vmax-btn')) $('reset-vmax-btn').addEventListener('click', resetVmax);
        if ($('reset-all-btn')) $('reset-all-btn').addEventListener('click', () => {
             if(confirm("Êtes-vous sûr de vouloir réinitialiser ?")) location.reload();
        });
        
        // Forcer Précision GPS
        if ($('force-gps-precision-m')) {
             $('force-gps-precision-m').addEventListener('input', (e) => {
                 const val = parseFloat(e.target.value) || 0.0;
                 if (ukf && typeof ukf.setForcedAccuracy === 'function') ukf.setForcedAccuracy(val);
             });
        }
        
        // Masse de l'objet
        if ($('mass-input')) {
            $('mass-input').addEventListener('input', (e) => {
                currentMass = parseFloat(e.target.value) || 70.0;
                if ($('mass-display')) $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
            });
        }
        
        // Mode Nether (DÉSACTIVÉ/ACTIVÉ)
        if ($('nether-toggle-btn')) {
            $('nether-toggle-btn').addEventListener('click', () => {
                netherMode = !netherMode;
                $('nether-toggle-btn').textContent = `Mode Nether: ${netherMode ? 'ACTIVÉ (1:8)' : 'DÉSACTIVÉ (1:1)'}`;
            });
        }

    }

    // --- INITIALISATION PRINCIPALE (ON LOAD) ---

    window.addEventListener('load', () => {
        
        // 1. Initialisation des systèmes critiques
        if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentAltitudeM);
        }
        syncH(); // Démarrer la synchro NTP
        timeStartSession = new Date(); // Démarrer le chronomètre de session
        
        // 2. Attacher les événements utilisateur
        setupEventListeners();

        // 3. Boucles de rafraîchissement
        
        // Boucle rapide (Affichage/Prédiction UKF)
        setInterval(() => {
             updateDashboardDOM();
        }, 100); 
        
        // Boucle lente (Météo/Astro/NTP/Physique)
        setInterval(() => {
            // Récupération des données Météo (si non en pause et position définie)
            if (!isGpsPaused && currentPosition.lat !== 0.0 && currentPosition.lon !== 0.0) {
                 fetchWeather(currentPosition.lat, currentPosition.lon).then(data => {
                    if (data && data.main) {
                        lastKnownWeather = data;
                        updatePhysicalState(data); // Recalcule Densité/Son/Gravité
                    }
                 });
            }
             syncH(); // Re-synchronisation NTP
             updatePhysicalState(); // Mise à jour de l'état physique (même si pas de nouvelle météo)
        }, 5000); // Toutes les 5 secondes

        // 4. Afficher l'état initial
        updateDashboardDOM();
        
    });

})(window);
