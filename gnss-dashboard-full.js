/**
 * GNSS SPACETIME DASHBOARD - V76 PRECISION-STANDARD
 * Basé sur les constantes CODATA et le modèle OACI.
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);

    // --- CONSTANTES OFFICIELLES (CODATA / OACI / WGS 84) ---
    const PHYS = {
        C: 299792458,                   // Vitesse de la lumière (m/s)
        G: 6.67430e-11,                 // Constante de Gravitation (m³/kg/s²)
        G_STD: 9.80665,                 // Pesanteur standard (m/s²)
        R_GAS: 8.314462618,             // Constante des gaz parfaits (J/mol·K)
        M_AIR: 0.0289644,               // Masse molaire de l'air (kg/mol)
        P0: 101325,                     // Pression standard mer (Pa)
        T0: 288.15,                     // Température standard mer (K)
        L: 0.0065,                      // Gradient thermique (K/m)
        SIGMA: 5.670374419e-8           // Constante de Stefan-Boltzmann
    };

    let state = {
        vx: 0, vy: 0, vz: 0, v: 7.996,  // Initialisé à 28.786 km/h (votre capture)
        x: 0, y: 0, z: 13.5,            // Altitude estimée d'après vos 1011.7 hPa
        pitch: 25.5 * (Math.PI / 180),
        roll: -134.4 * (Math.PI / 180),
        totalDist: 0,
        accRaw: { x: 0, y: 0, z: -0.622 * 9.80665 },
        isPaused: false
    };

    // --- 1. MODÈLE ATMOSPHÉRIQUE OFFICIEL (ISA / OACI) ---
    const getOfficialAtmo = (h) => {
        const T = PHYS.T0 - PHYS.L * h;
        const P = PHYS.P0 * Math.pow(1 - (PHYS.L * h) / PHYS.T0, (PHYS.G_STD * PHYS.M_AIR) / (PHYS.R_GAS * PHYS.L));
        const rho = (P * PHYS.M_AIR) / (PHYS.R_GAS * T);
        return { rho, P, T_celsius: T - 273.15 };
    };

    // --- 2. MOTEUR DE CALCUL 1000 HZ ---
    setInterval(() => {
        if (state.isPaused) return;
        const dt = 0.001;
        const mass = parseFloat($('mass-input')?.value) || 70;

        // A. ISOLATION VECTORIELLE DE LA GRAVITÉ (3D)
        // Calcul du vecteur gravité projeté sur le châssis de l'appareil
        const gx = -PHYS.G_STD * Math.sin(state.pitch);
        const gy = PHYS.G_STD * Math.cos(state.pitch) * Math.sin(state.roll);
        const gz = PHYS.G_STD * Math.cos(state.pitch) * Math.cos(state.roll);

        // Accélération linéaire pure = Brute - Gravité
        let ax = state.accRaw.x - gx;
        let ay = state.accRaw.y - gy;
        let az = state.accRaw.z - gz;

        // B. TRAÎNÉE AÉRODYNAMIQUE (Calcul réaliste)
        const atmo = getOfficialAtmo(state.z);
        const Cd = 0.47; // Coefficient pour un corps humain/objet standard
        const Area = 0.7; // Surface frontale moyenne m²
        const dragForce = 0.5 * atmo.rho * Cd * Area * Math.pow(state.v, 2);
        const dragAcc = dragForce / mass;

        // C. INTÉGRATION DE NEWTON (Vitesse & Position)
        // La traînée s'oppose toujours au vecteur vitesse
        const vRatio = state.v > 0 ? (dragAcc * dt) / state.v : 0;
        state.vx += ax * dt - state.vx * vRatio;
        state.vy += ay * dt - state.vy * vRatio;
        state.vz += az * dt - state.vz * vRatio;

        state.v = Math.sqrt(Math.pow(state.vx, 2) + Math.pow(state.vy, 2) + Math.pow(state.vz, 2));
        state.z += state.vz * dt;
        state.totalDist += state.v * dt;

        // D. MISE À JOUR VISUELLE (Optimisée 20Hz)
        if (Math.random() > 0.98) updateDashboard(atmo, mass);
    }, 1);

    // --- 3. RENDU DES DONNÉES SCIENTIFIQUES ---
    function updateDashboard(atmo, mass) {
        // Relativité Restreinte
        const beta = state.v / PHYS.C;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        const energy_rest = mass * Math.pow(PHYS.C, 2); // E0 = mc²
        const energy_kin = (gamma - 1) * energy_rest;   // Énergie cinétique relativiste

        // Rayon de Schwarzschild (Rs = 2GM / c²)
        const Rs = (2 * PHYS.G * mass) / Math.pow(PHYS.C, 2);

        // Vitesse du Son Locale (c = sqrt(gamma * R * T / M))
        const speed_sound = Math.sqrt(1.4 * PHYS.R_GAS * (atmo.T_celsius + 273.15) / PHYS.M_AIR);

        // Mapping DOM
        if($('speed-main-display')) $('speed-main-display').textContent = (state.v * 3.6).toFixed(3) + " km/h";
        if($('mach-number')) $('mach-number').textContent = (state.v / speed_sound).toFixed(4);
        if($('air-density')) $('air-density').textContent = atmo.rho.toFixed(4) + " kg/m³";
        if($('pressure-hpa')) $('pressure-hpa').textContent = (atmo.P / 100).toFixed(1) + " hPa";
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        if($('schwarzschild-radius')) $('schwarzschild-radius').textContent = Rs.toExponential(4) + " m";
        if($('energy-mass-rest')) $('energy-mass-rest').textContent = energy_rest.toExponential(4) + " J";
        if($('kinetic-energy')) $('kinetic-energy').textContent = energy_kin.toExponential(2) + " J";
    }

    // Capture des mouvements (IMU)
    window.addEventListener('devicemotion', (e) => {
        state.accRaw.x = e.accelerationIncludingGravity.x || 0;
        state.accRaw.y = e.accelerationIncludingGravity.y || 0;
        state.accRaw.z = e.accelerationIncludingGravity.z || 0;
    });

})(window);
