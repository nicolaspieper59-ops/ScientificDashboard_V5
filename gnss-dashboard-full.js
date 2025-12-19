/**
 * GNSS SpaceTime Engine - V400 FINAL
 * Correction Vitesse, Boutons et Astro
 */

((window) => {
    "use strict";
    const $ = id => document.getElementById(id);

    const PHYS = {
        C: 299792458, G: 6.67430e-11, G_STD: 9.80665,
        SOUND_REF: 340.29, L_VISCOSITY: 1.48e-5
    };

    const state = {
        isRunning: false, // Par défaut à l'arrêt (attente bouton)
        v: 0, vMax: 0,
        pos: { lat: 43.2844, lon: 5.3586, alt: 99.9 },
        acc: { x: 0, y: 0, z: 9.81 },
        startTime: Date.now(),
        moveTime: 0
    };

    // --- GESTION DU BOUTON MARCHE/ARRÊT ---
    const gpsBtn = $('gps-pause-toggle');
    if (gpsBtn) {
        gpsBtn.addEventListener('click', () => {
            state.isRunning = !state.isRunning;
            gpsBtn.textContent = state.isRunning ? "⏸️ PAUSE GPS" : "▶️ MARCHE GPS";
            gpsBtn.style.backgroundColor = state.isRunning ? "#dc3545" : "#28a745";
            if(state.isRunning) {
                state.startTime = Date.now();
                syncLoop();
            }
        });
    }

    function updateAstro() {
        const now = new Date();
        const d = (now.getTime() / 86400000) - 2451550.1;
        const phase = (d / 29.5305) % 1;
        
        // Correction de l'illumination (0 à 100%)
        const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2 * 100;
        if($('moon-illuminated')) $('moon-illuminated').textContent = illum.toFixed(1) + " %";
        
        // Equation du temps
        const b = (360/365) * ((now.getTime()/86400000 + 2440587.5) - 2451545.0 - 81);
        const eot = 9.87 * Math.sin(2*b*Math.PI/180) - 7.53 * Math.cos(b*Math.PI/180);
        if($('equation-of-time')) $('equation-of-time').textContent = eot.toFixed(2) + " min";
    }

    function syncLoop() {
        if (!state.isRunning) return;

        // 1. Calcul de la vitesse par l'IMU (Intégration avec Seuil)
        const accMag = Math.sqrt(state.acc.x**2 + state.acc.y**2 + (state.acc.z - 9.81)**2);
        
        // Seuil de mouvement (si acc < 0.1 m/s², on considère l'arrêt)
        if (accMag < 0.001) {
            state.v *= 0.95; // Freinage naturel
            if (state.v < 0.01) state.v = 0;
        } else {
            state.v += (accMag * 0.01); // Intégration simple (dt=10ms)
        }

        const vKmh = state.v * 3.6;
        if (vKmh > state.vMax) state.vMax = vKmh;

        // 2. Mise à jour des IDs de Vitesse (TOUS)
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(3) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-stable-ms')) $('speed-stable-ms').textContent = state.v.toFixed(2) + " m/s";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(2) + " m/s";
        if($('speed-max-session')) $('speed-max-session').textContent = state.vMax.toFixed(1) + " km/h";

        // 3. Physique & Relativité
        const mass = parseFloat($('mass-input').value) || 70;
        const gamma = 1 / Math.sqrt(1 - (state.v**2 / PHYS.C**2));
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        if($('momentum')) $('momentum').textContent = (gamma * mass * state.v).toFixed(4) + " kg·m/s";

        // 4. Forces G
        if($('force-g-long')) $('force-g-long').textContent = (Math.abs(state.acc.x) / 9.81).toFixed(3) + " G";
        if($('force-g-vert')) $('force-g-vert').textContent = (Math.abs(state.acc.z) / 9.81).toFixed(3) + " G";
        if($('accel-long')) $('accel-long').textContent = state.acc.x.toFixed(3) + " m/s²";

        // 5. Fluides (Reynolds)
        const re = (state.v * 1.7) / PHYS.L_VISCOSITY;
        if($('reynolds-number')) $('reynolds-number').textContent = re.toExponential(2);

        updateAstro();
        requestAnimationFrame(syncLoop);
    }

    // Capture des capteurs
    window.addEventListener('devicemotion', (e) => {
        state.acc.x = e.accelerationIncludingGravity.x || 0;
        state.acc.y = e.accelerationIncludingGravity.y || 0;
        state.acc.z = e.accelerationIncludingGravity.z || 0;
    });

    navigator.geolocation.watchPosition((p) => {
        if(p.coords.accuracy < 15) { // On ne fait confiance qu'au GPS précis
            state.v = p.coords.speed || state.v;
            state.pos.lat = p.coords.latitude;
            state.pos.lon = p.coords.longitude;
        }
    }, null, { enableHighAccuracy: true });

})(window);
