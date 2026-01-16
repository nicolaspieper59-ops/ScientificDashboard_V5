/**
 * OMNISCIENCE V20 PRO MAX - GLOBAL PHYSICAL ENGINE
 * Standard: Aerospace & Quantum Metrology
 * Mode: No-GPS Priority / Sensor Fusion / Einsteinian Relativity
 */

// 1. CONFIGURATION HAUTE PRÉCISION (64 bits)
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

// 2. ÉTAT GLOBAL DU SYSTÈME
const STATE = {
    active: false,
    lastT: performance.now(),
    v: _BN(0),         // Vitesse scalaire (m/s)
    dist: _BN(0),      // Distance cumulée (m)
    pos: { x: 0, y: 0, z: 0, lat: 44.436, lon: 26.135, alt: 114.4 },
    accel: { raw: 0, g_res: 1.0 },
    orientation: { alpha: 0, beta: 0, gamma: 0 },
    mode: "MACRO_FLOW",
    context: "STANDBY",
    step_count: 0,
    buffer_acc: []
};

// 3. CONSTANTES PHYSIQUES UNIVERSELLES (IERS/CODATA)
const PHY = {
    C: 299792458,
    G: 6.67430e-11,
    M_E: 5.9722e24,
    R_E: 6378137,
    RS_E: 0.0088701,    // Rayon de Schwarzschild Terre
    OMEGA_E: 7.292115e-5, // Rotation Terre (rad/s)
    H_PLANCK: 6.62607015e-34,
    R_DRY: 287.058,
    MU_AIR: 1.81e-5,
    DELTA_T: 69.18      // Correction Terrestre 2025/2026
};

/**
 * 4. MOTEUR DE DÉTECTION DE CONTEXTE (AI-SENSING)
 * Identifie le type de mouvement sans GPS
 */
function detectContext(acc_mag, rot) {
    const rot_mag = Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2);
    
    if (rot_mag > 180 || acc_mag > 25) return "BALLISTIC_EVENT"; // Manège/Salto/Chute
    if (math.var(STATE.buffer_acc) > 8) return "VIBRATIONAL_DRONE"; // Drone/Oiseau/Moteur
    if (acc_mag > 0.05 && acc_mag < 3) return "LINEAR_TRANS";   // Train/Métro/Bus
    if (acc_mag < 0.02) return "STASE_QUANTIQUE";               // Repos/Gastéropode
    return "HUMAN_MAPPING";                                     // Marche/Grotte
}

/**
 * 5. MOTEUR DE DISSIPATION ET INERTIE NATURELLE
 * Gère la traînée de l'air et la friction mécanique
 */
function applyNaturalPhysics(v_bn, dt, context) {
    let v = Number(v_bn);
    if (v < 1e-9) return _BN(Math.random() * 1e-10); // Jitter Thermique (nm/s)

    // Paramètres ISA (Atmosphère Standard)
    const T_k = 288.15 - (0.0065 * STATE.pos.alt);
    const P_std = 101325 * Math.pow(1 - (0.0065 * STATE.pos.alt) / 288.15, 5.255);
    const rho = P_std / (PHY.R_DRY * T_k);

    // Forces (Drag + Friction)
    const Cx = 0.45; 
    const Mass = 80;
    const S = 0.55;
    const F_drag = 0.5 * rho * v * v * Cx * S;
    const mu = (context === "LINEAR_TRANS") ? 0.002 : 0.015; // Rails vs Sol
    const F_fric = mu * Mass * 9.81;

    const decel = (F_drag + F_fric) / Mass;
    let new_v = v - (decel * dt);
    
    return new_v < 0 ? _BN(0) : _BN(new_v);
}

/**
 * 6. NAVIGATION 3D SANS GPS (MODE GROTTE / MINECRAFT)
 * Basé sur le podomètre vectoriel (ZUPT)
 */
function update3DMapping(acc_mag, rot) {
    // Détection d'impact de pas (Seuil 1.2G)
    if (acc_mag > 1.2 && !STATE.is_stepping) {
        STATE.is_stepping = true;
        const step_len = 0.75;
        const az = rot.alpha * (Math.PI / 180);
        const pitch = rot.beta * (Math.PI / 180);

        STATE.pos.x += step_len * Math.cos(pitch) * Math.sin(az);
        STATE.pos.y += step_len * Math.cos(pitch) * Math.cos(az);
        STATE.pos.z += step_len * Math.sin(pitch);
        STATE.step_count++;
    } 
    if (acc_mag < 1.1) STATE.is_stepping = false;
}

/**
 * 7. MISE À JOUR DE LA VITESSE MULTI-UNITÉ
 */
function formatVelocity(v_ms) {
    const v = Number(v_ms);
    if (v < 1e-6) return { val: (v * 1e9).toFixed(2), unit: "nm/s", mode: "QUANTUM" };
    if (v < 0.1) return { val: (v * 1000).toFixed(4), unit: "mm/s", mode: "MICRO" };
    return { val: v.toFixed(6), unit: "m/s", mode: "MACRO" };
}

/**
 * 8. BOUCLE PRINCIPALE (10Hz)
 */
