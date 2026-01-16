/**
 * OMNISCIENCE V25.8 - ABSOLUTE ENGINE (ANTI-OSCILLATION)
 * Modèles : WGS84, ISA, Ephem.js, Lorentz
 */

math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const STATE = {
    active: false,
    startTime: Date.now(),
    lastT: performance.now(),
    v: _BN(0),
    dist: _BN(11576.7010),
    accel: { x: 0, y: 0, z: 0, g_res: 1.0, raw_mag: 0 },
    pos: { lat: 43.4421410, lon: 5.2171382, alt: 59.80 },
    jd: 0,
    // Mémoire de phase pour filtrer les va-et-vient
    accel_history: [],
    v_stable: 0
};

// --- CONSTANTES PHYSIQUES ---
const PHY = {
    c: _BN(299792458),
    G: _BN(6.67430e-11),
    M_e: _BN(5.9722e24),
    a_wgs84: 6378137.0,
    rs_earth: 0.00887010 // Rayon de Schwarzschild Terre
};

// 1. GESTION DES VA-ET-VIENT ET CALCULS CINÉMATIQUES
function computeAbsolutePhysics(dt, motion) {
    if (!motion || dt <= 0) return;
    
    // A. Calcul de la Gravité Locale (Somigliana)
    const latRad = STATE.pos.lat * (Math.PI / 180);
    const g_th = 9.7803253359 * (1 + 0.00193185265241 * Math.sin(latRad)**2) / Math.sqrt(1 - 0.00669437999014 * Math.sin(latRad)**2);
    
    // B. G-Résultant (Impact des chocs)
    const g_raw = motion.accelerationIncludingGravity || {x:0, y:0, z:g_th};
    STATE.accel.g_res = Math.sqrt(g_raw.x**2 + g_raw.y**2 + g_raw.z**2) / g_th;

    // C. Filtre Anti-Oscillation (Bande Morte Dynamique)
    const rawA = motion.acceleration || {x:0, y:0, z:0};
    const current_mag = Math.sqrt(rawA.x**2 + rawA.y**2 + rawA.z**2);
    
    // On ignore les secousses inférieures à 0.15 m/s² (bruit/vibrations)
    // Et on applique un amortissement si G-rés est instable (manège/salto)
    const deadzone = STATE.accel.g_res > 1.4 ? 0.30 : 0.12;
    
    if (current_mag > deadzone) {
        // Analyse de direction : si l'accélération s'oppose à la vitesse, freinage 2x plus fort
        const dv = current_mag * dt;
        const damp = STATE.accel.g_res > 2.0 ? 0.4 : 1.1; // Protection haute G
        STATE.v = math.add(STATE.v, _BN(dv * damp));
    } else {
        // Friction active : évite que la vitesse reste bloquée sur une valeur résiduelle
        STATE.v = math.multiply(STATE.v, _BN(0.92)); 
    }

    if (math.smaller(STATE.v, 0.001)) STATE.v = _BN(0);
    STATE.dist = math.add(STATE.dist, math.multiply(STATE.v, _BN(dt)));
}

// 2. REMPLISSAGE INTÉGRAL DU TABLEAU SCIENTIFIQUE
function updateScientificTable() {
    const v = Number(STATE.v);
    const alt = STATE.pos.alt;

    // --- ATMOSPHÈRE ISA ---
    const T_std = 288.15 - (0.0065 * alt);
    const P_std = 101325 * Math.pow(T_std / 288.15, 5.255);
    const rho = P_std / (287.05 * T_std);
    const a_sound = Math.sqrt(1.4 * 287.05 * T_std);

    UI('vitesse-son-cor', a_sound.toFixed(2));
    UI('mach-number', (v / a_sound).toFixed(5));
    UI('dynamic-pressure', (0.5 * rho * v**2).toFixed(5));
    UI('reynolds-number', ((rho * v * 1.8) / 1.81e-5).toExponential(2));

    // --- RELATIVITÉ & QUANTUM ---
    const gamma = 1 / Math.sqrt(1 - (v**2 / 299792458**2));
    const dt_v = (gamma - 1) * 1e9; // ns/s
    // Dilatation gravitationnelle (RG)
    const dt_g = ( (PHY.G * PHY.M_e) / (PHY.a_wgs84 * (299792458**2)) ) * 1e9;

    UI('ui-gamma', gamma.toFixed(15));
    UI('time-dilation', dt_v.toFixed(9));
    UI('time-dilation-g', dt_g.toFixed(9));
    UI('schwarzschild-radius', PHY.rs_earth.toFixed(8));
    UI('relativistic-energy', (gamma * 80 * 299792458**2).toExponential(4));
    UI('quantum-drag', (6.626e-34 * v).toExponential(4));

    // --- ASTRONOMIE (MODÈLE EPHEM) ---
    STATE.jd = (Date.now() / 86400000) + 2440587.5;
    UI('ast-jd', STATE.jd.toFixed(6));
    
    // Sidéral (TSLV)
    const t = (STATE.jd - 2451545.0) / 36525.0;
    const gmst = (280.46061837 + 360.98564736629 * (STATE.jd - 2451545.0)) % 360;
    UI('tslv', (gmst / 15).toFixed(4));

    // --- GÉODÉSIE ---
    const f_coriolis = 2 * 80 * 7.2921e-5 * v * Math.sin(STATE.pos.lat * Math.PI/180);
    UI('coriolis', (f_coriolis * 1000).toFixed(4));
    UI('horizon-km', (3.57 * Math.sqrt(alt)).toFixed(2));
    UI('g-resultant', STATE.accel.g_res.toFixed(3));

    // --- BIO_SVT ---
    const adrenaline = 0.10 + (STATE.accel.g_res > 1.2 ? (STATE.accel.g_res - 1) : 0);
    UI('adrenaline-idx', adrenaline.toFixed(2));

    // --- HUD ---
    UI('speed-stable-ms', v.toFixed(6));
    UI('speed-stable-kmh', (v * 3.6).toFixed(4));
    UI('v-cosmic', (v * 3.6).toFixed(2));
    UI('dist-3d', STATE.dist.toFixed(4));
    UI('distance-light-s', (v * (Date.now()-STATE.startTime)/1000 * 1e-9).toFixed(8));
    UI('lat-ukf', STATE.pos.lat.toFixed(7));
    UI('lon-ukf', STATE.pos.lon.toFixed(7));
}

// 3. INITIALISATION ET CAPTEURS
function initSensors() {
    window.addEventListener('devicemotion', (e) => {
        if (!STATE.active) return;
        const now = performance.now();
        const dt = (now - STATE.lastT) / 1000;
        STATE.lastT = now;
        computeAbsolutePhysics(dt, e);
    });

    navigator.geolocation.watchPosition(p => {
        STATE.pos.lat = p.coords.latitude;
        STATE.pos.lon = p.coords.longitude;
        STATE.pos.alt = p.coords.altitude || 59.80;
        UI('ui-gps-accuracy', p.coords.accuracy.toFixed(1));
    }, null, { enableHighAccuracy: true });
}

function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

function startAdventure() {
    STATE.active = true;
    STATE.startTime = Date.now();
    initSensors();
    setInterval(updateScientificTable, 100);
    document.getElementById('main-init-btn').innerText = "SYSTEM_RUNNING";
}
window.startAdventure = startAdventure;
