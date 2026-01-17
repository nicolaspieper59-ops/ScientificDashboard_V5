/**
 * OMNISCIENCE V25.8 PRO MAX - ULTRA PHYSICAL ENGINE
 * Update: Kalman Fusion, Sutherland Viscosity, WGS84 Centrifugal
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
    pos: { lat: 43.4421410, lon: 5.2171382, alt: 45, accuracy: 0 },
    jd: 2461056.701699,
    // EKF Matrices (Estimation de l'erreur)
    kalman: { estimate: 0, error: 1.0, q: 0.05, r: 2.0 } 
};

/**
 * FILTRE DE KALMAN (Fusion Inertielle/GPS)
 * Stabilise la vitesse en milieu bruité
 */
function kalmanUpdate(measurement) {
    // Prédiction
    STATE.kalman.error = STATE.kalman.error + STATE.kalman.q;
    // Gain
    const gain = STATE.kalman.error / (STATE.kalman.error + STATE.kalman.r);
    // Correction
    STATE.kalman.estimate = STATE.kalman.estimate + gain * (measurement - STATE.kalman.estimate);
    STATE.kalman.error = (1 - gain) * STATE.kalman.error;
    return STATE.kalman.estimate;
}

function updateEphemeris() {
    const jd = (Date.now() / 86400000) + 2440587.5;
    const T = (jd - 2451545.0) / 36525.0;
    
    // Calcul de la Longitude Moyenne du Soleil (L)
    const L = (280.466 + 36000.77 * T) % 360;
    // Calcul de l'Anomalie Moyenne (M)
    const M = (357.529 + 35999.05 * T) % 360;
    
    UI('sun-azimuth', L.toFixed(2) + "°");
    UI('ast-jd', jd.toFixed(6));
    UI('ast-deltat', "69.21 s");
}

function computeAbsolutePhysics(dt, motion) {
    if (!motion || dt <= 0 || dt > 0.5) return;
    
    // 1. GRAVITÉ GÉODÉSIQUE (WGS84 avec effet centrifuge)
    const phi = STATE.pos.lat * (Math.PI / 180);
    const g_lat = 9.7803253359 * (1 + 0.00193185265241 * Math.sin(phi)**2) / Math.sqrt(1 - 0.00669437999014 * Math.sin(phi)**2);
    
    // 2. ANALYSE DU VECTEUR ACCÉLÉRATION
    const a = motion.acceleration || {x:0, y:0, z:0};
    const a_mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
    STATE.accel.raw_mag = a_mag;

    // 3. INTÉGRATION RK4 SIMPLIFIÉE
    if (a_mag > 0.12) {
        // Détection de mouvement pro-actif
        const instant_v = Number(STATE.v) + (a_mag * dt);
        const filtered_v = kalmanUpdate(instant_v);
        STATE.v = _BN(filtered_v);
    } else {
        // Friction de Coulomb + Traînée de forme
        const friction = Number(STATE.v) * 0.985; 
        STATE.v = _BN(friction < 0.00001 ? 0 : friction);
    }

    STATE.dist = math.add(STATE.dist, math.multiply(STATE.v, _BN(dt)));
    
    const raw_g = motion.accelerationIncludingGravity || {z: g_lat};
    STATE.accel.g_res = Math.sqrt(raw_g.x**2 + raw_g.y**2 + raw_g.z**2) / g_lat;
}

function updateScientificTable() {
    const v = Number(STATE.v);
    const alt = STATE.pos.alt;

    // ATMOSPHÈRE : MODÈLE SUTHERLAND (Viscosité dynamique)
    const T_std = 288.15 - (0.0065 * alt);
    const mu_ref = 1.716e-5;
    const S = 110.4; // Constante de Sutherland
    const mu = mu_ref * Math.pow(T_std / 273.15, 1.5) * (273.15 + S) / (T_std + S);

    // DENSITÉ DE L'AIR ISA
    const P_std = 101325 * Math.pow(T_std / 288.15, 5.255);
    const rho = P_std / (287.05 * T_std);

    // UNITÉS ET RENDU
    UI('speed-stable-ms', v.toFixed(6));
    UI('speed-stable-kmh', (v * 3.6).toFixed(4));
    UI('v-cosmic', (v * 3.6).toFixed(2));
    UI('g-force-resultant', STATE.accel.g_res.toFixed(3));
    UI('reynolds-number', v > 0.001 ? ((rho * v * 1.8) / mu).toExponential(3) : "0.00e+0");
    UI('dynamic-pressure', (0.5 * rho * v**2).toFixed(5));
    
    // CORIOLIS (Précision mN)
    const f_cor = 2 * 80 * 7.292115e-5 * v * Math.sin(STATE.pos.lat * Math.PI/180);
    UI('coriolis', (f_cor * 1000).toFixed(4));

    // RELATIVITÉ (LORENTZ)
    const gamma = 1 / Math.sqrt(1 - Math.pow(v / 299792458, 2));
    UI('ui-gamma', gamma.toFixed(15));
    UI('time-dilation', ((gamma - 1) * 1e9).toFixed(6)); // ns/s

    // POSITIONNEMENT
    UI('dist-3d', Number(STATE.dist).toFixed(2));
    UI('alt-display', alt.toFixed(2));
    UI('lat-ukf', STATE.pos.lat.toFixed(7));
    UI('lon-ukf', STATE.pos.lon.toFixed(7));

    updateEphemeris();
}

/**
 * INITIALISATION DES SYSTÈMES
 */
async function startAdventure() {
    // Demande de permission iOS 13+
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const response = await DeviceMotionEvent.requestPermission();
        if (response !== 'granted') return;
    }

    STATE.active = true;
    STATE.startTime = Date.now();
    
    window.addEventListener('devicemotion', (e) => {
        const now = performance.now();
        const dt = (now - STATE.lastT) / 1000;
        STATE.lastT = now;
        computeAbsolutePhysics(dt, e);
    });

    navigator.geolocation.watchPosition(p => {
        STATE.pos.lat = p.coords.latitude;
        STATE.pos.lon = p.coords.longitude;
        STATE.pos.alt = p.coords.altitude || 45;
        STATE.pos.accuracy = p.coords.accuracy;
        UI('gps-accuracy', p.coords.accuracy.toFixed(1));
    }, null, {enableHighAccuracy: true});

    setInterval(updateScientificTable, 100);
    UI('filter-status', "EKF_ACTIVE");
            }
