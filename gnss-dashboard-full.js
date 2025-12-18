// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL "PLATINUM" (V43)
// - Compatibilité : Android Moderne / iOS 13+ (Permissions IMU)
// - IDs : Synchronisés avec index.html corrigé
// - Logique : Master Switch + Fusion UKF 21 États + Astro
// =================================================================

((window) => {
    "use strict";

    // --- 1. FONCTIONS UTILITAIRES ---
    const $ = id => document.getElementById(id);

    const dataOrDefault = (val, decimals, suffix = '', fallback = 'N/A', forceZero = true) => {
        if (val === undefined || val === null || isNaN(val) || (typeof val === 'number' && Math.abs(val) < 1e-18 && forceZero)) {
            if (fallback !== 'N/A') return fallback;
            const zeroFormat = (decimals === 0 ? '0' : '0.' + Array(decimals).fill('0').join(''));
            return zeroFormat.replace('.', ',') + suffix;
        }
        return val.toFixed(decimals).replace('.', ',') + suffix;
    };

    // Formatage Heure Astro
    const formatAstroTime = (hours) => {
        if (isNaN(hours) || hours === null) return 'N/A';
        let h = hours % 24;
        if (h < 0) h += 24;
        const H = Math.floor(h).toString().padStart(2, '0');
        const M = Math.floor((h % 1) * 60).toString().padStart(2, '0');
        const S = Math.floor(((h * 60) % 1) * 60).toString().padStart(2, '0');
        return `${H}:${M}:${S}`;
    };

    const formatDate = (date) => {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
    };

    // --- 2. CONSTANTES & ÉTAT GLOBAL ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const C_L = 299792458;          // Vitesse lumière (m/s)
    const G_ACC_STD = 9.8067;       
    const R_AIR = 287.058;          
    const GAMMA = 1.4;              
    const R_EARTH_MEAN = 6371000;

    // État Système
    let isSystemActive = false;
    let fastIntervalId = null;
    let slowIntervalId = null;
    let gpsWatchID = null;
    let isIMUActive = false; // Flag pour savoir si on a déjà les permissions

    // Données Temps & Mouvement
    let lastPredictionTime = Date.now();
    let sessionStartTime = Date.now();
    let ntpOffsetMs = 0;
    let totalDistanceM = 0;
    let maxSpeedMs = 0;
    let timeInMotionMs = 0;
    
    // Position & Fusion
    let hasGpsFixOccurred = false;
    let lastKnownPosition = null; 
    let currentPosition = {
        lat: 48.8566, lon: 2.3522, alt: 0.0, acc: 25.0, speed: 0.0 // Paris par défaut
    };
    
    // IMU & UKF
    let curAcc = {x: 0, y: 0, z: G_ACC_STD};
    let curGyro = {x: 0, y: 0, z: 0};
    let ukf = null;
    let fusionState = null;
    let currentSpeedMs = 0.0;
    let deadReckoningSpeed = 0.0;

    // Météo (Simulée ou API)
    let currentTempK = 288.15; // 15°C standard

    // --- 3. GESTION NTP (Heure Serveur) ---
    const updateNtpOffset = async () => {
        try {
            const t0 = Date.now();
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            const t3 = Date.now();
            const serverTime = data.unixtime * 1000;
            ntpOffsetMs = (serverTime + ((t3 - t0) / 2)) - t3;
            if ($('ntp-offset')) $('ntp-offset').textContent = dataOrDefault(ntpOffsetMs, 0, ' ms');
        } catch (e) { ntpOffsetMs = 0; }
    };
    const getCDate = () => new Date(Date.now() + ntpOffsetMs);


    // --- 4. GESTION DES CAPTEURS (GPS & IMU ROBUSTE) ---

    // A. GPS
    const startGps = () => {
        if (!gpsWatchID && navigator.geolocation) {
            gpsWatchID = navigator.geolocation.watchPosition(
                (pos) => {
                    hasGpsFixOccurred = true;
                    const c = pos.coords;
                    
                    // Mise à jour Position
                    currentPosition.lat = c.latitude;
                    currentPosition.lon = c.longitude;
                    currentPosition.alt = c.altitude || currentPosition.alt;
                    currentPosition.acc = c.accuracy || 25.0;
                    const rawSpd = c.speed || 0.0;
                    currentPosition.speed = rawSpd;

                    // Mise à jour UKF
                    if (ukf) {
                        if (!ukf.isInitialized()) ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
                        ukf.update(pos);
                        fusionState = ukf.getState();
                    }

                    // Calcul Distance
                    if (lastKnownPosition) {
                        const dLat = (c.latitude - lastKnownPosition.lat) * D2R;
                        const dLon = (c.longitude - lastKnownPosition.lon) * D2R;
                        const d2D = R_EARTH_MEAN * Math.sqrt(dLat*dLat + Math.cos(c.latitude*D2R)*dLon*dLon); // Approx simple
                        totalDistanceM += d2D;
                    }
                    lastKnownPosition = { lat: c.latitude, lon: c.longitude };

                    if ($('gps-status')) $('gps-status').textContent = `Acquisition OK (${c.accuracy.toFixed(1)}m)`;
                },
                (err) => {
                    console.error("Erreur GPS:", err);
                    if ($('gps-status')) $('gps-status').textContent = `Erreur GPS ${err.code}`;
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        }
    };

    const stopGps = () => {
        if (gpsWatchID) {
            navigator.geolocation.clearWatch(gpsWatchID);
            gpsWatchID = null;
        }
    };

    // B. IMU (Correction Android/iOS Permissions)
    const startMotionListeners = () => {
        if (isIMUActive) return; // Déjà activé

        const handleMotion = (e) => {
            if (e.accelerationIncludingGravity) {
                curAcc.x = e.accelerationIncludingGravity.x || 0;
                curAcc.y = e.accelerationIncludingGravity.y || 0;
                curAcc.z = e.accelerationIncludingGravity.z || 0;
            }
            if (e.rotationRate) {
                curGyro.x = (e.rotationRate.alpha || 0) * D2R;
                curGyro.y = (e.rotationRate.beta || 0) * D2R;
                curGyro.z = (e.rotationRate.gamma || 0) * D2R;
            }
        };

        const attach = () => {
            window.addEventListener('devicemotion', handleMotion, true);
            isIMUActive = true;
            console.log("IMU: Listeners attachés.");
        };

        // Demande de permission (iOS 13+ / Android Moderne)
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') attach();
                    else console.warn("Permission IMU refusée.");
                })
                .catch(e => {
                    console.warn("Erreur Permission IMU (Fallback):", e);
                    attach();
                });
        } else if ('DeviceMotionEvent' in window) {
            // Fallback navigateurs standards
            attach();
        } else {
            console.warn("IMU non supporté.");
        }
    };


    // --- 5. LOGIQUE SYSTÈME (Start/Stop) ---

    const toggleSystem = () => {
        const btn = $('gps-pause-toggle');
        
        if (!isSystemActive) {
            // DÉMARRAGE
            isSystemActive = true;
            sessionStartTime = Date.now();
            if (btn) btn.textContent = '⏸️ PAUSE SYSTÈME';
            
            // 1. Demande Permissions IMU (Doit être sur événement clic)
            startMotionListeners();
            // 2. Démarre GPS
            startGps();
            // 3. Démarre Boucles
            if (!fastIntervalId) fastIntervalId = setInterval(fastLoop, 20); // 50 Hz
            if (!slowIntervalId) slowIntervalId = setInterval(slowLoop, 1000); // 1 Hz
            
            console.log("Système DÉMARRÉ.");

        } else {
            // ARRÊT (PAUSE)
            isSystemActive = false;
            if (btn) btn.textContent = '▶️ MARCHE GPS';
            
            stopGps();
            if (fastIntervalId) { clearInterval(fastIntervalId); fastIntervalId = null; }
            if (slowIntervalId) { clearInterval(slowIntervalId); slowIntervalId = null; }
            
            // On laisse les listeners IMU actifs pour ne pas redemander la permission, 
            // mais les calculs s'arrêtent car isSystemActive est false.
            console.log("Système PAUSÉ.");
        }
        
        updateDashboardDOM(); // MAJ immédiate de l'interface
    };


    // --- 6. BOUCLES DE CALCUL & AFFICHAGE ---

// =================================================================
    // CORRECTION PHYSIQUE : Compensation de Gravité (Vitesse / Inclinaison)
    // =================================================================

    // Boucle Rapide (50 Hz) - Physique & UKF
    const fastLoop = () => {
        if (!isSystemActive) return;
        
        const now = Date.now();
        const dt = (now - lastPredictionTime) / 1000.0;
        lastPredictionTime = now;
        if (dt <= 0) return;

        // 1. Calcul précis de l'Inclinaison (Pitch/Roll)
        // Nécessaire pour savoir dans quelle direction tire la gravité
        const rollRad = Math.atan2(curAcc.y, curAcc.z);
        const pitchRad = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y*curAcc.y + curAcc.z*curAcc.z));

        // 2. Calcul du vecteur Gravité théorique selon l'inclinaison
        // C'est ce que l'accéléromètre "voit" juste parce qu'il est penché
        const gravX = -Math.sin(pitchRad) * G_ACC_STD;
        const gravY = Math.sin(rollRad) * Math.cos(pitchRad) * G_ACC_STD;
        const gravZ = Math.cos(rollRad) * Math.cos(pitchRad) * G_ACC_STD;

        // 3. Soustraction de la gravité pour obtenir l'ACCÉLÉRATION LINÉAIRE PURE
        // C'est le "Vrai Mouvement" sans l'effet de pente
        const linAccX = curAcc.x - gravX; // Accélération Longitudinale (Avant/Arrière) corrigée
        const linAccY = curAcc.y - gravY; // Accélération Latérale corrigée
        const linAccZ = curAcc.z - gravZ; // Accélération Verticale corrigée

        // Mise à jour des variables globales pour l'affichage
        // On stocke ces valeurs "propres" pour l'affichage dynamique
        if (fusionState) {
            fusionState.accel_long = linAccX; // Mettre à jour l'état fusionné pour l'affichage
            fusionState.accel_z_compensated = linAccZ;
        }

        // 4. Prédiction de Vitesse
        let speed = 0;
        
        if (ukf && ukf.isInitialized() && hasGpsFixOccurred) {
            // Si UKF Actif : On lui envoie les données BRUTES (il gère sa propre gravité interne)
            try {
                ukf.predict(dt, curAcc, curGyro);
                fusionState = ukf.getState();
                speed = fusionState.speed;
            } catch(e) { speed = 0; }
        } else {
            // --- MODE DEAD RECKONING (Sans GPS) ---
            // C'est ici que la correction d'inclinaison est CRITIQUE
            
            // On utilise linAccX (l'axe X du téléphone est généralement l'axe longitudinal en mode portrait)
            // Seuil de bruit (Noise Gate) pour éviter la dérive à l'arrêt
            const NOISE_THRESHOLD = 0.001; // m/s²
            
            if (Math.abs(linAccX) > NOISE_THRESHOLD) {
                // Intégration : Vitesse = Vitesse + Accélération * Temps
                deadReckoningSpeed += linAccX * dt;
            } else {
                // Friction virtuelle pour s'arrêter doucement si pas de mouvement
                deadReckoningSpeed *= 0.98;
                if (Math.abs(deadReckoningSpeed) < 0.1) deadReckoningSpeed = 0;
            }
            
            // Sécurité : Pas de vitesse négative en marche avant simple
            // (Sauf si vous voulez gérer la marche arrière, retirez cette ligne)
            if (deadReckoningSpeed < 0) deadReckoningSpeed = 0;
            
            speed = deadReckoningSpeed;
        }

        currentSpeedMs = speed;
        maxSpeedMs = Math.max(maxSpeedMs, speed);
        
        if (speed > 1.0) timeInMotionMs += dt * 1000;

        updateDashboardDOM();
    };

    // B. Boucle Lente (1 Hz) - Astro & Temps
    const slowLoop = () => {
        if (!isSystemActive) return;
        
        updateTimeCounters();
        
        if (currentPosition.lat !== 0 && typeof calculateAstroDataHighPrec === 'function') {
            try {
                const date = getCDate();
                // Utiliser la position fusionnée si dispo, sinon GPS brut
                const lat = fusionState ? fusionState.lat : currentPosition.lat;
                const lon = fusionState ? fusionState.lon : currentPosition.lon;
                
                const ad = calculateAstroDataHighPrec(date, lat, lon);
                
                // Mises à jour Astro DOM
                if ($('sun-alt')) $('sun-alt').textContent = dataOrDefault(ad.sun.altitude * R2D, 2, '°');
                if ($('sun-azimuth')) $('sun-azimuth').textContent = dataOrDefault(ad.sun.azimuth * R2D, 1, '°');
                if ($('moon-phase-name')) $('moon-phase-name').textContent = ad.moon.phaseName_fr || 'N/A';
                if ($('moon-illuminated')) $('moon-illuminated').textContent = dataOrDefault(ad.moon.fraction * 100, 1, ' %');
                if ($('moon-alt')) $('moon-alt').textContent = dataOrDefault(ad.moon.altitude * R2D, 2, '°');
                if ($('astro-phase')) $('astro-phase').textContent = (ad.sun.altitude * R2D < -6) ? 'Nuit (🌙)' : 'Jour (☀️)';

                // Temps Solaire
                if ($('tst-time')) $('tst-time').textContent = ad.trueSolarTime || 'N/A';
                if ($('equation-of-time')) $('equation-of-time').textContent = dataOrDefault(ad.EOT_MIN * 60, 2, ' s');

            } catch(e) {}
        }
    };

    // C. Mise à jour Interface (DOM)
    const updateTimeCounters = () => {
        const now = getCDate();
        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR');
        if ($('utc-datetime')) $('utc-datetime').textContent = now.toISOString().replace('T', ' ').substring(0,19) + ' UTC';
        
        const elapsed = (Date.now() - sessionStartTime) / 1000;
        if ($('elapsed-time')) $('elapsed-time').textContent = isSystemActive ? dataOrDefault(elapsed, 2, ' s') : '0.00 s';
        if ($('movement-time')) $('movement-time').textContent = dataOrDefault(timeInMotionMs/1000, 2, ' s');
    };

    const updateDashboardDOM = () => {
        // --- 1. Vitesse & Distance ---
        const spdKmh = currentSpeedMs * 3.6;
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(spdKmh, 3, ' km/h');
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(spdKmh, 3, ' km/h');
        if ($('speed-stable-ms')) $('speed-stable-ms').textContent = dataOrDefault(currentSpeedMs, 2, ' m/s');
        if ($('speed-raw-ms')) $('speed-raw-ms').textContent = dataOrDefault(currentPosition.speed, 2, ' m/s');
        if ($('speed-max-session')) $('speed-max-session').textContent = dataOrDefault(maxSpeedMs * 3.6, 3, ' km/h');
        
        const distKm = totalDistanceM / 1000;
        if ($('total-distance')) $('total-distance').textContent = `${dataOrDefault(distKm, 3, ' km')} | ${dataOrDefault(totalDistanceM, 1, ' m')}`;

        // --- 2. IMU / Niveau à Bulle ---
        // Calcul Pitch/Roll basique à partir de l'accéléromètre
        const roll = Math.atan2(curAcc.y, curAcc.z) * R2D;
        const pitch = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y*curAcc.y + curAcc.z*curAcc.z)) * R2D;

        if ($('pitch')) $('pitch').textContent = dataOrDefault(pitch, 1, '°');
        if ($('roll')) $('roll').textContent = dataOrDefault(roll, 1, '°');
        if ($('accel-x')) $('accel-x').textContent = dataOrDefault(curAcc.x, 2);
        if ($('accel-y')) $('accel-y').textContent = dataOrDefault(curAcc.y, 2);
        if ($('accel-z')) $('accel-z').textContent = dataOrDefault(curAcc.z, 2);
        
        // --- 3. Position UKF ---
        const lat = fusionState ? fusionState.lat : currentPosition.lat;
        const lon = fusionState ? fusionState.lon : currentPosition.lon;
        const alt = fusionState ? fusionState.alt : currentPosition.alt;
        
        if ($('lat-ukf')) $('lat-ukf').textContent = dataOrDefault(lat, 6, '°');
        if ($('lon-ukf')) $('lon-ukf').textContent = dataOrDefault(lon, 6, '°');
        if ($('alt-ukf')) $('alt-ukf').textContent = dataOrDefault(alt, 1, ' m');
        if ($('gps-accuracy-display')) $('gps-accuracy-display').textContent = dataOrDefault(currentPosition.acc, 1, ' m');
        if ($('ukf-status')) $('ukf-status').textContent = isSystemActive ? (ukf ? 'ACTIF (21 États)' : 'Erreur UKF') : 'INACTIF';

        // --- 4. Physique ---
        const localSound = Math.sqrt(GAMMA * R_AIR * currentTempK);
        if ($('local-speed-of-sound')) $('local-speed-of-sound').textContent = dataOrDefault(localSound, 1, ' m/s');
        if ($('mach-number')) $('mach-number').textContent = dataOrDefault(currentSpeedMs / localSound, 4);
        
        const vRatio = currentSpeedMs / C_L;
        if ($('pct-speed-of-light')) $('pct-speed-of-light').textContent = dataOrDefault(vRatio * 100, 8, ' %');
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(1 / Math.sqrt(1 - vRatio*vRatio), 8);
        
        // --- 5. Dynamique ---
        const accTotal = Math.sqrt(curAcc.x**2 + curAcc.y**2 + curAcc.z**2);
        if ($('accel-long')) $('accel-long').textContent = dataOrDefault(Math.abs(accTotal - G_ACC_STD), 2, ' m/s²'); // Approx
        if ($('local-gravity')) $('local-gravity').textContent = dataOrDefault(G_ACC_STD, 4, ' m/s²');
        
        // Mise à jour Bulle Visuelle
        const bubble = $('bubble');
        if (bubble) {
            const bx = Math.min(Math.max(roll, -45), 45) * 1.5;
            const by = Math.min(Math.max(pitch, -45), 45) * -1.5;
            bubble.style.transform = `translate(${bx}px, ${by}px)`;
        }
    };


    // =================================================================
    // INITIALISATION (CHARGEMENT PAGE)
    // =================================================================

    window.addEventListener('load', () => {
        console.log("🚀 GNSS Dashboard V43 (Platinum) - Initialisation...");

        // 1. Vérification Dépendances (Sans crash)
        if (typeof math === 'undefined') console.error("⚠️ math.js manquant !");
        if (typeof ProfessionalUKF !== 'undefined') {
            try {
                ukf = new ProfessionalUKF(currentPosition.lat, currentPosition.lon, currentPosition.alt);
                ukf.initialize(currentPosition.lat, currentPosition.lon, currentPosition.alt);
                fusionState = ukf.getState();
                console.log("✅ UKF Initialisé.");
            } catch(e) { console.error("Erreur Init UKF:", e); }
        } else {
            console.warn("⚠️ ProfessionalUKF manquant.");
        }

        // 2. Setup Boutons
        const btn = $('gps-pause-toggle');
        if (btn) btn.addEventListener('click', toggleSystem);

        const resetDistBtn = $('reset-dist-btn');
        if (resetDistBtn) resetDistBtn.addEventListener('click', () => totalDistanceM = 0);
        
        const resetMaxBtn = $('reset-max-btn');
        if (resetMaxBtn) resetMaxBtn.addEventListener('click', () => maxSpeedMs = 0);

        const resetAllBtn = $('reset-all-btn');
        if (resetAllBtn) resetAllBtn.addEventListener('click', () => location.reload());

        // 3. NTP & Premier Affichage
        updateNtpOffset();
        updateTimeCounters(); // Affiche l'heure locale immédiatement
        updateDashboardDOM(); // Remplit les champs par défaut (0.0)

        // Lance une boucle lente "passive" juste pour l'heure si le système est éteint
        setInterval(() => {
            if (!isSystemActive) updateTimeCounters();
        }, 1000);
    });

})(window);
