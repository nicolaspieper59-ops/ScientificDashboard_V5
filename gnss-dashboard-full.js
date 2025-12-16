// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL UNIFIÉ (GOLD MASTER V9)
// CORRECTIONS: Affichage de l'heure et NTP avant activation.
// NOUVEAU: Compteur de temps Minecraft (logique intégrée).
// =================================================================

((window) => {
    "use strict";

    // --- Vérification des dépendances ---
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
    let currentPosition = { lat: 43.284611, lon: 5.358715, alt: 100.0, acc: 25.0 }; 
    let curAccLinear = { x: 0, y: 0, z: 0 }; 
    let curGyro = { x: 0, y: 0, z: 0 };      
    
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
    let meteoData = { temp: 15.0, pressure: 1013.25, humidity: 50.0 }; 

    // =================================================================
    // BLOC 2: FONCTIONS UTILITAIRES ET CONTRÔLES
    // =================================================================

    const $ = (id) => document.getElementById(id);

    const dataOrDefault = (value, precision, unit = '') => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) {
            return 'N/A';
        }
        if (precision === 0) return value.toFixed(0) + unit;
        
        if (Math.abs(value) > 1e6 || Math.abs(value) < 1e-6) {
            return value.toExponential(precision) + unit;
        }
        return value.toFixed(precision) + unit;
    };

    const updateButtonUI = (isActive) => {
        const btn = $('gps-pause-toggle');
        if (btn) {
            btn.textContent = isActive ? '⏸️ PAUSE SYSTÈME' : '▶️ DÉMARRER SYSTÈME';
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('inactive', !isActive);
        }
    };
    
    const toggleSystem = () => {
        isSystemActive = !isSystemActive;
        updateButtonUI(isSystemActive);

        if (isSystemActive) {
            console.log("✅ Système démarré. Démarrage des boucles de calcul.");
        } else {
            console.log("🛑 Système en pause. Boucles de calcul stoppées.");
        }
    };

    // =================================================================
    // BLOC 3: SYNCHRO HEURE (NTP OFFSET) & MINECRAFT
    // =================================================================

    // NOUVEAU: Logique de calcul du temps Minecraft
    const updateMinecraftTime = (totalElapsedTimeSec) => {
        // Un jour Minecraft dure 20 minutes (1200 secondes)
        const MINECRAFT_DAY_SECONDS = 1200; 
        
        // Temps écoulé dans le cycle Minecraft actuel (secondes)
        const cycleTimeSec = totalElapsedTimeSec % MINECRAFT_DAY_SECONDS; 
        
        // Échelle de temps (0 à 24 heures)
        const hoursInCycle = (cycleTimeSec / MINECRAFT_DAY_SECONDS) * 24;
        
        // Décalage: 0.0h dans le cycle = 6h00 dans Minecraft (tick 0)
        const totalHours = (hoursInCycle + 6) % 24; 
        
        const hours = Math.floor(totalHours);
        const minutes = Math.floor((totalHours - hours) * 60);

        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        
        if ($('minecraft-time-display')) $('minecraft-time-display').textContent = timeString;
    };

    const updateNtpOffset = () => {
        // SIMULATION D'OFFSET
        const start = Date.now();
        const serverTimeMs = start + Math.floor(Math.random() * 50) - 25; 
        ntpOffsetMs = serverTimeMs - start;
        console.log(`⏱️ Offset NTP simulé: ${ntpOffsetMs} ms`);
    };

    // CORRIGÉ: Cette fonction est maintenant appelée même si isSystemActive est false.
    const updateTimeCounters = (initial = false) => {
        const now = new Date(Date.now() + ntpOffsetMs); 
        const utcTime = now.toUTCString().slice(-12, -4); 
        const utcDate = now.toISOString().slice(0, 10);
        
        if ($('local-time-display')) $('local-time-display').textContent = now.toLocaleTimeString('fr-FR');
        if ($('utc-datetime-display')) $('utc-datetime-display').textContent = `${utcDate} ${utcTime} (UTC)`;
        if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(ntpOffsetMs, 0, ' ms'); 

        const totalElapsedTimeSec = (Date.now() - window.sessionStartTime) / 1000.0;
        
        if (isSystemActive || initial) {
            // Mise à jour uniquement si le système est actif ou au premier chargement
            if ($('elapsed-time-session')) $('elapsed-time-session').textContent = dataOrDefault(totalElapsedTimeSec, 2, ' s');
            if ($('elapsed-time-motion')) $('elapsed-time-motion').textContent = dataOrDefault(timeInMotionMs / 1000, 2, ' s');
        }

        // Appel de la nouvelle fonction Minecraft
        updateMinecraftTime(totalElapsedTimeSec);
    };

    // =================================================================
    // BLOC 4: GESTION MÉTÉO (PROXY VERCEL)
    // =================================================================

    const fetchWeatherData = async (lat, lon) => {
        const API_URL = `/api/weather?lat=${lat}&lon=${lon}`; 
        // ... (Logique de l'appel API inchangée)
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('API Météo Vercel a échoué');
            
            const data = await response.json();
            
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
        
        const lat = ukfData.lat || currentPosition.lat;
        const lon = ukfData.lon || currentPosition.lon;
        const altitude_m = ukfData.alt || currentPosition.alt;

        // --- 1. Calculs Physique (basés sur les données Météo) ---
        const T_C = meteoData.temp; 
        const P_hPa = meteoData.pressure; 
        const T_K = T_C + 273.15; 
        const P_Pa = P_hPa * 100; 

        const rho_air = P_Pa / (R_AIR * T_K); 
        const speed_of_sound_cor = Math.sqrt(GAMMA * R_AIR * T_K);
        const dynamic_pressure_q = 0.5 * rho_air * Math.pow(currentSpeedMs, 2); 
        
        // --- 2. Mise à jour Vitesse & Relativité ---
        const speed_kmh = currentSpeedMs * KMH_MS;
        
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speed_kmh, 3, ' km/h');
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 3, ' m/s');
        if ($('speed-max-session')) $('speed-max-session').textContent = dataOrDefault(maxSpeedMs * KMH_MS, 1, ' km/h');
        
        if ($('speed-of-sound-cor')) $('speed-of-sound-cor').textContent = dataOrDefault(speed_of_sound_cor, 2, ' m/s');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(currentSpeedMs / speed_of_sound_cor, 4, '');
        
        // --- 3. Mise à jour Météo / Environnement ---
        if ($('temp-air')) $('temp-air').textContent = dataOrDefault(T_C, 1, ' °C');
        if ($('pressure-atm')) $('pressure-atm').textContent = dataOrDefault(P_hPa, 0, ' hPa');
        if ($('humidity-rel')) $('humidity-rel').textContent = dataOrDefault(meteoData.humidity, 0, ' %');
        if ($('densite-air')) $('densite-air').textContent = dataOrDefault(rho_air, 4, ' kg/m³');
        if ($('pressure-dyn')) $('pressure-dyn').textContent = dataOrDefault(dynamic_pressure_q, 2, ' Pa');

        // --- 4. Mise à jour Distance & Horizon ---
        if ($('distance-total-3d')) $('distance-total-3d').textContent = dataOrDefault(totalDistanceM / 1000, 3, ' km');
        
        // Distance Maximale Visible (Distance à l'Horizon)
        const horizon_dist_m = Math.sqrt(2 * R_EARTH * altitude_m + Math.pow(altitude_m, 2)); 
        const horizon_dist_km = horizon_dist_m / 1000;
        
        if ($('distance-max-visible')) $('distance-max-visible').textContent = dataOrDefault(horizon_dist_km, 1, ' km');
        
        // --- 5. Mise à jour UKF & Debug ---
        if ($('lat-ukf')) $('lat-ukf').textContent = dataOrDefault(lat, 6, '');
        if ($('lon-ukf')) $('lon-ukf').textContent = dataOrDefault(lon, 6, '');
        if ($('alt-ukf')) $('alt-ukf').textContent = dataOrDefault(altitude_m, 2, ' m');

        // ... (autres mises à jour de l'UKF/Debug)
    };


    // =================================================================
    // BLOC 6: BOUCLES (50 Hz & 1 Hz)
    // =================================================================

    const fastLoop = () => {
        
        updateTimeCounters(false); // Mis à jour de l'heure et Minecraft à 50Hz, même si inactif
        
        if (!isSystemActive) {
            return; 
        }

        const now = Date.now();
        let dt = (now - lastPredictionTime) / 1000.0;
        lastPredictionTime = now;
        
        if (dt <= 0) return;
        
        let speedFromFusion = 0.0;

        // UKF Prediction (Logique inchangée)
        if (ukf && ukf.isInitialized() && gpsWatchID) {
            try {
                ukf.predict(dt, curAccLinear, curGyro);
                fusionState = ukf.getState();
                speedFromFusion = fusionState.speed;
            } catch (e) { 
                speedFromFusion = 0.0; 
            }
        }
        
        // CORRECTION VITESSE: Logique de Dead Reckoning Fallback sécurisée (inchangée)
        if (!ukf || !ukf.isInitialized() || isGpsPaused) {
            const longitudinal_accel = curAccLinear.x; 
            const THRESHOLD = 0.2; 
            const FRICTION = 0.5; 
            
            if (Math.abs(longitudinal_accel) > THRESHOLD) {
                 deadReckoningSpeed += longitudinal_accel * dt; 
            } else {
                 if (deadReckoningSpeed > 0) {
                     deadReckoningSpeed = Math.max(0, deadReckoningSpeed - FRICTION * dt);
                 }
            }
            currentSpeedMs = deadReckoningSpeed;
        } else {
            currentSpeedMs = speedFromFusion;
            deadReckoningSpeed = currentSpeedMs;
        }
        
        currentSpeedMs = Math.max(0, currentSpeedMs);
        
        // Mise à jour des totaux (Distance, V-Max, Temps de Mouvement)
        if (currentSpeedMs > 0.01) { 
           totalDistanceM += currentSpeedMs * dt;
           timeInMotionMs += dt * 1000;
        }
        maxSpeedMs = Math.max(maxSpeedMs, currentSpeedMs);
        
        updateDashboardDOM(fusionState); 
    };


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

        // 2. Calculs Astronomiques 
        if (typeof calculateAstroDataHighPrec === 'function') {
            try {
                const date = new Date(now + ntpOffsetMs);
                const ad = calculateAstroDataHighPrec(date, lat, lon, alt); 

                if ($('true-solar-time')) $('true-solar-time').textContent = ad.TST.time;
                if ($('mean-solar-time')) $('mean-solar-time').textContent = ad.MST.time;
                if ($('local-solar-noon')) $('local-solar-noon').textContent = ad.noonUTC;
                if ($('eot-value')) $('eot-value').textContent = dataOrDefault(ad.EoT, 2, ' min'); 
                
                if ($('day-duration')) $('day-duration').textContent = ad.dayLength;
                if ($('sunrise-times')) $('sunrise-times').textContent = `${ad.sunriseTST} / ${ad.sunriseMST}`;
                if ($('sunset-times')) $('sunset-times').textContent = `${ad.sunsetTST} / ${ad.sunsetMST}`;
                
            } catch(e) { 
                console.error("🔴 Erreur critique de calcul Astro. Vérifiez les dépendances (ephem.js, astro.js) :", e);
            }
        }
    };


    // =================================================================
    // INITIALISATION
    // =================================================================

    window.addEventListener('load', () => {
        window.sessionStartTime = Date.now();
        
        if (typeof ProfessionalUKF !== 'undefined') {
            ukf = new ProfessionalUKF();
            ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
            fusionState = ukf.getState();
        } 
        
        // 1. Synchro NTP ponctuelle
        updateNtpOffset();

        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) btnToggle.addEventListener('click', toggleSystem);

        // 2. Démarrage par défaut sur OFF (PAUSE)
        isSystemActive = false; 
        
        // Initialisation de l'affichage statique et du bouton
        updateButtonUI(isSystemActive);
        updateTimeCounters(true); // Affiche l'heure réelle et Minecraft
        updateDashboardDOM(fusionState);

        // Déclencher le premier appel Météo (pour les calculs physiques)
        fetchWeatherData(currentPosition.lat, currentPosition.lon); 

        // 3. Lancement des boucles
        setInterval(fastLoop, 20); // 50 Hz
        setInterval(slowLoop, 1000); // 1 Hz
    });

})(window);
