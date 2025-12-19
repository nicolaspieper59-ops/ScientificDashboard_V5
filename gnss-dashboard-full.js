/**
 * GNSS SPACETIME DASHBOARD - V75 "OMNI-PHYSICS"
 * Système Auto-Adaptatif 1000Hz (Inertie / Relativité / Souterrain)
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_STD = 9.80665;

    let state = {
        vx: 0, vy: 0, vz: 0, v: 0,
        x: 0, y: 0, z: 0,
        pitch: 0, roll: 0, heading: 0,
        totalDist: 0, driftNTP: 0,
        accRaw: {x: 0, y: 0, z: 0},
        smoothAcc: {x: 0, y: 0, z: 0},
        isPaused: true
    };

    // --- 1. MOTEUR D'ADAPTATION AUTOMATIQUE ---
    const getEnvironmentConstants = (v, z) => {
        // Détection automatique du milieu
        let density = 1.225 * Math.exp(-z / 8500); // Modèle atmosphérique
        let dragCd = 0.47; // Défaut (Humain/Sphère)

        // Adaptation selon la vitesse (Aérodynamique vs Viscosité)
        if (v < 0.01) { // Mode Gastéropode / Micro
            dragCd = 1.5; // Très haute résistance (viscosité dominante)
        } else if (v > 300 / 3.6) { // Mode Supersonique/Extrême
            dragCd = 0.15; // Profilage automatique
        }

        return { rho: density, cd: dragCd, temp: 15 - (0.0065 * z) };
    };

    // --- 2. BOUCLE DE CALCUL HAUTE FRÉQUENCE (1000 Hz) ---
    setInterval(() => {
        if (state.isPaused) return;
        const dt = 0.001;
        const mass = parseFloat($('mass-input')?.value) || 70;
        const isNether = $('mode-nether')?.textContent.includes('ACTIF');

        // A. FILTRAGE ALPHA-BETA (Lissage 3D & Pitch)
        const alpha = 0.85;
        state.smoothAcc.x = alpha * state.smoothAcc.x + (1 - alpha) * state.accRaw.x;
        state.smoothAcc.y = alpha * state.smoothAcc.y + (1 - alpha) * state.accRaw.y;
        state.smoothAcc.z = alpha * state.smoothAcc.z + (1 - alpha) * state.accRaw.z;

        state.pitch = Math.atan2(-state.smoothAcc.x, Math.sqrt(state.smoothAcc.y**2 + state.smoothAcc.z**2));
        state.roll = Math.atan2(state.smoothAcc.y, state.smoothAcc.z);

        // B. ISOLATION DE LA GRAVITÉ (Réalisme Scientifique)
        const gx = -G_STD * Math.sin(state.pitch);
        const gy = G_STD * Math.cos(state.pitch) * Math.sin(state.roll);
        const gz = G_STD * Math.cos(state.pitch) * Math.cos(state.roll);

        let ax = state.accRaw.x - gx;
        let ay = state.accRaw.y - gy;
        let az = state.accRaw.z - gz;

        // C. TRAÎNÉE ADAPTATIVE (Anti-Infini Automatique)
        const env = getEnvironmentConstants(state.v, state.z);
        const dragF = 0.5 * env.rho * env.cd * 0.5 * (state.v**2);
        const dragAcc = dragF / mass;

        // D. INTÉGRATION VECTORIELLE (Newton + Relativité)
        const gamma = 1 / Math.sqrt(1 - Math.pow(state.v / C, 2));
        
        // On applique la traînée dans la direction opposée au mouvement
        const frictionUnit = 0.9999; // Micro-friction pour stabiliser le zéro
        state.vx = (state.vx + ax * dt) * frictionUnit - (dragAcc * (state.vx / (state.v || 1)) * dt);
        state.vy = (state.vy + ay * dt) * frictionUnit - (dragAcc * (state.vy / (state.v || 1)) * dt);
        state.vz = (state.vz + az * dt) * frictionUnit - (dragAcc * (state.vz / (state.v || 1)) * dt);

        state.v = Math.sqrt(state.vx**2 + state.vy**2 + state.vz**2);

        // E. ESPACE-TEMPS (Nether & Distance)
        const spaceScale = isNether ? 8.0 : 1.0;
        state.totalDist += state.v * dt * spaceScale;
        state.z += state.vz * dt;

        // F. MISE À JOUR VISUELLE (Zéro N/A)
        if (Math.random() > 0.98) updateUI(env, gamma, mass);
    }, 1);

    // --- 3. RÉSOLUTION DES ID HTML (ZÉRO N/A) ---
    function updateUI(env, gamma, mass) {
        const vKmh = state.v * 3.6;
        const vSon = 20.05 * Math.sqrt(env.temp + 273.15);

        // Colonne Centrale
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(3) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(3);
        
        // Physique
        if($('mach-number')) $('mach-number').textContent = (state.v / vSon).toFixed(4);
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * state.v**2).toFixed(2) + " J";
        
        // Environnement & Souterrain
        if($('altitude-ukf')) $('altitude-ukf').textContent = state.z.toFixed(2) + " m";
        if($('air-density')) $('air-density').textContent = env.rho.toFixed(4) + " kg/m³";
        if($('pressure-hpa')) $('pressure-hpa').textContent = (1013 * Math.exp(-state.z/8500)).toFixed(1) + " hPa";

        // Dynamique 3D
        if($('pitch')) $('pitch').textContent = (state.pitch * R2D).toFixed(1) + "°";
        if($('roll')) $('roll').textContent = (state.roll * R2D).toFixed(1) + "°";
        if($('force-g-vert')) $('force-g-vert').textContent = (state.smoothAcc.z / G_STD).toFixed(3) + " G";

        // Globe Interactif
        const globe = $('globe-container');
        if(globe) globe.style.transform = `rotateX(${state.pitch * R2D}deg) rotateZ(${-state.heading}deg)`;
    }

    // --- 4. CAPTEURS ---
    window.addEventListener('devicemotion', (e) => {
        state.accRaw.x = e.accelerationIncludingGravity.x || 0;
        state.accRaw.y = e.accelerationIncludingGravity.y || 0;
        state.accRaw.z = e.accelerationIncludingGravity.z || 0;
    });

    window.addEventListener('deviceorientation', (e) => {
        state.heading = e.webkitCompassHeading || e.alpha || 0;
    });

    $('gps-pause-toggle')?.addEventListener('click', () => {
        state.isPaused = !state.isPaused;
        $('gps-pause-toggle').textContent = state.isPaused ? "▶️ MARCHE GPS" : "⏸️ PAUSE SYSTÈME";
    });

})(window);
