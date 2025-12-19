/**
 * GNSS SpaceTime Dashboard - MOTEUR UNIFIÉ V3.5
 * Liaison complète de tous les IDs HTML
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);
    
    // --- CONSTANTES PHYSIQUES ---
    const PHYS = {
        C: 299792458,
        G: 6.67430e-11,
        G_STD: 9.80665,
        SOUND_REF: 340.29,
        R_GAS: 8.314,
        M_AIR: 0.02896
    };

    // --- ÉTAT DU SYSTÈME ---
    const state = {
        startTime: Date.now(),
        moveTime: 0,
        v: 0, // m/s
        vKmh: 0,
        vMax: 0,
        pos: { lat: 48.8566, lon: 2.3522, alt: 0 },
        acc: { x: 0, y: 0, z: 9.81 },
        isGpsActive: false
    };

    // --- 1. FONCTIONS DE CALCUL SCIENTIFIQUE ---
    
    function updatePhysics() {
        const mass = parseFloat($('mass-input').value) || 70;
        const v = state.v;

        // A. Relativité (Suppression N/A)
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / PHYS.C, 2));
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * v**2).toExponential(2) + " J";
        if($('relativistic-energy')) $('relativistic-energy').textContent = (gamma * mass * PHYS.C**2).toExponential(2) + " J";
        if($('rest-mass-energy')) $('rest-mass-energy').textContent = (mass * PHYS.C**2).toExponential(2) + " J";
        if($('schwarzschild-radius')) $('schwarzschild-radius').textContent = ((2 * PHYS.G * mass) / PHYS.C**2).toExponential(4) + " m";
        if($('momentum')) $('momentum').textContent = (gamma * mass * v).toFixed(4) + " kg·m/s";

        // B. Mécanique des Fluides
        const rho = 1.225 * Math.exp(-state.pos.alt / 8500); // Modèle atmosphérique
        const dynamicQ = 0.5 * rho * v**2;
        const drag = dynamicQ * 0.47 * 0.7; // Hypothèse : Cd=0.47, Aire=0.7m²
        
        if($('air-density')) $('air-density').textContent = rho.toFixed(4) + " kg/m³";
        if($('pressure-hpa')) $('pressure-hpa').textContent = (1013.25 * Math.exp(-state.pos.alt / 8500)).toFixed(1) + " hPa";
        if($('dynamic-pressure')) $('dynamic-pressure').textContent = dynamicQ.toFixed(2) + " Pa";
        if($('drag-force')) $('drag-force').textContent = drag.toFixed(4) + " N";
        if($('mach-number')) $('mach-number').textContent = (v / PHYS.SOUND_REF).toFixed(4);
        if($('reynolds-number')) $('reynolds-number').textContent = ((v * 1.7) / 1.48e-5).toExponential(2);

        // C. Dynamique & Forces
        if($('local-gravity')) $('local-gravity').textContent = PHYS.G_STD.toFixed(4) + " m/s²";
        if($('coriolis-force')) {
            const fCoriolis = 2 * mass * v * 7.2921e-5 * Math.sin(state.pos.lat * Math.PI / 180);
            $('coriolis-force').textContent = fCoriolis.toFixed(4) + " N";
        }
    }

    function updateAstro() {
        const now = new Date();
        const lat = state.pos.lat;
        const hours = now.getUTCHours() + now.getUTCMinutes()/60;

        // Soleil (Approximation)
        const sunAlt = 90 - Math.abs(lat - (23.45 * Math.sin((360/365)*(now.getDate()-81) * Math.PI/180)));
        if($('sun-alt')) $('sun-alt').textContent = sunAlt.toFixed(2) + "°";
        if($('sun-azimuth')) $('sun-azimuth').textContent = ((hours * 15 + 180) % 360).toFixed(1) + "°";

        // Lune
        const d = (now.getTime() / 86400000) - 2451550.1;
        const phase = (d / 29.5305) % 1;
        if($('moon-phase-name')) $('moon-phase-name').textContent = phase < 0.5 ? "Croissante" : "Décroissante";
        if($('moon-illuminated')) $('moon-illuminated').textContent = (Math.abs(50 - phase * 100) * 2).toFixed(1) + " %";
        
        // Minecraft Time
        if($('time-minecraft')) {
            const mcHours = (now.getHours() % 24).toString().padStart(2, '0');
            const mcMins = now.getMinutes().toString().padStart(2, '0');
            $('time-minecraft').textContent = `${mcHours}:${mcMins}`;
        }
    }

    // --- 2. GESTION DES CAPTEURS ET BOUCLE RAF ---
    
    function mainLoop() {
        // Temps
        const elapsed = (Date.now() - state.startTime) / 1000;
        if($('elapsed-time')) $('elapsed-time').textContent = elapsed.toFixed(2) + " s";
        if($('local-time')) $('local-time').textContent = new Date().toLocaleTimeString();
        if($('utc-datetime')) $('utc-datetime').textContent = new Date().toUTCString();

        // Vitesse & Distance (Lissage Filtre Passe-Bas)
        if($('speed-main-display')) $('speed-main-display').textContent = (state.v * 3.6).toFixed(3) + " km/h";
        
        // Globe & Niveau à bulle
        const pitch = Math.atan2(-state.acc.x, state.acc.z) * (180/Math.PI);
        const roll = Math.atan2(state.acc.y, state.acc.z) * (180/Math.PI);
        if($('pitch')) $('pitch').textContent = pitch.toFixed(1) + "°";
        if($('roll')) $('roll').textContent = roll.toFixed(1) + "°";
        if($('bubble')) $('bubble').style.transform = `translate(${roll * 0.8}px, ${pitch * 0.8}px)`;

        updatePhysics();
        updateAstro();
        requestAnimationFrame(mainLoop);
    }

    // --- 3. ÉVÉNEMENTS MATÉRIELS ---

    window.addEventListener('devicemotion', (e) => {
        state.acc.x = e.accelerationIncludingGravity.x || 0;
        state.acc.y = e.accelerationIncludingGravity.y || 0;
        state.acc.z = e.accelerationIncludingGravity.z || 0;
        
        if($('accel-x')) $('accel-x').textContent = state.acc.x.toFixed(3);
        if($('accel-y')) $('accel-y').textContent = state.acc.y.toFixed(3);
        if($('accel-z')) $('accel-z').textContent = state.acc.z.toFixed(3);
    });

    navigator.geolocation.watchPosition((p) => {
        state.v = p.coords.speed || 0;
        state.pos.lat = p.coords.latitude;
        state.pos.lon = p.coords.longitude;
        state.pos.alt = p.coords.altitude || 0;

        if($('lat-ukf')) $('lat-ukf').textContent = state.pos.lat.toFixed(6);
        if($('lon-ukf')) $('lon-ukf').textContent = state.pos.lon.toFixed(6);
        if($('alt-ukf')) $('alt-ukf').textContent = state.pos.alt.toFixed(2) + " m";
        if($('gps-accuracy-display')) $('gps-accuracy-display').textContent = p.coords.accuracy.toFixed(1) + " m";
    }, null, { enableHighAccuracy: true });

    // Lancement
    mainLoop();

})(window);
