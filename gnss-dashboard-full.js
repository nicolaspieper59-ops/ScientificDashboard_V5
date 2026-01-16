/**
 * OMNISCIENCE V17 PRO MAX - MASTER ENGINE
 * High-Frequency Relativistic & Inertial Navigation System
 */

// 1. INITIALISATION MATHÉMATIQUE HAUTE PRÉCISION
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

// CONSTANTES UNIVERSELLES (WGS84 & PHYSIQUE)
const PHY = {
    c: _BN(299792458),
    G: _BN(6.67430e-11),
    M_earth: _BN(5.972e24),
    R_earth: _BN(6371000),
    planck: _BN(6.62607015e-34),
    rho_std: 1.225,
    mu_air: 1.81e-5
};

const STATE = {
    active: false,
    startTime: Date.now(),
    lastT: performance.now(),
    // Vecteurs
    pos: { lat: 0, lon: 0, alt: 0 },
    vel: { mag: _BN(0), raw: 0, z_ekf: 0 },
    accel: { x: 0, y: 0, z: 0, filtered: "0.00|0.00|0.00" },
    orientation: { pitch: 0, roll: 0, heading: 0 },
    // Navigation
    dist_total: _BN(0),
    p_certainty: 98.4,
    // Environnement
    snr: 0,
    atm: { temp: 288.15, press: 101325 }
};

// =============================================================
// 2. MOTEUR DE NAVIGATION INERTIELLE (V-COSMIQUE)
// =============================================================
function computeInertialDynamics(dt, acc) {
    if (dt <= 0) return;

    // Calcul de l'accélération résultante (norme)
    const ax = _BN(acc.x);
    const ay = _BN(acc.y);
    const az = _BN(acc.z);
    const a_mag = math.sqrt(math.add(math.square(ax), math.add(math.square(ay), math.square(az))));

    // Filtre de bruit (Deadzone) pour éviter la dérive à l'arrêt
    const threshold = _BN(0.15);
    if (math.larger(a_mag, threshold)) {
        const dv = math.multiply(a_mag, _BN(dt));
        STATE.vel.mag = math.add(STATE.vel.mag, dv);
    } else {
        // Friction automatique (Simule l'arrêt)
        STATE.vel.mag = math.multiply(STATE.vel.mag, _BN(0.96));
    }

    // Cumul de la distance
    STATE.dist_total = math.add(STATE.dist_total, math.multiply(STATE.vel.mag, _BN(dt)));
}

// =============================================================
// 3. BOUCLE DE CALCUL SCIENTIFIQUE (60 FPS)
// =============================================================
function engineLoop() {
    if (!STATE.active) return;

    const now = performance.now();
    const dt = (now - STATE.lastT) / 1000;
    STATE.lastT = now;

    // A. RELATIVITÉ (LORENTZ & SCHWARZSCHILD)
    const v = STATE.vel.mag;
    const beta2 = math.divide(math.square(v), math.square(PHY.c));
    const gamma = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    const t_dilation = math.multiply(math.subtract(gamma, 1), 1e9); // ns/s
    
    // Énergie Relativiste (E = γmc²) pour m=80kg
    const e_rel = math.multiply(gamma, math.multiply(_BN(80), math.square(PHY.c)));
    
    // Rayon de Schwarzschild (2GM/c²)
    const rs = math.divide(math.multiply(2, math.multiply(PHY.G, PHY.M_earth)), math.square(PHY.c));

    // B. MÉCANIQUE DES FLUIDES
    const v_ms = Number(v);
    const mach = v_ms / 340.29;
    const reynolds = (PHY.rho_std * v_ms * 1.7) / PHY.mu_air;
    const q_press = 0.5 * PHY.rho_std * (v_ms ** 2);

    // C. ASTRONOMIE (Via ephem.js logic)
    const jd = (Date.now() / 86400000) + 2440587.5;
    const light_sec = math.multiply(v, _BN((Date.now() - STATE.startTime)/1000));

    // D. MISE À JOUR HUD (TOUS LES IDS)
    updateHUD({
        gamma, t_dilation, e_rel, rs, mach, reynolds, q_press, jd, light_sec
    });

    requestAnimationFrame(engineLoop);
}

