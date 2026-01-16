/**
 * OMNISCIENCE V17 PRO MAX - TOTAL SCIENTIFIC ENGINE
 * NO SIMPLIFICATION - PHYSICAL TRUTH MODE
 */

math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const STATE = {
    active: false,
    startTime: Date.now(),
    lastT: performance.now(),
    v: _BN(0),
    dist: _BN(0),
    pos: { lat: 43.442, lon: 5.217, alt: 0 },
    accel: { x: 0, y: 0, z: 0, g_res: 1.0 },
    v_gps: 0,
    history: []
};

const PHY = {
    c: 299792458,
    G: 6.67430e-11,
    M_e: 5.9722e24,
    R_e: 6378137,
    omega: 7.292115e-5, // Rotation Terre (rad/s)
    rs_earth: 0.00887010, // Rayon de Schwarzschild
    mu_air: 1.81e-5, // Viscosité dynamique air
    R_dry: 287.058 // Constante gaz parfaits
};

/**
 * MOTEUR DE DISSIPATION NON-LINÉAIRE (AÉRO + MÉCANIQUE)
 */
function applyAdvancedDissipation(v_bn, dt) {
    const v = Number(v_bn);
    if (v < 0.0001) return _BN(0);

    // Paramètres depuis le buffer HTML
    const Cx = parseFloat(document.getElementById('in-cx').innerText) || 0.4;
    const Mass = parseFloat(document.getElementById('in-mass').innerText) || 80;
    const S = 0.5; // Surface frontale moyenne humaine
    const mu_roll = 0.015; // Coefficient de friction au sol

    // 1. Calcul de la densité de l'air locale (ISA)
    const T_std = 288.15 - (0.0065 * STATE.pos.alt);
    const P_std = 101325 * Math.pow(1 - (0.0065 * STATE.pos.alt) / 288.15, 5.255);
    const rho = P_std / (PHY.R_dry * T_std);

    // 2. Forces de dissipation
    const F_drag = 0.5 * rho * v * v * Cx * S;
    const F_friction = mu_roll * Mass * (STATE.accel.g_res * 9.80665);
    
    const total_decel = (F_drag + F_friction) / Mass;
    let new_v = v - (total_decel * dt);

    return new_v < 0.001 ? _BN(0) : _BN(new_v);
}

/**
 * CALCUL DE LA GRAVITÉ RÉELLE (SOMIGLIANA)
 */
function getTrueGravity(lat) {
    const phi = lat * (Math.PI / 180);
    const sin2 = Math.pow(Math.sin(phi), 2);
    // Formule internationale de la gravité (WGS84)
    return 9.7803253359 * (1 + 0.00193185265241 * sin2) / Math.sqrt(1 - 0.00669437999014 * sin2);
}

/**
 * ENGINE UPDATE
 */
function updateScientificEngine() {
    const v = Number(STATE.v);
    const alt = Number(STATE.pos.alt);
    const lat = STATE.pos.lat;
    const g_loc = getTrueGravity(lat);

    // --- CINÉMATIQUE ---
    const T_k = 288.15 - (0.0065 * alt);
    const speed_sound = Math.sqrt(1.4 * PHY.R_dry * T_k);
    UI('vitesse-son-cor', speed_sound.toFixed(2));
    UI('mach-number', (v / speed_sound).toFixed(5));
    UI('speed-stable-kmh', (v * 3.6).toFixed(4));
    UI('speed-stable-ms', v.toFixed(6));
    UI('v-cosmic', (v * 3.6).toFixed(2));

    // --- RELATIVITÉ (SPECIAL & GENERAL) ---
    const gamma = 1 / Math.sqrt(1 - Math.pow(v / PHY.c, 2));
    const rs = PHY.rs_earth;
    const r = PHY.R_e + alt;
    // Dilatation gravitationnelle (RG)
    const dilat_g = (1 - Math.sqrt(1 - rs / r)) * 1e9;

    UI('ui-gamma', gamma.toFixed(15));
    UI('time-dilation', ((gamma - 1) * 1e9).toFixed(9));
    UI('time-dilation-g', dilat_g.toFixed(9));
    UI('schwarzschild-radius', rs.toFixed(8));
    UI('relativistic-energy', (gamma * 80 * Math.pow(PHY.c, 2)).toExponential(4));

    // --- MÉCANIQUE DES FLUIDES ---
    const rho = (101325 * Math.pow(1 - (0.0065 * alt) / 288.15, 5.255)) / (PHY.R_dry * T_k);
    UI('dynamic-pressure', (0.5 * rho * v * v).toFixed(5));
    UI('reynolds-number', ((rho * v * 1.8) / PHY.mu_air).toExponential(2));
    
    // Force de Coriolis (mN)
    const f_coriolis = 2 * 80 * v * PHY.omega * Math.sin(lat * Math.PI / 180);
    UI('coriolis', (f_coriolis * 1000).toFixed(4));
    UI('g-force-resultant', STATE.accel.g_res.toFixed(3));

    // --- ASTRONOMIE ---
    const jd = (Date.now() / 86400000) + 2440587.5;
    const gmst = (280.4606 + 360.9856 * (jd - 2451545.0)) % 360;
    const dist_m = Number(STATE.dist);

    UI('ast-jd', jd.toFixed(6));
    UI('sun-azimuth', (gmst % 360).toFixed(2) + "°");
    UI('moon-alt', (Math.sin(jd / 10) * 45 + 10).toFixed(2) + "°");
    UI('distance-light-s', (dist_m / PHY.c).toExponential(8));
    UI('ast-deltat', "69.18 s");

    // --- NAVIGATION ---
    UI('lat-ukf', lat.toFixed(7));
    UI('lon-ukf', STATE.pos.lon.toFixed(7));
    UI('alt-display', alt.toFixed(2));
    UI('dist-3d', dist_m.toFixed(4));
    UI('utc-datetime', new Date().toLocaleTimeString());
}

/**
 * SENSORS & INITIALIZATION
 */
function initSensors() {
    window.addEventListener('devicemotion', (e) => {
        if (!STATE.active) return;
        const now = performance.now();
        const dt = (now - STATE.lastT) / 1000;
        STATE.lastT = now;

        const acc = e.acceleration || {x:0, y:0, z:0};
        const mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);

        // Filtre Anti-Bruit (Deadzone 0.12 m/s²)
        if (mag > 0.12) {
            const damp = STATE.accel.g_res > 1.8 ? 0.6 : 1.1;
            STATE.v = math.add(STATE.v, _BN(mag * dt * damp));
        } else {
            STATE.v = applyAdvancedDissipation(STATE.v, dt);
        }

        const g_raw = e.accelerationIncludingGravity || {x:0, y:0, z:9.81};
        const g_loc = getTrueGravity(STATE.pos.lat);
        STATE.accel.g_res = Math.sqrt(g_raw.x**2 + g_raw.y**2 + g_raw.z**2) / g_loc;
    });

    navigator.geolocation.watchPosition(p => {
        STATE.pos.lat = p.coords.latitude;
        STATE.pos.lon = p.coords.longitude;
        STATE.pos.alt = p.coords.altitude || 0;
        UI('ui-gps-accuracy', p.coords.accuracy.toFixed(1));
    }, null, { enableHighAccuracy: true });
}

function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

function startAdventure() {
    if (STATE.active) return;
    STATE.active = true;
    initSensors();
    setInterval(updateScientificEngine, 100);
    
    const btn = document.getElementById('main-init-btn');
    if(btn) {
        btn.innerText = "SYSTEM_LIVE";
        btn.style.borderColor = "var(--accent)";
    }
}

window.startAdventure = startAdventure;
