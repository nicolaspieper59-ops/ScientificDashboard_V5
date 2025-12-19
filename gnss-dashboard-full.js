/**
 * GNSS SpaceTime Dashboard - ULTIMATE UNIFIED ENGINE
 * Version Finale : Correction Supersonique & Liaison Totale
 */

((window) => {
    "use strict";
    const $ = id => document.getElementById(id);

    // --- CONFIGURATION & CONSTANTES ---
    const PHYS = {
        C: 299792458, G: 6.67430e-11, G_STD: 9.80665,
        SOUND: 340.29, RHO_0: 1.225, VISCOSITY: 1.48e-5
    };

    const state = {
        isRunning: true, // État du bouton
        vMs: 0, vMax: 0, dist: 0,
        pos: { lat: 43.2844, lon: 5.3585, alt: 100 },
        acc: { x: 0, y: 0, z: 9.81 },
        lastT: performance.now(),
        moveTime: 0
    };

    // --- 1. GESTION DES BOUTONS (HTML IDs) ---
    const setupControls = () => {
        const btn = $('gps-pause-toggle');
        if (btn) {
            btn.onclick = () => {
                state.isRunning = !state.isRunning;
                btn.textContent = state.isRunning ? "⏸️ PAUSE GPS" : "▶️ MARCHE GPS";
                btn.className = state.isRunning ? "btn-danger" : "btn-success";
            };
        }
        const resetBtn = $('reset-vmax');
        if (resetBtn) resetBtn.onclick = () => { state.vMax = 0; };
    };

    // --- 2. MOTEUR DE CALCUL (LA PHYSIQUE) ---
    function computePhysics(dt) {
        const mass = parseFloat($('mass-input')?.value) || 70;
        
        // A. Calcul de l'accélération nette (IMU - Gravité)
        const netAcc = Math.sqrt(state.acc.x**2 + state.acc.y**2 + (state.acc.z - PHYS.G_STD)**2);
        
        // B. Friction Aérodynamique (Le correcteur)
        const rho = PHYS.RHO_0 * Math.exp(-state.pos.alt / 8500);
        const dragForce = 0.5 * rho * Math.pow(state.vMs, 2) * 0.47 * 0.7;
        const dragDecel = dragForce / mass;

        // C. Intégration avec ZUPT (Zero Velocity Update)
        if (netAcc < 0.15 && !state.gpsActive) {
            state.vMs *= 0.9; // Freinage rapide si immobile
            if (state.vMs < 0.01) state.vMs = 0;
        } else {
            state.vMs += (netAcc - dragDecel) * dt;
        }
        
        if (state.vMs < 0) state.vMs = 0;
        if (state.vMs > 0.1) state.moveTime += dt;
        
        const vKmh = state.vMs * 3.6;
        if (vKmh > state.vMax) state.vMax = vKmh;

        // --- 3. INJECTION DANS LE HTML (ZÉRO N/A) ---
        
        // Vitesse & Relativité
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(3) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-max-session')) $('speed-max-session').textContent = state.vMax.toFixed(1) + " km/h";
        if($('movement-time')) $('movement-time').textContent = state.moveTime.toFixed(1) + " s";

        const gamma = 1 / Math.sqrt(1 - Math.pow(state.vMs / PHYS.C, 2));
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        if($('schwarzschild-radius')) $('schwarzschild-radius').textContent = ((2 * PHYS.G * mass) / Math.pow(PHYS.C, 2)).toExponential(4) + " m";
        if($('kinetic-energy')) $('kinetic-energy').textContent = (0.5 * mass * state.vMs**2).toExponential(2) + " J";
        if($('momentum')) $('momentum').textContent = (gamma * mass * state.vMs).toFixed(4) + " kg·m/s";

        // Fluides
        if($('air-density')) $('air-density').textContent = rho.toFixed(4) + " kg/m³";
        if($('drag-force')) $('drag-force').textContent = dragForce.toFixed(4) + " N";
        if($('reynolds-number')) $('reynolds-number').textContent = ((state.vMs * 1.7) / PHYS.VISCOSITY).toExponential(2);
        if($('mach-number')) $('mach-number').textContent = (state.vMs / PHYS.SOUND).toFixed(4);

        // Forces
        if($('force-g-vert')) $('force-g-vert').textContent = (state.acc.z / PHYS.G_STD).toFixed(3) + " G";
        if($('accel-long')) $('accel-long').textContent = state.acc.x.toFixed(3) + " m/s²";
    }

    // --- 4. NAVIGATION ASTRONOMIQUE ---
    function computeAstro() {
        const now = new Date();
        const d = (now.getTime() / 86400000) - 2451550.1;
        const phase = (d / 29.5305) % 1;
        const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2 * 100;
        
        if($('moon-illuminated')) $('moon-illuminated').textContent = illum.toFixed(1) + " %";
        if($('moon-phase-name')) $('moon-phase-name').textContent = phase < 0.5 ? "Croissante" : "Décroissante";
        if($('local-time')) $('local-time').textContent = now.toLocaleTimeString();
        
        // Equation du temps
        const b = (360/365) * (new Date().getDate() - 81);
        const eot = 9.87 * Math.sin(2*b*Math.PI/180) - 7.53 * Math.cos(b*Math.PI/180);
        if($('equation-of-time')) $('equation-of-time').textContent = eot.toFixed(2) + " min";
    }

    // --- BOUCLE PRINCIPALE ---
    function ticTac() {
        if (state.isRunning) {
            const now = performance.now();
            const dt = (now - state.lastT) / 1000;
            state.lastT = now;

            computePhysics(dt);
            computeAstro();
        }
        requestAnimationFrame(ticTac);
    }

    // --- CAPTEURS ---
    window.addEventListener('devicemotion', (e) => {
        state.acc.x = e.accelerationIncludingGravity.x || 0;
        state.acc.y = e.accelerationIncludingGravity.y || 0;
        state.acc.z = e.accelerationIncludingGravity.z || 9.81;
    });

    navigator.geolocation.watchPosition((p) => {
        state.pos.lat = p.coords.latitude;
        state.pos.lon = p.coords.longitude;
        state.pos.alt = p.coords.altitude || 100;
        state.gpsActive = true;
    }, null, { enableHighAccuracy: true });

    setupControls();
    ticTac();

})(window);
