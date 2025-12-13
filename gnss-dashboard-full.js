// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER FINAL (V28)
// ARCHITECTURE: MODE DEAD RECKONING (INS PUR) SI PERTE GPS
// =================================================================

((window) => {
    "use strict";

    if (typeof math === 'undefined' || typeof ProfessionalUKF === 'undefined') console.error("Dépendances manquantes.");

    // --- CONSTANTES ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const C_L = 299792458, G_CONST = 6.67430e-11;
    const R_AIR = 287.058, GAMMA = 1.4;
    const P_SEA = 1013.25, T_LAPSE = 0.0065, G_ACC_STD = 9.8067;
    const EARTH_R = 6371000.0, RHO_SEA = 1.225;
    
    // --- ÉTAT ---
    let ukf = null, isGpsPaused = true, gpsWatchID = null, isIMUActive = false;
    let gpsStatusMessage = 'Attente...';
    let lastPredictionTime = Date.now(), lastGpsTime = 0;
    
    // Données Temps Réel
    let currentPos = { lat: 0, lon: 0, alt: 0, acc: 0, spd: 0 };
    let curAcc = {x:0, y:0, z:G_ACC_STD}, curGyro = {x:0, y:0, z:0};
    let curMag = {x:0, y:0, z:0}, curPress = P_SEA, curTempC = 15;
    let isBaro = false, isMag = false;
    let currentSpeedMs = 0, totalDist = 0, lastPosDist = null;
    let ntpOffset = 0, lastNtpSync = 0;

    const $ = id => document.getElementById(id);
    const fmt = (v, d=2, s='') => (v===undefined||isNaN(v)) ? 'N/A' : v.toFixed(d)+s;
    const fmtExp = (v, d=2) => (v===undefined||isNaN(v)||v===0) ? '0.00' : (Math.abs(v)>1e6||Math.abs(v)<1e-4 ? v.toExponential(d) : v.toFixed(d));

    // --- TEMPS ---
    const syncNTP = async () => {
        if (Date.now() - lastNtpSync < 300000 && lastNtpSync !== 0) return;
        try {
            const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            if (r.ok) {
                const d = await r.json();
                ntpOffset = new Date(d.utc_datetime).getTime() - Date.now();
                lastNtpSync = Date.now();
                console.log("NTP Sync OK");
            }
        } catch(e) {}
    };
    const getNow = () => new Date(Date.now() + ntpOffset);

    // --- PHYSIQUE & RELATIVITÉ ---
    const updatePhysics = (ukfState) => {
        const alt = ukfState.alt || currentPos.alt;
        const spd = currentSpeedMs;
        const mass = 70.0; // Poids utilisateur
        
        // Météo
        const Tk = curTempC + 273.15;
        const rho = (curPress*100)/(R_AIR*Tk);
        const snd = Math.sqrt(GAMMA*R_AIR*Tk);
        const mach = spd/snd;
        const q_dyn = 0.5 * rho * spd**2;
        const alt_baro = (Tk/T_LAPSE)*(1 - Math.pow(curPress/P_SEA, (R_AIR*T_LAPSE)/G_ACC_STD));

        // Relativité
        const beta = spd/C_L;
        const gamma = (beta < 1) ? 1/Math.sqrt(1 - beta**2) : 1;
        const E0 = mass * C_L**2;
        const E_tot = gamma * E0;
        const E_kin = (gamma - 1) * E0;
        const p = gamma * mass * spd;
        const Rs = (2*G_CONST*mass)/(C_L**2);
        const t_dil_v = (gamma - 1) * 86400 * 1e9; // ns/j
        
        // Forces
        const g_loc = G_ACC_STD; // Simplifié ici
        const coriolis = 2 * mass * 7.29e-5 * Math.sin(ukfState.lat*D2R) * spd;

        // DOM Updates
        if($('speed-of-sound-calc')) $('speed-of-sound-calc').textContent = fmt(snd, 2, ' m/s');
        if($('mach-number')) $('mach-number').textContent = fmt(mach, 4);
        if($('air-density')) $('air-density').textContent = fmt(rho, 4, ' kg/m³');
        if($('pression-dynamique')) $('pression-dynamique').textContent = fmt(q_dyn, 2, ' Pa');
        if($('baro-alt')) $('baro-alt').textContent = fmt(alt_baro, 1, ' m');
        
        if($('lorentz-factor')) $('lorentz-factor').textContent = fmt(gamma, 9);
        if($('energy-rest')) $('energy-rest').textContent = fmtExp(E0) + ' J';
        if($('energy-rel')) $('energy-rel').textContent = fmtExp(E_tot) + ' J';
        if($('kinetic-energy')) $('kinetic-energy').textContent = fmt(E_kin, 2, ' J');
        if($('quantite-mouvement')) $('quantite-mouvement').textContent = fmtExp(p) + ' kg·m/s';
        if($('schwarzschild-radius')) $('schwarzschild-radius').textContent = fmtExp(Rs) + ' m';
        if($('time-dilation-vel')) $('time-dilation-vel').textContent = fmt(t_dil_v, 4, ' ns/j');
        if($('coriolis-force')) $('coriolis-force').textContent = fmt(coriolis, 4, ' N');
    };

    // --- CAPTEURS ---
    const handleMotion = (e) => {
        const a = e.accelerationIncludingGravity;
        if(a) { curAcc.x=a.x; curAcc.y=a.y; curAcc.z=a.z; }
        const r = e.rotationRate;
        if(r) { curGyro.x=r.alpha*D2R; curGyro.y=r.beta*D2R; curGyro.z=r.gamma*D2R; }
        isIMUActive = true;
    };
    
    // --- GPS ---
    const handleGPS = (pos) => {
        const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
        currentPos = { lat: latitude, lon: longitude, alt: altitude||0, acc: accuracy, spd: speed||0 };
        lastGpsTime = Date.now(); // Timestamp dernier fix

        if(ukf) {
            try {
                if(!ukf.isInitialized()) {
                    ukf.initialize(latitude, longitude, altitude||0);
                    ukf.initialized = true; // FORCE START
                    gpsStatusMessage = "Fix GPS (Init OK)";
                }
                ukf.update(pos); // Correction
                gpsStatusMessage = `Fix: ${accuracy.toFixed(1)}m`;
            } catch(e) {
                console.error("UKF Error", e);
                gpsStatusMessage = "Erreur UKF";
            }
        } else {
            currentSpeedMs = speed||0;
        }
    };

    // --- BOUCLE PRINCIPALE (50Hz) ---
    const loop = () => {
        const now = Date.now();
        const dt = (now - lastPredictionTime) / 1000;
        lastPredictionTime = now;

        if(ukf && ukf.isInitialized() && dt > 0) {
            try {
                // 1. PREDICTION (Toujours, même sans GPS)
                ukf.predict(dt, [curAcc.x, curAcc.y, curAcc.z], [curGyro.x, curGyro.y, curGyro.z]);

                // 2. LOGIQUE DEAD RECKONING
                const timeSinceGps = now - lastGpsTime;
                if (timeSinceGps > 2000 && !isGpsPaused) {
                    gpsStatusMessage = "⚠️ PERTE GPS - MODE INERTIEL";
                    // ZUUV : Si on est immobile, on corrige la dérive
                    const accMag = Math.sqrt(curAcc.x**2 + curAcc.y**2 + (curAcc.z-9.8)**2);
                    const gyrMag = Math.sqrt(curGyro.x**2 + curGyro.y**2 + curGyro.z**2);
                    if (accMag < 0.5 && gyrMag < 0.05) {
                        ukf.updateZUUV(); // Zero Velocity Update
                        gpsStatusMessage = "INS (ZUPT Actif)";
                    }
                }

                // 3. BARO/MAG
                if(isBaro) ukf.updateBaro((curTempC+273.15)/T_LAPSE * (1 - Math.pow(curPress/P_SEA, 0.19)));
                // if(isMag) ukf.updateMag(curMag);

                // 4. ETAT
                const s = ukf.getState();
                currentSpeedMs = s.speed;
                updatePhysics(s);
                updateDOM(s);

            } catch(e) {
                console.error(e);
                currentSpeedMs = currentPos.spd; // Fallback
            }
        } else {
            // Pas d'UKF
            currentSpeedMs = currentPos.spd;
            updateDOM({lat: currentPos.lat, lon: currentPos.lon, alt: currentPos.alt, speed: currentPos.spd, pitch:0, roll:0});
        }
    };

    // --- DOM ---
    const updateDOM = (s) => {
        const now = getNow();
        if($('local-time')) $('local-time').textContent = new Date().toLocaleTimeString();
        if($('utc-datetime')) $('utc-datetime').textContent = now.toISOString().split('T')[1].split('.')[0] + " UTC";
        
        if($('gps-status-acquisition')) $('gps-status-acquisition').textContent = gpsStatusMessage;
        
        if($('latitude-ekf')) $('latitude-ekf').textContent = fmt(s.lat, 6);
        if($('longitude-ekf')) $('longitude-ekf').textContent = fmt(s.lon, 6);
        if($('altitude-ekf')) $('altitude-ekf').textContent = fmt(s.alt, 2, ' m');
        
        if($('vitesse-stable-kmh-ekf')) $('vitesse-stable-kmh-ekf').textContent = fmt(currentSpeedMs*3.6, 2, ' km/h');
        
        if($('pitch')) $('pitch').textContent = fmt(s.pitch, 1, '°');
        if($('roll')) $('roll').textContent = fmt(s.roll, 1, '°');
        
        // IMU Raw
        if($('accel-x')) $('accel-x').textContent = fmt(curAcc.x, 2);
        if($('accel-y')) $('accel-y').textContent = fmt(curAcc.y, 2);
        if($('accel-z')) $('accel-z').textContent = fmt(curAcc.z, 2);
    };

    // --- INIT ---
    window.addEventListener('load', () => {
        if(typeof ProfessionalUKF !== 'undefined') ukf = new ProfessionalUKF();
        
        // Listeners
        window.addEventListener('devicemotion', handleMotion);
        // Baro/Mag listeners here...
        
        if(navigator.geolocation) {
            gpsWatchID = navigator.geolocation.watchPosition(handleGPS, 
                e => gpsStatusMessage="Erreur GPS "+e.code, 
                {enableHighAccuracy:true, maximumAge:0});
        }

        // Boucles
        setInterval(loop, 20); // 50Hz
        setInterval(() => {
            syncNTP();
            // Fetch Weather here...
            if(window.updateAstro) window.updateAstro(currentPos.lat, currentPos.lon, currentPos.alt, getNow());
        }, 1000);
    });

})(window);
