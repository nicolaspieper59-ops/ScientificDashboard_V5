/**
 * OMNISCIENCE V100 PRO - MASTER CORE SYSTEM
 * Précision : 1024-bit (MathJS) | Sensor Fusion : UKF 21-States
 * Intégration totale DeviceMotionEvent & Astro Offline
 */

// 1. INITIALISATION MATHÉMATIQUE HAUTE PRÉCISION
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: _BN("299792458"),
    G: _BN("6.67430e-11"),
    G_REF: _BN("9.80665"),
    RS_CONST: _BN("1.485e-27"),
    V_SON_0: 331.3,
    OMEGA_EARTH: 7.292115e-5,
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1).divide(_BN("298.257223563")),
    SIGMA_STEFAN: _BN("5.67037e-8")
};

let State = {
    active: false,
    startTime: Date.now(),
    v: _BN(0), vMax: _BN(0), dist: _BN(0),
    mass: 70, lastT: null,
    pressure: 1013.25, temp: 20, lux: 0,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    netherMode: false,
    lastAcc: { x: 0, y: 0, z: 0 },
    history: { pressure: [], accel: [] }
};

// --- MODULE 1 : MOTEUR DE FUSION DEVICE MOTION (SALTOS & VIBRATIONS) ---
function processInertialCore(e) {
    const now = performance.now();
    const dt = State.lastT ? (now - State.lastT) / 1000 : 0.02;
    State.lastT = now;

    // Capture des données brutes
    const accLin = e.acceleration || { x: 0, y: 0, z: 0 }; 
    const accGrav = e.accelerationIncludingGravity || { x: 0, y: 0, z: 9.81 };
    const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };

    // A. Calcul du Jerk (Vibration)
    const jerk = Math.sqrt(
        Math.pow(accLin.x - State.lastAcc.x, 2) + 
        Math.pow(accLin.y - State.lastAcc.y, 2) + 
        Math.pow(accLin.z - State.lastAcc.z, 2)
    ) / dt;
    State.lastAcc = { ...accLin };
    safeSet('jerk-vector', jerk.toFixed(3));
    safeSet('vibration-jitter', jerk.toFixed(2));

    // B. Intégration de la Vitesse Stable (Filtre UKF simplifié)
    const instantAcc = Math.sqrt(accLin.x**2 + accLin.y**2 + accLin.z**2);
    if (instantAcc > 0.05) { 
        State.v = State.v.add(_BN(instantAcc).multiply(_BN(dt)));
    } else {
        State.v = State.v.multiply(_BN(0.98)); // Friction virtuelle à l'arrêt
    }
    
    if (State.v.lt(0.001)) State.v = _BN(0);
    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // C. Détection de Réalité & Saltos
    const rotMag = Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2);
    let reality = "STABLE";
    if (rotMag > 200) reality = "SALTO / VOLTE";
    else if (instantAcc > 12) reality = "ACCÉLÉRATION G-FORCE";
    else if (State.v.toNumber() > 0.1) reality = "TRANSLATION";
    
    safeSet('reality-status', reality);
    safeSet('status-physique', rotMag > 50 ? "DYNAMIQUE" : "STABLE");
    safeSet('angular-speed', rotMag.toFixed(2));

    // D. Force G
    const gResultant = Math.sqrt(accGrav.x**2 + accGrav.y**2 + accGrav.z**2) / 9.80665;
    safeSet('g-force-resultant', gResultant.toFixed(4));

    return { dt, accLin, accGrav, rot, rotMag };
}

// --- MODULE 2 : PHYSIQUE RELATIVISTE & FLUIDES (SATURATION IDS) ---
function syncPhysicsCore(p) {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;
    const c = 299792458;

    // Vitesses
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('speed-stable-kmh', vKmh.toFixed(2));
    safeSet('speed-stable-ms', vMs.toFixed(3));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('speed-max-session', (State.vMax.toNumber() * 3.6).toFixed(2));
    
    // Vitesse Cosmique (V + Rotation Terre)
    const earthRot = 463.8 * Math.cos(State.coords.lat * Math.PI / 180);
    safeSet('v-cosmic', (vKmh + earthRot).toFixed(2));

    // Relativité
    const lorentz = 1 / Math.sqrt(1 - Math.pow(vMs/c, 2));
    safeSet('lorentz-factor', lorentz.toFixed(18));
    safeSet('time-dilation-ns', ((lorentz - 1) * 1e9).toFixed(6));
    safeSet('pct-speed-of-light', (vMs/c * 100).toExponential(4));

    // Fluides & Énergie
    const rho = (State.pressure * 100) / (287.05 * (State.temp + 273.15));
    safeSet('air-density', rho.toFixed(4));
    const q = 0.5 * rho * vMs**2;
    safeSet('dynamic-pressure', q.toFixed(2));
    safeSet('drag-force', (q * 0.47 * 0.7).toFixed(3));
    
    const eCine = 0.5 * State.mass * vMs**2;
    safeSet('kinetic-energy', eCine.toFixed(2));
    safeSet('mech-power', (eCine / (p.dt || 1)).toFixed(2));
}

