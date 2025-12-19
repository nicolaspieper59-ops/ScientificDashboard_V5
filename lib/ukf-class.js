/**
 * GNSS SpaceTime Dashboard - Moteur Unifié V300
 * Liaison complète avec index.html
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);
    const PHYS = {
        C: 299792458,
        G_STD: 9.80665,
        AU: 149597870700,
        LY: 9460730472580800
    };

    // --- INITIALISATION DU MOTEUR UKF ---
    const engine = new UniversalUKF(100); 
    let isRunning = false;
    let startTime = Date.now();
    let moveTime = 0;
    let lastPos = null;

    // --- ÉTAT GLOBAL POUR L'AFFICHAGE ---
    const state = {
        accRaw: {x: 0, y: 0, z: 0},
        mag: {x: 0, y: 0, z: 0},
        lux: 0,
        db: 0,
        pressure: 1013.25,
        temp: 15
    };

    // --- 1. BOUCLE DE CALCUL HAUTE FRÉQUENCE (1000Hz) ---
    setInterval(() => {
        if (!isRunning) return;

        const now = performance.now();
        const dt = 0.001; // Simulation à 1ms

        // Récupération de la masse
        const mass = parseFloat($('mass-input').value) || 70;

        // Mise à jour du moteur UKF
        engine.predict(dt, state.accRaw, {x:0, y:0, z:0}); 
        
        // Temps de mouvement
        const currentSpeed = parseFloat(engine.getState().speedKmh);
        if (currentSpeed > 0.5) moveTime += dt;

    }, 1);

    // --- 2. MISE À JOUR DE L'INTERFACE (RAF : 60fps) ---
    function updateUI() {
        const ukfState = engine.getState();
        const v = parseFloat(ukfState.speedKmh) / 3.6; // m/s
        const mass = parseFloat($('mass-input').value) || 70;

        // A. Vitesse & Relativité
        $('speed-main-display').textContent = `${ukfState.speedKmh} km/h`;
        $('speed-stable-kmh').textContent = `${ukfState.speedKmh} km/h`;
        $('speed-stable-ms').textContent = `${v.toFixed(2)} m/s`;
        
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / PHYS.C, 2));
        $('lorentz-factor').textContent = gamma.toFixed(14);
        $('mach-number').textContent = (v / 343).toFixed(4);
        $('kinetic-energy').textContent = (0.5 * mass * v**2).toExponential(2) + " J";

        // B. IMU & Dynamique
        $('accel-x').textContent = state.accRaw.x.toFixed(3);
        $('accel-y').textContent = state.accRaw.y.toFixed(3);
        $('accel-z').textContent = state.accRaw.z.toFixed(3);
        $('force-g-vert').textContent = ukfState.verticalG + " G";

        // C. Environnement & Mécanique des fluides
        const rho = 1.225; // Densité air standard
        const drag = 0.5 * rho * v**2 * 0.47 * 0.7;
        $('dynamic-pressure').textContent = (0.5 * rho * v**2).toFixed(2) + " Pa";
        $('drag-force').textContent = drag.toFixed(4) + " N";
        $('drag-power-kw').textContent = ((drag * v) / 1000).toFixed(3) + " kW";

        // D. Distance & Lumière
        const distM = parseFloat(ukfState.distanceM);
        $('total-distance').textContent = `${(distM / 1000).toFixed(3)} km | ${distM.toFixed(2)} m`;
        $('distance-light-s').textContent = (distM / PHYS.C).toExponential(2) + " s";

        // E. Temps
        const elapsed = (Date.now() - startTime) / 1000;
        $('elapsed-time').textContent = elapsed.toFixed(2) + " s";
        $('movement-time').textContent = moveTime.toFixed(2) + " s";
        
        // F. Niveau à bulle
        const pitch = Math.atan2(-state.accRaw.x, state.accRaw.z) * (180/Math.PI);
        const roll = Math.atan2(state.accRaw.y, state.accRaw.z) * (180/Math.PI);
        $('pitch').textContent = pitch.toFixed(1) + "°";
        $('roll').textContent = roll.toFixed(1) + "°";
        $('bubble').style.transform = `translate(${roll * 0.8}px, ${pitch * 0.8}px)`;

        requestAnimationFrame(updateUI);
    }

    // --- 3. CAPTEURS MATÉRIELS ---
    window.addEventListener('devicemotion', (e) => {
        state.accRaw = {
            x: e.accelerationIncludingGravity.x || 0,
            y: e.accelerationIncludingGravity.y || 0,
            z: e.accelerationIncludingGravity.z || 0
        };
    });

    window.addEventListener('devicelight', (e) => {
        state.lux = e.value;
        $('ambient-light').textContent = state.lux + " Lux";
    });

    // --- 4. GPS & GÉOLOCALISATION ---
    navigator.geolocation.watchPosition((p) => {
        const gpsV = p.coords.speed || 0;
        engine.fuseGPS(gpsV, p.coords.accuracy);
        
        $('lat-ukf').textContent = p.coords.latitude.toFixed(6);
        $('lon-ukf').textContent = p.coords.longitude.toFixed(6);
        $('alt-ukf').textContent = (p.coords.altitude || 0).toFixed(2) + " m";
        $('gps-accuracy-display').textContent = p.coords.accuracy.toFixed(2) + " m";
    }, null, { enableHighAccuracy: true });

    // --- 5. ÉVÉNEMENTS BOUTONS ---
    $('gps-pause-toggle').addEventListener('click', function() {
        isRunning = !isRunning;
        this.textContent = isRunning ? "⏸️ PAUSE SYSTÈME" : "▶️ MARCHE GPS";
        this.style.backgroundColor = isRunning ? "#dc3545" : "#28a745";
    });

    $('reset-all-btn').addEventListener('click', () => {
        location.reload();
    });

    // Lancement de l'interface
    requestAnimationFrame(updateUI);

})(window);
