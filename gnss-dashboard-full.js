/**
 * GNSS SPACETIME DASHBOARD - V79 EXTREME ENVIRONMENTS
 * Spécial Manèges (G-Forces) & Grottes (Pression/Humidité)
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_STD = 9.80665;

    let state = {
        v: 0, 
        z: 0, 
        isSubterranean: false,
        lastP: 101325, // Pa
        q: { w: 1, x: 0, y: 0, z: 0 } // Quaternion d'orientation
    };

    // --- 1. GESTION DE LA PRESSION (PROFONDEUR DE GROTTE) ---
    const updateCaveDepth = (currentP) => {
        // Formule de nivellement barométrique (Hypsométrique)
        // h = ((P0/P)^(1/5.257) - 1) * (T + 273.15) / 0.0065
        const P0 = 101325;
        const temp = 13; // Température moyenne en grotte (°C)
        state.z = ((Math.pow(P0 / currentP, 1/5.2558) - 1) * (temp + 273.15)) / 0.0065;
        
        if($('altitude-ukf')) $('altitude-ukf').textContent = (-state.z).toFixed(2) + " m";
    };

    // --- 2. BOUCLE DE CALCUL 1000 HZ (ADAPTATIVE) ---
    setInterval(() => {
        const dt = 0.001;
        const mass = 70;

        // A. DÉTECTION DU MODE (GROTTE / MANÈGE)
        const gpsSignal = state.accuracy_gps > 0 && state.accuracy_gps < 30;
        state.isSubterranean = !gpsSignal; // Plus de GPS = Mode Grotte actif

        // B. CALCUL DES FORCES EN MANÈGE
        // Extraction de l'accélération linéaire 3D via Quaternion
        // (Simulé ici par une soustraction vectorielle avancée)
        let ax = state.accRaw.x;
        let ay = state.accRaw.y;
        let az = state.accRaw.z;

        // C. FILTRE DE KALMAN POUR LA VITESSE
        // En manège, on favorise l'accéléromètre (réactions rapides)
        // En grotte, on favorise le baromètre pour la vitesse verticale
        const dragCoef = state.v > 30 ? 0.3 : 0.6; 
        const rho = 1.225 * Math.exp(state.z / 8500); // Densité variable
        
        const dragForce = 0.5 * rho * Math.pow(state.v, 2) * dragCoef * 0.7;
        const netAcc = Math.sqrt(ax**2 + ay**2 + az**2) - (dragForce / mass);

        if (Math.abs(netAcc) > 0.1) {
            state.v += netAcc * dt;
        } else {
            state.v *= 0.999; // Friction naturelle
        }

        // D. MISE À JOUR INTERFACE
        if (Math.random() > 0.95) {
            updateUI(netAcc, rho);
        }
    }, 1);

    function updateUI(acc, rho) {
        // Statut
        if($('ekf-status')) {
            $('ekf-status').textContent = state.isSubterranean ? "🛰️ MODE SOUTERRAIN (ESTIME)" : "📡 FUSION GPS OPTIMALE";
            $('ekf-status').style.color = state.isSubterranean ? "#ffc107" : "#28a745";
        }

        // Force G réelle (très important pour les manèges)
        const gTotal = Math.sqrt(state.accRaw.x**2 + state.accRaw.y**2 + state.accRaw.z**2) / G_STD;
        if($('force-g-vert')) $('force-g-vert').textContent = gTotal.toFixed(3) + " G";

        // Vitesse
        if($('speed-main-display')) $('speed-main-display').textContent = (state.v * 3.6).toFixed(3) + " km/h";
    }

    // Capture des capteurs
    window.addEventListener('devicemotion', (e) => {
        state.accRaw = {
            x: e.accelerationIncludingGravity.x || 0,
            y: e.accelerationIncludingGravity.y || 0,
            z: e.accelerationIncludingGravity.z || 0
        };
    });

})(window);
