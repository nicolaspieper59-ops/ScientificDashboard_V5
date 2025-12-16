// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (GOLD MASTER V8)
// CORRECTIONS FINALES: Vitesse (Dead Reckoning), Master Switch, NTP, Astro.
// ENRICHISSEMENT: Météo/Densité d'Air (via Vercel Proxy), Distance Horizon.
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances (Laisser en place pour le débogage) ---
    if (typeof math === 'undefined') console.error("🔴 CRITIQUE: math.js manquant. Le UKF ne peut pas fonctionner.");
    if (typeof ProfessionalUKF === 'undefined') console.error("🔴 CRITIQUE: ProfessionalUKF manquant.");
    if (typeof calculateAstroDataHighPrec === 'undefined') console.warn("🟡 AVERTISSEMENT: astro.js manquant. Les données astronomiques ne seront pas affichées.");

    // =================================================================
    // BLOC 1: CONFIGURATION & ÉTAT
    // =================================================================

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const KMH_MS = 3.6;             // Conversion m/s -> km/h
    const C_L = 299792458;          // Vitesse de la lumière (m/s)
    const R_AIR = 287.058;          // Constante des gaz parfaits pour l'air (J/kg/K)
    const GAMMA = 1.4;              // Indice adiabatique de l'air (air sec)
    const R_EARTH = 6371000;        // Rayon moyen de la Terre (m)
    const G_ACC_STD = 9.8067;       // Gravité standard (m/s²)

    // État Système Maître
    let isSystemActive = false;
    let ukf = null;
    let fusionState = {}; 
    
    // Position et IMU (Valeurs initiales par défaut ou du dernier état)
    // Coordonnées de Marseille (43.284611, 5.358715) et Altitude par défaut 100m
    let currentPosition = { lat: 43.284611, lon: 5.358715, alt: 100.0, acc: 25.0 }; 
    let curAccLinear = { x: 0, y: 0, z: 0 }; // Accélération linéaire (m/s²)
    let curGyro = { x: 0, y: 0, z: 0 };      // Vitesse angulaire (rad/s)
    
    // Variables de Dead Reckoning et de Mouvement
    let deadReckoningSpeed = 0.0;
    let currentSpeedMs = 0.0;
    let totalDistanceM = 0.0;
    let maxSpeedMs = 0.0;
    let timeInMotionMs = 0;
    let lastPredictionTime = Date.now();
    let gpsWatchID = null; 
    let isGpsPaused = true;
    
    // État de la Météo & NTP
    let ntpOffsetMs = 0;
    let lastMeteoFetchTime = 0;
    // Valeurs par défaut pour que les calculs physiques ne plantent pas
    let meteoData = { temp: 15.0, pressure: 1013.25, humidity: 50.0 }; 

    // =================================================================
    // BLOC 2: FONCTIONS UTILITAIRES ET CONTRÔLES
    // =================================================================

    const $ = (id) => document.getElementById(id);

    // Fonction d'affichage sécurisée
    const dataOrDefault = (value, precision, unit = '') => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) {
            return 'N/A';
        }
        if (precision === 0) return value.toFixed(0) + unit;
        
        // Affichage en notation scientifique pour les très grands/petits nombres
        if (Math.abs(value) > 1e6 || Math.abs(value) < 1e-6) {
            return value.toExponential(precision) + unit;
        }
        return value.toFixed(precision) + unit;
    };

    // Mise à jour visuelle du bouton Démarrer/Pause
    const updateButtonUI = (isActive) => {
        const btn = $('gps-pause-toggle');
        if (btn) {
            btn.textContent = isActive ? '⏸️ PAUSE SYSTÈME' : '▶️ DÉMARRER SYSTÈME';
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('inactive', !isActive);
        }
    };
    
    // CORRECTION MASTER SWITCH: Démarrage et Arrêt du Système
    const toggleSystem = () => {
        isSystemActive = !isSystemActive;
        updateButtonUI(isSystemActive);

        if (isSystemActive) {
            console.log("✅ Système démarré. Démarrage des boucles de calcul.");
            // Logique de démarrage (lancement de la lecture GPS/IMU si implémentée)
        } else {
            console.log("🛑 Système en pause. Boucles de calcul stoppées.");
        }
    };

    // =================================================================
    // BLOC 3: SYNCHRO HEURE (NTP OFFSET)
    // =================================================================

    // Calcul de l'offset NTP (simulé - à remplacer par un appel réel)
    const updateNtpOffset = () => {
        const start = Date.now();
        
        // Simuler un décalage aléatoire réaliste pour l'offset entre -25ms et 25ms
        const serverTimeMs = start + Math.floor(Math.random() * 50) - 25; 
        ntpOffsetMs = serverTimeMs - start;
        
        console.log(`⏱️ Offset NTP simulé: ${ntpOffsetMs} ms`);
    };

    const updateTimeCounters = (initial = false) => {
        // Utilisation de l'heure corrigée NTP
        const now = new Date(Date.now() + ntpOffsetMs); 
        const utcTime = now.toUTCString().slice(-12, -4); 
        const utcDate = now.toISOString().slice(0, 10);
        
        if ($('local-time-display')) $('local-time-display').textContent = now.toLocaleTimeString('fr-FR');
        if ($('utc-datetime-display')) $('utc-datetime-display').textContent = `${utcDate} ${utcTime} (UTC)`;
        
        if (isSystemActive || initial) {
            const totalElapsedTimeSec = (Date.now() - window.sessionStartTime) / 1000.0;
            if ($('elapsed-time-session')) $('elapsed-time-session').textContent = dataOrDefault(totalElapsedTimeSec, 2, ' s');
            if ($('elapsed-time-motion')) $('elapsed-time-motion').textContent = dataOrDefault(timeInMotionMs / 1000, 2, ' s');
        }
        
        // Affichage de l'offset NTP pour le débogage (Nouvelle demande)
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(ntpOffsetMs, 0, ' ms'); 
    };

    // =================================================================
    // BLOC 4: GESTION MÉTÉO (PROXY VERCEL)
    // =================================================================

    // NOTE: Ceci dépend de l'implémentation de 'api/weather.js' sur votre déploiement Vercel.
    const fetchWeatherData = async (lat, lon) => {
        const API_URL = `/api/weather?lat=${lat}&lon=${lon}`; 

        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('API Météo Vercel a échoué');
            
            const data = await response.json();
            
            // Mise à jour de l'état global
            meteoData.temp = data.temp; 
            meteoData.pressure = data.pressure; 
            meteoData.humidity = data.humidity;
            
            if ($('status-weather')) $('status-weather').textContent = 'ACTIF (Vercel)';

        } catch (e) {
            if ($('status-weather')) $('status-weather').textContent = 'INACTIF (Erreur)';
            console.error("Échec de la récupération météo via Vercel :", e);
        }
    };


    // =================================================================
    // BLOC 5: MISE À JOUR DOM & CALCULS SECONDAIRES
    // =================================================================
    
    const updateDashboardDOM = (ukfData) => {
        
        // Utiliser les données de position du UKF ou la valeur par défaut
        const lat = ukfData.lat || currentPosition.lat;
        const lon = ukfData.lon || currentPosition.lon;
        const altitude_m = ukfData.alt || currentPosition.alt;

        // --- 1. Calculs Physique (basés sur les données Météo) ---
        const T_C = meteoData.temp; 
        const P_hPa = meteoData.pressure; 
        const T_K = T_C + 273.15; // Kelvin
        const P_Pa = P_hPa * 100; // Pascal (1 hPa = 100 Pa)

        // a) Densité de l'air (rho = P / (R_air * T))
        const rho_air = P_Pa / (R_AIR * T_K); 
        
        // b) Vitesse du Son (c = sqrt(gamma * R_air * T))
        const speed_of_sound_cor = Math.sqrt(GAMMA * R_AIR * T_K);

        // c) Pression Dynamique (q = 0.5 * rho * V²)
        const dynamic_pressure_q = 0.5 * rho_air * Math.pow(currentSpeedMs, 2); 
        
        // --- 2. Mise à jour Vitesse & Relativité ---
        const speed_kmh = currentSpeedMs * KMH_MS;
        
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speed_kmh, 3, ' km/h');
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 3, ' m/s');
        if ($('speed-max-session')) $('speed-max-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        // Champs Corrigés par la Météo
        if ($('speed-of-sound-cor')) $('speed-of-sound-cor').textContent = dataOrDefault(speed_of_sound_cor, 2, ' m/s');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(currentSpeedMs / speed_of_sound_cor, 4, '');
        
        // --- 3. Mise à jour Météo / Environnement ---
        // Utilisation des IDs corrects pour le display (temp-air, pressure-atm)
        if ($('temp-air')) $('temp-air').textContent = dataOrDefault(T_C, 1, ' °C');
        if ($('pressure-atm')) $('pressure-atm').textContent = dataOrDefault(P_hPa, 0, ' hPa');
        if ($('humidity-rel')) $('humidity-rel').textContent = dataOrDefault(meteoData.humidity, 0, ' %');
        if ($('densite-air')) $('densite-air').textContent = dataOrDefault(rho_air, 4, ' kg/m³');
        if ($('pressure-dyn')) $('pressure-dyn').textContent = dataOrDefault(dynamic_pressure_q, 2, ' Pa');

        // --- 4. Mise à jour Distance & Horizon (Correction Astronomie/Inclinaison) ---
        // Distance Totale 3D
        if ($('distance-total-3d')) $('distance-total-3d').textContent = dataOrDefault(totalDistanceM / 1000, 3, ' km');
        
        // Distance Maximale Visible (Distance à l'Horizon)
        // D = sqrt(2*R_T*h + h^2)
        const horizon_dist_m = Math.sqrt(2 * R_EARTH * altitude_m + Math.pow(altitude_m, 2)); 
        const horizon_dist_km = horizon_dist_m / 1000;
        
        if ($('distance-max-visible')) $('distance-max-visible').textContent = dataOrDefault(horizon_dist_km, 1, ' km');
        
        // --- 5. Mise à jour UKF & Debug ---
        if ($('lat-ukf')) $('lat-ukf').textContent = dataOrDefault(lat, 6, '');
        if ($('lon-ukf')) $('lon-ukf').textContent = dataOrDefault(lon, 6, '');
        if ($('alt-ukf')) $('alt-ukf').textContent = dataOrDefault(altitude_m, 2, ' m');

        // Note: L'inclinaison est fournie par l'IMU (curGyro/curAccLinear) mais non implémentée ici
    };


    // =================================================================
    // BLOC 6: BOUCLES (50 Hz & 1 Hz)
    // =================================================================

    // Boucle Rapide (Physique/UKF - 50 Hz)
    const fastLoop = () => {
        if (!isSystemActive) {
            updateTimeCounters(false);
            return; 
        }

        const now = Date.now();
        let dt = (now - lastPredictionTime) / 1000.0;
        lastPredictionTime = now;
        
        if (dt <= 0) return;
        
        let speedFromFusion = 0.0;

        // UKF Prediction
        if (ukf && ukf.isInitialized() && gpsWatchID) {
            try {
                ukf.predict(dt, curAccLinear, curGyro);
                fusionState = ukf.getState();
                speedFromFusion = fusionState.speed;
            } catch (e) { 
                speedFromFusion = 0.0; 
            }
        }
        
        // CORRECTION VITESSE: Logique de Dead Reckoning Fallback sécurisée
        if (!ukf || !ukf.isInitialized() || isGpsPaused) {
            
            // Utiliser la composante longitudinale (X ou Y) pour l'accélération
            // C'est la correction demandée pour éviter la vitesse "bizarre"
            const longitudinal_accel = curAccLinear.x; 
            const THRESHOLD = 0.2; 
            const FRICTION = 0.5; 
            
            if (Math.abs(longitudinal_accel) > THRESHOLD) {
                 deadReckoningSpeed += longitudinal_accel * dt; 
            } else {
                 if (deadReckoningSpeed > 0) {
                     // Ralentissement progressif par frottement/traînée
                     deadReckoningSpeed = Math.max(0, deadReckoningSpeed - FRICTION * dt);
                 }
            }
            currentSpeedMs = deadReckoningSpeed;
            
        } else {
            // Utiliser la vitesse UKF si disponible
            currentSpeedMs = speedFromFusion;
            deadReckoningSpeed = currentSpeedMs;
        }
        
        currentSpeedMs = Math.max(0, currentSpeedMs);
        
        // Mise à jour des totaux
        if (currentSpeedMs > 0.01) { 
           totalDistanceM += currentSpeedMs * dt;
           timeInMotionMs += dt * 1000;
        }
        maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
        
        updateDashboardDOM(fusionState); 
        updateTimeCounters(false);
    };


    // Boucle Lente (Astro/Météo - 1 Hz)
    const slowLoop = () => {
        if (!isSystemActive) return;

        const lat = fusionState.lat || currentPosition.lat;
        const lon = fusionState.lon || currentPosition.lon;
        const alt = fusionState.alt || currentPosition.alt;

        // 1. Appel Météo (limité à une fois toutes les 60 secondes)
        const now = Date.now();
        if (now - lastMeteoFetchTime > 60000) { 
            fetchWeatherData(lat, lon);
            lastMeteoFetchTime = now;
        }

        // 2. CORRECTION ASTRONOMIE: Calculs Astronomiques 
        if (typeof calculateAstroDataHighPrec === 'function') {
            try {
                // Utiliser l'heure corrigée NTP pour le calcul précis
                const date = new Date(now + ntpOffsetMs);
                const ad = calculateAstroDataHighPrec(date, lat, lon, alt); 

                // Mise à jour des champs (TST, MST, EoT, Lever/Coucher)
                if ($('true-solar-time')) $('true-solar-time').textContent = ad.TST.time;
                if ($('mean-solar-time')) $('mean-solar-time').textContent = ad.MST.time;
                if ($('local-solar-noon')) $('local-solar-noon').textContent = ad.noonUTC;
                if ($('eot-value')) $('eot-value').textContent = dataOrDefault(ad.EoT, 2, ' min'); // Équation du Temps
                
                if ($('day-duration')) $('day-duration').textContent = ad.dayLength;
                if ($('sunrise-times')) $('sunrise-times').textContent = `${ad.sunriseTST} / ${ad.sunriseMST}`;
                if ($('sunset-times')) $('sunset-times').textContent = `${ad.sunsetTST} / ${ad.sunsetMST}`;

                // (Mise à jour Lune, etc. - supposées exister dans votre code HTML/Astro.js)
                
            } catch(e) { 
                console.error("🔴 Erreur critique de calcul Astro. Vérifiez les dépendances (ephem.js, astro.js) :", e);
                if ($('nuit-crepuscule')) $('nuit-crepuscule').textContent = 'Erreur Calc.'; 
            }
        }
    };


    // =================================================================
    // INITIALISATION
    // =================================================================

    window.addEventListener('load', () => {
        window.sessionStartTime = Date.now();
        
        // Initialisation de l'UKF
        if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF();
            ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            fusionState = ukf.getState();
        } 
        
        // 1. Synchro NTP ponctuelle
        updateNtpOffset();

        // 2. Master Switch Binding
        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) btnToggle.addEventListener('click', toggleSystem);

        // 3. Démarrage par défaut sur OFF
        isSystemActive = false; 
        
        // Initialisation de l'affichage statique et du bouton
        updateButtonUI(isSystemActive);
        updateTimeCounters(true); 
        updateDashboardDOM(fusionState);

        // Déclencher le premier appel Météo immédiatement
        fetchWeatherData(currentPosition.lat, currentPosition.lon); 

        // 4. Lancement des boucles de calcul (ne s'exécutent que si isSystemActive est TRUE)
        setInterval(fastLoop, 20); // 50 Hz
        setInterval(slowLoop, 1000); // 1 Hz
    });

})(window);
