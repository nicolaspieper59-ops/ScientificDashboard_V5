/**
 * GNSS SPACETIME DASHBOARD - V80 "ULTRA-FUSION"
 * Système de Navigation Inertielle, Relativiste et Environnementale
 * Fréquence : 1000Hz | Constantes : CODATA 2024 / OACI
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);

    // --- CONSTANTES PHYSIQUES OFFICIELLES ---
    const PHYS = {
        C: 299792458,                   // m/s
        G: 6.67430e-11,                 // m³/kg/s²
        G_STD: 9.80665,                 // m/s²
        R_GAS: 8.314462618,             // J/mol·K
        M_AIR: 0.0289644,               // kg/mol
        P0: 101325,                     // Pa
        T0: 288.15,                     // K (15°C)
        L: 0.0065,                      // K/m
        SIGMA: 5.670374419e-8           // Stefan-Boltzmann
    };

    // --- ÉTAT DU SYSTÈME ---
    let state = {
        v: 0, vx: 0, vy: 0, vz: 0,      // Vitesses vectorielles
        x: 0, y: 0, z: 0,               // Position relative (m)
        v_gps: 0, acc_gps: 100,         // Données Satellite
        totalDist: 0,
        pitch: 0, roll: 0, heading: 0,  // Orientation
        accRaw: { x: 0, y: 0, z: 0 },
        uncertainty: 1.0,               // Incertitude Kalman (P)
        isPaused: true,
        startTime: Date.now(),
        driftNTP: 0
    };

    // --- 1. MODÈLE ATMOSPHÉRIQUE OACI (GROTTES & ALTITUDE) ---
    const getAtmo = (alt) => {
        const T = PHYS.T0 - PHYS.L * alt;
        const P = PHYS.P0 * Math.pow(1 - (PHYS.L * alt) / PHYS.T0, 5.2558);
        const rho = (P * PHYS.M_AIR) / (PHYS.R_GAS * T);
        return { rho, P, tempC: T - 273.15 };
    };

    // --- 2. FILTRE DE KALMAN (FUSION GPS / IMU) ---
    const kalmanUpdate = (vInertial, vGps, gpsAcc) => {
        const R = Math.max(gpsAcc, 0.5); // Bruit de mesure GPS
        const Q = 0.01;                  // Bruit de processus IMU
        const K = state.uncertainty / (state.uncertainty + R);
        const fused = vInertial + K * (vGps - vInertial);
        state.uncertainty = (1 - K) * state.uncertainty + Q;
        return fused;
    };

    // --- 3. BOUCLE DE CALCUL 1000 HZ ---
    setInterval(() => {
        if (state.isPaused) return;
        const dt = 0.001;
        const mass = parseFloat($('mass-input')?.value) || 70;
        const isNether = $('mode-nether')?.textContent.includes('ACTIF');

        // A. PROJECTION VECTORIELLE 3D (Isolation de la Gravité)
        const gx = -PHYS.G_STD * Math.sin(state.pitch);
        const gy = PHYS.G_STD * Math.cos(state.pitch) * Math.sin(state.roll);
        const gz = PHYS.G_STD * Math.cos(state.pitch) * Math.cos(state.roll);

        let ax = state.accRaw.x - gx;
        let ay = state.accRaw.y - gy;
        let az = state.accRaw.z - gz;

        // B. TRAÎNÉE ADAPTATIVE (Manèges, Voitures, Chutes)
        const atmo = getAtmo(state.z);
        const dragForce = 0.5 * atmo.rho * 0.5 * 0.7 * Math.pow(state.v, 2);
        const dragAcc = dragForce / mass;

        // C. INTÉGRATION & FUSION
        state.vx += (ax - dragAcc * (state.vx / (state.v || 1))) * dt;
        state.vy += (ay - dragAcc * (state.vy / (state.v || 1))) * dt;
        state.vz += (az - dragAcc * (state.vz / (state.v || 1))) * dt;
        
        const vInertial = Math.sqrt(state.vx**2 + state.vy**2 + state.vz**2);
        state.v = kalmanUpdate(vInertial, state.v_gps, state.acc_gps);

        // D. DÉPLACEMENT 3D & MODE NETHER
        const spaceScale = isNether ? 8.0 : 1.0;
        state.totalDist += state.v * dt * spaceScale;
        state.z += state.vz * dt;

        // E. MISE À JOUR VISUELLE (Optimisée pour ne pas ramer)
        if (Math.random() > 0.98) updateUI(atmo, mass, dragForce);
    }, 1);

    // --- 4. RÉSOLUTION DES CHAMPS HTML (ZÉRO N/A) ---
    function updateUI(atmo, mass, dragF) {
        const vKmh = state.v * 3.6;
        const gamma = 1 / Math.sqrt(1 - (state.v**2 / PHYS.C**2));
        const vSon = Math.sqrt(1.4 * PHYS.R_GAS * (atmo.tempC + 273.15) / PHYS.M_AIR);

        // Vitesse & Relativité
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(3) + " km/h";
        if($('mach-number')) $('mach-number').textContent = (state.v / vSon).toFixed(4);
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        if($('schwarzschild-radius')) $('schwarzschild-radius').textContent = ((2 * PHYS.G * mass) / PHYS.C**2).toExponential(4) + " m";
        
        // Mécanique des Fluides
        if($('air-density')) $('air-density').textContent = atmo.rho.toFixed(4) + " kg/m³";
        if($('pressure-hpa')) $('pressure-hpa').textContent = (atmo.P / 100).toFixed(1) + " hPa";
        if($('dynamic-pressure')) $('dynamic-pressure').textContent = (0.5 * atmo.rho * state.v**2).toFixed(2) + " Pa";
        if($('drag-force')) $('drag-force').textContent = dragF.toFixed(2) + " N";

        // Dynamique & G-Force (Manège)
        const gTotal = Math.sqrt(state.accRaw.x**2 + state.accRaw.y**2 + state.accRaw.z**2) / PHYS.G_STD;
        if($('force-g-vert')) $('force-g-vert').textContent = gTotal.toFixed(3) + " G";
        if($('altitude-ukf')) $('altitude-ukf').textContent = state.z.toFixed(2) + " m";

        // Énergie & Coriolis
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * state.v**2).toExponential(2) + " J";
        if($('coriolis-force')) {
            const lat = 48.8 * (Math.PI/180);
            const fC = 2 * mass * state.v * 7.2921e-5 * Math.sin(lat);
            $('coriolis-force').textContent = fC.toFixed(4) + " N";
        }

        // GlobeX
        const globe = $('globe-container');
        if(globe) globe.style.transform = `rotateX(${state.pitch * (180/Math.PI)}deg) rotateZ(${-state.heading}deg)`;
        
        // Statut EKF
        if($('ekf-status')) {
            $('ekf-status').textContent = state.acc_gps < 20 ? "FUSION OPTIMALE" : "MODE ESTIME (GROTTE)";
            $('ekf-status').style.color = state.acc_gps < 20 ? "#28a745" : "#ffc107";
        }
    }

    // --- 5. CAPTEURS ---
    window.addEventListener('devicemotion', (e) => {
        state.accRaw = {
            x: e.accelerationIncludingGravity.x || 0,
            y: e.accelerationIncludingGravity.y || 0,
            z: e.accelerationIncludingGravity.z || 0
        };
        // Calcul du pitch/roll pour la boussole 3D
        state.pitch = Math.atan2(-state.accRaw.x, Math.sqrt(state.accRaw.y**2 + state.accRaw.z**2));
        state.roll = Math.atan2(state.accRaw.y, state.accRaw.z);
    });

    window.addEventListener('deviceorientation', (e) => {
        state.heading = e.webkitCompassHeading || e.alpha || 0;
    });

    navigator.geolocation.watchPosition((p) => {
        state.v_gps = p.coords.speed || 0;
        state.acc_gps = p.coords.accuracy || 100;
    }, null, { enableHighAccuracy: true });

    // Contrôles
    $('gps-pause-toggle')?.addEventListener('click', () => {
        state.isPaused = !state.isPaused;
        $('gps-pause-toggle').textContent = state.isPaused ? "▶️ MARCHE GPS" : "⏸️ PAUSE SYSTÈME";
    });

})(window);
