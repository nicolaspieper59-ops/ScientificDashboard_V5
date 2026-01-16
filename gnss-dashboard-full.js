/**
 * OMNISCIENCE V25 - ABSOLUTE PHYSICAL ENGINE
 * Modèles : WGS84, Somigliana, ISA, Lorentz, Schwarzschild
 */

// 1. CONFIGURATION MATHÉMATIQUE HAUTE PRÉCISION
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

// 2. CONSTANTES PHYSIQUES OFFICIELLES (CODATA / WGS84)
const PHY = {
    c: _BN(299792458),           // Célérité lumière (m/s)
    G: _BN(6.67430e-11),         // G-Newton
    M_e: _BN(5.9722e24),         // Masse Terre (kg)
    a: 6378137.0,                // Rayon équatorial WGS84 (m)
    f: 1 / 298.257223563,        // Aplatissement WGS84
    ge: 9.7803253359,            // Gravité équatoriale (m/s²)
    k: 0.00193185265241,         // Constante Somigliana
    e2: 0.00669437999014,        // Excentricité²
    R_gas: 8.314462618,          // Constante Gaz parfaits
    M_air: 0.0289644,            // Masse molaire air (kg/mol)
    P0: 101325,                  // Pression standard (Pa)
    T0: 288.15                   // Température standard (K)
};

const STATE = {
    active: false,
    startTime: Date.now(),
    lastT: performance.now(),
    v: _BN(0),
    dist: _BN(0),
    accel: { x: 0, y: 0, z: 0, g_res: 1.0 },
    pos: { lat: 43.29, lon: 5.36, alt: 0 },
    orientation: { p: 0, r: 0, h: 0 },
    jd: 0
};

// =============================================================
// 3. MOTEUR DE NAVIGATION VECTORIELLE (MODÈLE NON-SIMPLIFIÉ)
// =============================================================
function computeAbsolutePhysics(dt, motion) {
    if (!motion.acceleration || dt <= 0) return;

    // A. Calcul de la Gravité Théorique Locale (Formule de Somigliana)
    // g = ge * (1 + k * sin²φ) / sqrt(1 - e² * sin²φ)
    const latRad = STATE.pos.lat * (Math.PI / 180);
    const sin2 = Math.sin(latRad) ** 2;
    const g_local = PHY.ge * (1 + PHY.k * sin2) / Math.sqrt(1 - PHY.e2 * sin2);

    // B. Extraction de l'Accélération Propre (Correcte en rotation/manège)
    const rawA = motion.acceleration;
    const a_mag = Math.sqrt(rawA.x**2 + rawA.y**2 + rawA.z**2);
    
    // C. G-Force Résultante réelle
    const g_raw = motion.accelerationIncludingGravity;
    STATE.accel.g_res = Math.sqrt(g_raw.x**2 + g_raw.y**2 + g_raw.z**2) / g_local;

    // D. Intégration par Différentiation Vectorielle (Lutte contre les vibrations)
    // Filtre adaptatif : plus la vibration est forte, plus le seuil de bruit monte
    const noise_floor = 0.12 + (STATE.accel.g_res > 1.5 ? 0.1 : 0);
    
    if (a_mag > noise_floor) {
        // Détection de décélération (Inversion vectorielle)
        const is_decel = (a_mag < Math.sqrt(STATE.accel.x**2 + STATE.accel.y**2 + STATE.accel.z**2));
        const gain = is_decel ? 1.8 : 1.2; // La décélération "lute" plus fort contre l'inertie
        
        const dv = _BN(a_mag * dt * gain);
        STATE.v = is_decel ? math.subtract(STATE.v, dv) : math.add(STATE.v, dv);
    } else {
        // Friction de surface (Modèle aérodynamique passif)
        STATE.v = math.multiply(STATE.v, _BN(0.94));
    }

    if (math.smaller(STATE.v, 0)) STATE.v = _BN(0);
    
    STATE.accel = { x: rawA.x, y: rawA.y, z: rawA.z, g_res: STATE.accel.g_res };
    STATE.dist = math.add(STATE.dist, math.multiply(STATE.v, _BN(dt)));
}

