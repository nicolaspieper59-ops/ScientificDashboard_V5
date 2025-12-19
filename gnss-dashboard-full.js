/**
 * GNSS SpaceTime Engine - V5.0 FINAL UNIFIED
 * Système de Navigation Scientifique Haute Précision
 */

((window) => {
    "use strict";

    const $ = id => document.getElementById(id);

    // --- CONSTANTES PHYSIQUES UNIVERSELLES ---
    const PHYS = {
        C: 299792458,
        G: 6.67430e-11,
        G_STD: 9.80665,
        SOUND_0: 340.29,
        R_GAS: 8.31446,
        M_AIR: 0.02896,
        VISCOSITY: 1.48e-5
    };

    // --- ÉTAT GLOBAL DU SYSTÈME ---
    const state = {
        isRunning: false, // Par défaut en pause (cliquez sur MARCHE)
        v: 0,
        vMax: 0,
        totalDist: 0,
        moveTime: 0,
        startTime: Date.now(),
        lastUpdate: performance.now(),
        pos: { lat: 43.2844, lon: 5.3586, alt: 100 },
        acc: { x: 0, y: 0, z: 9.81 },
        gyro: { x: 0, y: 0, z: 0 }
    };

    // --- 1. GESTION DES BOUTONS & CONTRÔLES ---
    const toggleBtn = $('gps-pause-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            state.isRunning = !state.isRunning;
            toggleBtn.textContent = state.isRunning ? "⏸️ PAUSE GPS" : "▶️ MARCHE GPS";
            toggleBtn.style.backgroundColor = state.isRunning ? "#dc3545" : "#28a745";
            if (state.isRunning) {
                state.lastUpdate = performance.now();
                requestAnimationFrame(updateLoop);
            }
        });
    }

    // --- 2. LOGIQUE ASTRONOMIQUE (Élimine les N/A) ---
    function updateAstro() {
        const now = new Date();
        const lat = state.pos.lat;
        const lon = state.pos.lon;
        const jd = (now.getTime() / 86400000) + 2440587.5;
        const d = jd - 2451545.0;

        // Soleil (Altitude & Azimut)
        const dec = 23.44 * Math.sin((360/365 * (d - 80)) * Math.PI/180);
        const ha = (now.getUTCHours() + now.getUTCMinutes()/60 + lon/15 - 12) * 15;
        const alt = Math.asin(Math.sin(lat*Math.PI/180)*Math.sin(dec*Math.PI/180) + Math.cos(lat*Math.PI/180)*Math.cos(dec*Math.PI/180)*Math.cos(ha*Math.PI/180));
        
        if($('sun-altitude')) $('sun-altitude').textContent = (alt * 180/Math.PI).toFixed(2) + "°";
        if($('sun-azimuth')) $('sun-azimuth').textContent = ((ha + 180) % 360).toFixed(1) + "°";

        // Lune (Illumination corrigée)
        const phase = ((jd - 2451550.1) / 29.5305) % 1;
        const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2 * 100;
        if($('moon-illuminated')) $('moon-illuminated').textContent = illum.toFixed(1) + " %";
        if($('moon-phase-name')) $('moon-phase-name').textContent = phase < 0.5 ? "Croissante" : "Décroissante";
        
        // Temps Sidéral
        const lst = (100.46 + 0.985647 * d + lon + 15 * (now.getUTCHours() + now.getUTCMinutes()/60)) % 360;
        if($('sidereal-time')) $('sidereal-time').textContent = (lst / 15).toFixed(4) + " h";
    }

    // --- 3. BOUCLE DE CALCUL PHYSIQUE (MOTEUR UKF SIMPLIFIÉ) ---
    function updateLoop() {
        if (!state.isRunning) return;

        const now = performance.now();
        const dt = (now - state.lastUpdate) / 1000;
        state.lastUpdate = now;

        const mass = parseFloat($('mass-input')?.value) || 70;

        // A. Traitement de la Vitesse & Inertie
        const accMag = Math.sqrt(state.acc.x**2 + state.acc.y**2 + (state.acc.z - PHYS.G_STD)**2);
        
        // Seuil de bruit (Zero-Velocity Update)
        if (accMag < 0.12) {
            state.v *= 0.98; // Freinage passif
            if (state.v < 0.001) state.v = 0;
        } else {
            state.v += (accMag * dt); 
        }

        if (state.v > 0.1) state.moveTime += dt;
        if (state.v > state.vMax) state.vMax = state.v;
        state.totalDist += state.v * dt;

        // B. Mise à jour de l'affichage Vitesse (ID SYNC)
        const vKmh = state.v * 3.6;
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(3) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-stable-ms')) $('speed-stable-ms').textContent = state.v.toFixed(2) + " m/s";
        if($('speed-max-session')) $('speed-max-session').textContent = (state.vMax * 3.6).toFixed(1) + " km/h";
        if($('total-distance')) $('total-distance').textContent = `${(state.totalDist/1000).toFixed(3)} km | ${state.totalDist.toFixed(2)} m`;
        if($('movement-time')) $('movement-time').textContent = state.moveTime.toFixed(2) + " s";

        // C. Relativité (Lorentz, Schwarzschild, Energie)
        const gamma = 1 / Math.sqrt(1 - Math.pow(state.v / PHYS.C, 2));
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        if($('schwarzschild-radius')) $('schwarzschild-radius').textContent = ((2 * PHYS.G * mass) / Math.pow(PHYS.C, 2)).toExponential(4) + " m";
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * state.v**2).toExponential(2) + " J";
        if($('relativistic-energy')) $('relativistic-energy').textContent = (gamma * mass * PHYS.C**2).toExponential(2) + " J";

        // D. Mécanique des Fluides
        const rho = 1.225 * Math.exp(-state.pos.alt / 8500);
        const dynamicQ = 0.5 * rho * state.v**2;
        const drag = dynamicQ * 0.47 * 0.7;
        if($('dynamic-pressure')) $('dynamic-pressure').textContent = dynamicQ.toFixed(2) + " Pa";
        if($('drag-force')) $('drag-force').textContent = drag.toFixed(4) + " N";
        if($('reynolds-number')) $('reynolds-number').textContent = ((state.v * 1.7) / PHYS.VISCOSITY).toExponential(2);
        if($('mach-number')) $('mach-number').textContent = (state.v / PHYS.SOUND_0).toFixed(4);

        // E. Orientation GlobeX & Niveau
        const pitch = Math.atan2(-state.acc.x, state.acc.z) * (180/Math.PI);
        const roll = Math.atan2(state.acc.y, state.acc.z) * (180/Math.PI);
        if($('pitch')) $('pitch').textContent = pitch.toFixed(1) + "°";
        if($('roll')) $('roll').textContent = roll.toFixed(1) + "°";
        
        const globe = $('globe-container');
        if(globe) globe.style.transform = `rotateX(${-pitch}deg) rotateZ(${roll}deg)`;

        // F. Horloge
        if($('local-time')) $('local-time').textContent = new Date().toLocaleTimeString();

        updateAstro();
        requestAnimationFrame(updateLoop);
    }

    // --- 4. CAPTEURS MATÉRIELS ---
    window.addEventListener('devicemotion', (e) => {
        state.acc.x = e.accelerationIncludingGravity.x || 0;
        state.acc.y = e.accelerationIncludingGravity.y || 0;
        state.acc.z = e.accelerationIncludingGravity.z || 0;
        
        if($('accel-x')) $('accel-x').textContent = state.acc.x.toFixed(3);
        if($('accel-y')) $('accel-y').textContent = state.acc.y.toFixed(3);
        if($('accel-z')) $('accel-z').textContent = state.acc.z.toFixed(3);
        if($('force-g-vert')) $('force-g-vert').textContent = (state.acc.z / PHYS.G_STD).toFixed(3) + " G";
    });

    navigator.geolocation.watchPosition((p) => {
        state.pos.lat = p.coords.latitude;
        state.pos.lon = p.coords.longitude;
        state.pos.alt = p.coords.altitude || 100;
        
        if($('lat-ukf')) $('lat-ukf').textContent = state.pos.lat.toFixed(6);
        if($('lon-ukf')) $('lon-ukf').textContent = state.pos.lon.toFixed(6);
        if($('alt-ukf')) $('alt-ukf').textContent = state.pos.alt.toFixed(2) + " m";
    }, null, { enableHighAccuracy: true });

})(window);