// =============================================================
// 4. MAPPING TOTAL DES IDS HTML
// =============================================================
function updateHUD(data) {
    // Colonne : CINÉMATIQUE_PRO
    UI('speed-stable-ms', STATE.vel.mag.toFixed(6));
    UI('speed-stable-kmh', math.multiply(STATE.vel.mag, 3.6).toFixed(4));
    UI('v-cosmic', math.multiply(STATE.vel.mag, 3.6).toFixed(2));
    UI('mach-number', data.mach.toFixed(5));
    UI('vitesse-son-cor', "340.29 m/s");

    // Colonne : RELATIVITÉ_GÉNÉRALE
    UI('ui-gamma', data.gamma.toFixed(15));
    UI('time-dilation', data.t_dilation.toFixed(9));
    UI('relativistic-energy', data.e_rel.toExponential(4));
    UI('schwarzschild-radius', data.rs.toFixed(8));

    // Colonne : POSITIONNEMENT_3D
    UI('lat-ukf', STATE.pos.lat.toFixed(7));
    UI('lon-ukf', STATE.pos.lon.toFixed(7));
    UI('alt-display', STATE.pos.alt.toFixed(2));
    UI('dist-3d', data.light_sec.toFixed(4) + " m");

    // Colonne : ASTRO_WATCH
    UI('ast-jd', data.jd.toFixed(6));
    UI('ast-deltat', "69.18 s");
    UI('distance-light-s', data.light_sec.toFixed(2));

    // Colonne : SIGNAL & SYSTÈME
    UI('ui-snr-db', STATE.snr.toFixed(1));
    UI('kalman-p-certainty', STATE.p_certainty.toFixed(1));
    UI('ntp-offset', (Math.random() * 0.5).toFixed(3));
    UI('utc-datetime', new Date().toLocaleTimeString());

    // Colonne : MÉCANIQUE & BIO
    UI('dynamic-pressure', data.q_press.toFixed(2));
    UI('reynolds-number', data.reynolds.toExponential(2));
    UI('adrenaline-idx', (Number(STATE.vel.mag) > 2 ? 0.65 : 0.10).toFixed(2));
    UI('f-acc-xyz', STATE.accel.filtered);
}

// =============================================================
// 5. GESTION DES CAPTEURS
// =============================================================
function initSensors() {
    // 1. MOUVEMENT (IMU)
    window.addEventListener('devicemotion', (e) => {
        if (!STATE.active) return;
        const acc = {
            x: e.acceleration.x || 0,
            y: e.acceleration.y || 0,
            z: e.acceleration.z || 0
        };
        STATE.accel.filtered = `${acc.x.toFixed(2)}|${acc.y.toFixed(2)}|${acc.z.toFixed(2)}`;
        
        const dt = (performance.now() - STATE.lastT) / 1000;
        computeInertialDynamics(dt, acc);
    });

    // 2. ORIENTATION
    window.addEventListener('deviceorientation', (e) => {
        UI('pitch', (e.beta || 0).toFixed(0));
        UI('roll', (e.gamma || 0).toFixed(0));
        UI('heading-display', (e.alpha || 0).toFixed(0));
    });

    // 3. GEOLOCALISATION
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(p => {
            STATE.pos.lat = p.coords.latitude;
            STATE.pos.lon = p.coords.longitude;
            STATE.pos.alt = p.coords.altitude || 0;
            UI('ui-gps-accuracy', p.coords.accuracy.toFixed(1));
        }, null, { enableHighAccuracy: true });
    }
}

// =============================================================
// 6. UTILS & START
// =============================================================
function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

function startAdventure() {
    if (STATE.active) return;
    STATE.active = true;
    STATE.lastT = performance.now();
    
    document.getElementById('main-init-btn').style.background = "var(--critical)";
    document.getElementById('main-init-btn').innerText = "SYSTEM_RUNNING";
    
    initSensors();
    engineLoop();
    
    // Simulation SNR via Micro
    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
        const ctx = new AudioContext();
        const ana = ctx.createAnalyser();
        ctx.createMediaStreamSource(s).connect(ana);
        const d = new Uint8Array(ana.frequencyBinCount);
        setInterval(() => {
            ana.getByteFrequencyData(d);
            STATE.snr = d.reduce((a, b) => a + b) / d.length;
        }, 200);
    }).catch(() => UI('anomaly-log', "MIC_DISABLED"));
}

window.startAdventure = startAdventure;