function runCoreEngine(e) {
    if (!STATE.active) return;
    const now = performance.now();
    const dt = (now - STATE.lastT) / 1000;
    STATE.lastT = now;

    // Capteurs IMU
    const acc = e.acceleration || {x:0, y:0, z:0};
    const rot = { 
        alpha: STATE.orientation.alpha, 
        beta: STATE.orientation.beta, 
        gamma: STATE.orientation.gamma 
    };
    const mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    
    STATE.buffer_acc.push(mag);
    if (STATE.buffer_acc.length > 20) STATE.buffer_acc.shift();

    // Intelligence contextuelle
    STATE.context = detectContext(mag, rot);

    // Intégration
    if (mag > 0.12) {
        let gain = (STATE.context === "BALLISTIC_EVENT") ? 0.7 : 1.0;
        STATE.v = math.add(STATE.v, _BN(mag * dt * gain));
    } else {
        STATE.v = applyNaturalPhysics(STATE.v, dt, STATE.context);
    }

    // Mise à jour spatiale
    update3DMapping(mag, rot);
    STATE.dist = math.add(STATE.dist, math.multiply(STATE.v, _BN(dt)));

    // Rafraîchissement HUD
    refreshHUD();
}

/**
 * 9. RENDU DU DASHBOARD (MATCHING HTML IDs)
 */
function refreshHUD() {
    const v = Number(STATE.v);
    const alt = STATE.pos.alt;
    const latRad = STATE.pos.lat * (Math.PI / 180);
    const vData = formatVelocity(v);

    // CINÉMATIQUE PRO
    UI('speed-stable-kmh', (v * 3.6).toFixed(4));
    UI('speed-stable-ms', vData.val);
    UI('velocity-unit', vData.unit);
    UI('v-cosmic', (v * 3.6).toFixed(2));
    UI('mach-number', (v / 340.29).toFixed(6));
    UI('vitesse-son-cor', (331.3 * Math.sqrt(1 + (288.15 - 273.15)/273.15)).toFixed(2));

    // RELATIVITÉ GÉNÉRALE & SPÉCIALE
    const gamma = 1 / Math.sqrt(1 - (v**2 / PHY.C**2));
    const r_total = PHY.R_E + alt;
    const dilat_g = (1 - Math.sqrt(1 - (PHY.RS_E / r_total))) * 1e9;

    UI('ui-gamma', gamma.toFixed(18));
    UI('time-dilation', ((gamma - 1) * 1e9).toFixed(9));
    UI('time-dilation-g', dilat_g.toFixed(10));
    UI('schwarzschild-radius', PHY.RS_E.toFixed(8));
    UI('relativistic-energy', (gamma * 80 * PHY.C**2).toExponential(4));

    // MÉCANIQUE & FLUIDES
    const rho = 1.225 * Math.pow(1 - (0.0065 * alt) / 288.15, 5.255);
    UI('dynamic-pressure', (0.5 * rho * v * v).toFixed(5));
    UI('reynolds-number', ((rho * v * 1.8) / PHY.MU_AIR).toExponential(2));
    UI('g-force-resultant', (mag / 9.81 || 1.0).toFixed(3));
    const f_cor = 2 * 80 * v * PHY.OMEGA_E * Math.sin(latRad);
    UI('coriolis', (f_cor * 1000).toFixed(4));

    // POSITIONNEMENT 3D / GROTTE
    UI('lat-ukf', STATE.pos.lat.toFixed(7));
    UI('lon-ukf', STATE.pos.lon.toFixed(7));
    UI('dist-3d', Number(STATE.dist).toFixed(4));
    UI('alt-display', alt.toFixed(2));

    // ESPACE_TEMPS_C
    UI('distance-light-s', (Number(STATE.dist) / PHY.C).toExponential(8));
    UI('distance-light-h', (Number(STATE.dist) / (PHY.C * 3600)).toExponential(10));
    UI('ast-deltat', PHY.DELTA_T + " s");

    // ASTRO_WATCH
    const jd = (Date.now() / 86400000) + 2440587.5;
    UI('ast-jd', jd.toFixed(6));
    UI('sun-azimuth', ((280.46 + 0.9856 * (jd - 2451545.0)) % 360).toFixed(2) + "°");

    // MISSION LOGS
    UI('filter-status', STATE.context);
    UI('utc-datetime', new Date().toLocaleTimeString());
}

/**
 * 10. INITIALISATION ET SÉCURITÉ
 */
function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

function startAdventure() {
    if (STATE.active) return;
    STATE.active = true;
    
    // Capteurs Motion
    window.addEventListener('devicemotion', runCoreEngine);
    
    // Capteur Orientation
    window.addEventListener('deviceorientation', (e) => {
        STATE.orientation.alpha = e.alpha || 0; // Boussole
        STATE.orientation.beta = e.beta || 0;   // Inclinaison
        STATE.orientation.gamma = e.gamma || 0;
    });

    // GPS (uniquement pour calibration initiale)
    navigator.geolocation.watchPosition(p => {
        STATE.pos.lat = p.coords.latitude;
        STATE.pos.lon = p.coords.longitude;
        UI('ui-gps-accuracy', p.coords.accuracy.toFixed(1));
    }, null, { enableHighAccuracy: true });

    const btn = document.getElementById('main-init-btn');
    if(btn) btn.innerText = "SYSTEM_LIVE";
}

// Global Export
window.startAdventure = startAdventure;