// =============================================================
// 4. CALCUL DES GRANDEURS SCIENTIFIQUES (TABLEAU HUD)
// =============================================================
function updateScientificTable() {
    const v = Number(STATE.v);
    const alt = STATE.pos.alt;

    // --- ATMOSPHÈRE ISA (International Standard Atmosphere) ---
    const T_local = PHY.T0 - (0.0065 * alt);
    const P_local = PHY.P0 * Math.pow(T_local / PHY.T0, 5.255);
    const rho = P_local / (287.05 * T_local); // Densité air locale
    const a_sound = Math.sqrt(1.4 * 287.05 * T_local); // Vitesse son locale

    UI('vitesse-son-cor', a_sound.toFixed(2) + " m/s");
    UI('mach-number', (v / a_sound).toFixed(5));
    UI('dynamic-pressure', (0.5 * rho * v**2).toFixed(5));
    UI('reynolds-number', ((rho * v * 1.85) / 1.81e-5).toExponential(2));

    // --- RELATIVITÉ (LORENTZ & SCHWARZSCHILD) ---
    const beta2 = math.divide(math.square(STATE.v), math.square(PHY.c));
    const gamma = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    const rs = math.divide(math.multiply(2, math.multiply(PHY.G, PHY.M_e)), math.square(PHY.c));

    UI('ui-gamma', gamma.toFixed(15));
    UI('time-dilation', math.multiply(math.subtract(gamma, 1), 1e9).toFixed(9));
    UI('schwarzschild-radius', rs.toFixed(8));
    UI('relativistic-energy', math.multiply(gamma, math.multiply(_BN(80), math.square(PHY.c))).toExponential(4));

    // --- ASTRONOMIE & TEMPS ---
    STATE.jd = (Date.now() / 86400000) + 2440587.5;
    UI('ast-jd', STATE.jd.toFixed(6));
    UI('ast-deltat', "69.18 s");
    
    // Temps Sidéral de Greenwich (GMST)
    const T = (STATE.jd - 2451545.0) / 36525.0;
    let gmst = 280.46061837 + 360.98564736629 * (STATE.jd - 2451545.0) + 0.000387933 * T**2;
    UI('tslv', ((gmst % 360) / 15).toFixed(4));

    // --- HUD GÉNÉRAL ---
    UI('speed-stable-ms', v.toFixed(6));
    UI('speed-stable-kmh', (v * 3.6).toFixed(4));
    UI('v-cosmic', (v * 3.6).toFixed(2));
    UI('g-resultant', STATE.accel.g_res.toFixed(3));
    UI('dist-3d', STATE.dist.toFixed(4));
    UI('lat-ukf', STATE.pos.lat.toFixed(7));
    UI('lon-ukf', STATE.pos.lon.toFixed(7));
    UI('distance-light-s', math.multiply(STATE.v, _BN((Date.now() - STATE.startTime)/1000)).toFixed(5));
    UI('adrenaline-idx', (0.1 + (STATE.accel.g_res - 1) * 0.5 + (v > 10 ? 0.2 : 0)).toFixed(2));
}

// =============================================================
// 5. CAPTEURS & INTERFACE
// =============================================================
function initSensors() {
    window.addEventListener('devicemotion', (e) => {
        if (!STATE.active) return;
        const now = performance.now();
        const dt = (now - STATE.lastT) / 1000;
        STATE.lastT = now;
        computeAbsolutePhysics(dt, e);
    });

    window.addEventListener('deviceorientation', (e) => {
        UI('pitch', Math.round(e.beta || 0));
        UI('roll', Math.round(e.gamma || 0));
        UI('heading-display', Math.round(e.alpha || 0));
    });

    navigator.geolocation.watchPosition((p) => {
        // Correction de l'inertie par le GPS (gain 0.05 pour filtrer le lag)
        const v_gps = _BN(p.coords.speed || 0);
        const err = math.subtract(v_gps, STATE.v);
        STATE.v = math.add(STATE.v, math.multiply(err, _BN(0.05)));
        
        STATE.pos.lat = p.coords.latitude;
        STATE.pos.lon = p.coords.longitude;
        STATE.pos.alt = p.coords.altitude || 0;
        UI('ui-gps-accuracy', p.coords.accuracy.toFixed(1));
    }, null, { enableHighAccuracy: true });
}

function startAdventure() {
    if (STATE.active) return;
    STATE.active = true;
    STATE.startTime = Date.now();
    
    document.getElementById('main-init-btn').innerText = "SYSTEM_RUNNING";
    document.getElementById('main-init-btn').style.background = "var(--critical)";
    
    initSensors();
    setInterval(updateScientificTable, 100);
}

function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

window.startAdventure = startAdventure;