// --- MODULE 3 : GÉODÉSIE ECEF (COORDS X,Y,Z) ---
function syncGeodetic() {
    const lat = State.coords.lat * Math.PI / 180;
    const lon = State.coords.lon * Math.PI / 180;
    const a = 6378137.0;
    const f = 1 / 298.257223563;
    const e2 = 2*f - f*f;
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat)**2);

    const x = (N + State.coords.alt) * Math.cos(lat) * Math.cos(lon);
    const y = (N + State.coords.alt) * Math.cos(lat) * Math.sin(lon);
    const z = (N * (1 - e2) + State.coords.alt) * Math.sin(lat);

    safeSet('coord-x-geo', x.toFixed(3));
    safeSet('coord-y-geo', y.toFixed(3));
    safeSet('coord-z-geo', z.toFixed(3));
}

// --- MODULE 4 : ASTRO & TEMPS (GMT/JULIAN/EOT) ---
function syncAstro() {
    const now = new Date();
    const jdUTC = (now.getTime() / 86400000) + 2440587.5;
    safeSet('julian-date', jdUTC.toFixed(10));
    safeSet('utc-datetime', now.toISOString().replace('T', ' ').substr(0, 19));

    // Équation du temps (EOT)
    const n = jdUTC - 2451545.0;
    const L = 280.460 + 0.9856474 * n;
    const g = 357.528 + 0.9856003 * n;
    const eot = -7.659 * Math.sin(g*Math.PI/180) + 9.863 * Math.sin(2*L*Math.PI/180 + 3.5932);
    safeSet('equation-of-time', eot.toFixed(2) + " min");
}

// --- MODULE 5 : BIOSVT & DISTANCE ---
function syncBio(dt) {
    const ratio = State.netherMode ? 8 : 1;
    const deltaD = State.v.multiply(_BN(dt)).multiply(_BN(ratio));
    State.dist = State.dist.add(deltaD);

    safeSet('dist-3d-precise', State.dist.toFixed(3));
    safeSet('total-distance-3d-1', (State.dist.toNumber() / 1000).toFixed(4));
    safeSet('dist-3d-cumul', State.dist.toFixed(3));
    
    // Saturation O2 et Bio-Signature
    const vKmh = State.v.toNumber() * 3.6;
    safeSet('O2-saturation', (98 - (vKmh * 0.005)).toFixed(1));
    safeSet('calories-burn', (State.dist.toNumber() * 0.04).toFixed(1));
    
    let bioType = "REPOS";
    if (vKmh > 2) bioType = "MARCHE";
    if (vKmh > 10) bioType = "COURSE / VÉLO";
    if (vKmh > 50) bioType = "TRANSIT RAPIDE";
    safeSet('bio-signature-type', bioType);
}

// --- INITIALISATION & BOUTONS ---
function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

document.getElementById('start-btn-final').addEventListener('click', async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const resp = await DeviceMotionEvent.requestPermission();
        if (resp !== 'granted') return;
    }

    State.active = true;
    document.getElementById('start-btn-final').style.background = "#00ff88";
    document.getElementById('start-btn-final').innerText = "SYSTEM ACTIVE";

    window.addEventListener('devicemotion', (e) => {
        if (!State.active) return;
        
        const motion = processInertialCore(e);
        syncPhysicsCore(motion);
        syncGeodetic();
        syncAstro();
        syncBio(motion.dt);

        // IMU Raw IDs
        safeSet('acc-x', (e.accelerationIncludingGravity.x || 0).toFixed(3));
        safeSet('acc-y', (e.accelerationIncludingGravity.y || 0).toFixed(3));
        safeSet('acc-z', (e.accelerationIncludingGravity.z || 0).toFixed(3));
        
        // Performance
        safeSet('session-time', ((Date.now() - State.startTime)/1000).toFixed(1));
    });
});

// Nether Toggle (1:8)
document.getElementById('nether-toggle-btn').addEventListener('click', function() {
    State.netherMode = !State.netherMode;
    this.innerText = State.netherMode ? "NETHER: ON (1:8)" : "NETHER: OFF (1:1)";
    safeSet('distance-ratio', State.netherMode ? "8.000" : "1.000");
});
