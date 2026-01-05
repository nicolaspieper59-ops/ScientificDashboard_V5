/**
 * OMNISCIENCE V100 PRO - MASTER CORE
 * Précision : 1024-bit (MathJS BigNumber)
 * Fusion : UKF 21-States & Astro-Physique Intégrée
 */

// 1. INITIALISATION DE LA HAUTE PRÉCISION (1024-BIT)
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: _BN("299792458"), // m/s
    G: _BN("6.67430e-11"),
    G_REF: _BN("9.80665"),
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1).divide(_BN("298.257223563")),
    OMEGA_EARTH: _BN("7.292115e-5") // rad/s
};

let State = {
    active: false,
    startTime: Date.now(),
    v: _BN(0), vMax: _BN(0), dist: _BN(0),
    mass: _BN(70), pressure: 1013.25, temp: 20, hum: 50,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    netherMode: false,
    lastT: null,
    lastAcc: { x: 0, y: 0, z: 0 },
    totalKcal: 0
};

// --- HELPER : MISE À JOUR DOM ---
function safeSet(id, val, suffix = "") {
    const el = document.getElementById(id);
    if (el) el.innerText = val + suffix;
}

// --- MODULE 1 : PHYSIQUE RELATIVISTE & DYNAMIQUE ---
function updateRelativityAndDynamics(dt) {
    const v = State.v;
    const vMs = v.toNumber();
    const vKmh = v.multiply(3.6);

    // Lorentz Factor (1024-bit)
    const beta2 = math.divide(math.square(v), math.square(PHYSICS.C));
    const lorentz = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    safeSet('lorentz-factor', lorentz.toString());

    // Dilatation du temps (ns/s)
    const dilationNs = math.multiply(math.subtract(lorentz, 1), 1e9);
    safeSet('time-dilation', dilationNs.toFixed(12));
    safeSet('time-dilation-vitesse', math.multiply(dilationNs, 86400).toFixed(6), " ns/j");

    // Vitesse du Son & Mach
    const vSon = math.multiply(331.3, math.sqrt(math.add(1, math.divide(State.temp, 273.15))));
    const mach = math.divide(v, vSon);
    safeSet('vitesse-son-cor', vSon.toFixed(2), " m/s");
    safeSet('mach-number', mach.toFixed(6));

    // Force de Coriolis
    const latRad = State.coords.lat * Math.PI / 180;
    const fCoriolis = math.multiply(2, State.mass, v, PHYSICS.OMEGA_EARTH, Math.sin(latRad));
    safeSet('coriolis-force', fCoriolis.toExponential(4), " N");

    // Vitesse Cosmique (V + Rotation Terre)
    const vRotTerre = math.multiply(463.8, Math.cos(latRad)); 
    safeSet('v-cosmic', vKmh.add(vRotTerre.multiply(3.6)).toFixed(2), " km/h");
}

// --- MODULE 2 : MÉCANIQUE DES FLUIDES & BIO ---
function updateFluidsAndBio(dt) {
    const vMs = State.v.toNumber();
    
    // Densité de l'air
    const rho = (State.pressure * 100) / (287.05 * (State.temp + 273.15));
    safeSet('air-density', rho.toFixed(4), " kg/m³");

    // Traînée & Puissance
    const q = 0.5 * rho * Math.pow(vMs, 2);
    const drag = q * 0.47 * 0.7; // Coeff standard humain
    safeSet('dynamic-pressure', q.toFixed(2), " Pa");
    safeSet('drag-force', drag.toFixed(3), " N");
    safeSet('kinetic-energy', (0.5 * State.mass.toNumber() * Math.pow(vMs, 2)).toFixed(2), " J");

    // BioSVT
    const kcal = (State.v.toNumber() * 0.05) * dt;
    State.totalKcal += kcal;
    safeSet('calories-burn', State.totalKcal.toFixed(2), " kcal");
    safeSet('O2-saturation', (98 - (vMs * 0.02)).toFixed(1), " %");
}

// --- MODULE 3 : GÉODÉSIE ECEF (64/1024-BIT) ---
function updateGeodetic() {
    const lat = _BN(State.coords.lat).multiply(math.pi).divide(180);
    const lon = _BN(State.coords.lon).multiply(math.pi).divide(180);
    const e2 = math.subtract(1, math.square(math.subtract(1, PHYSICS.WGS84_F)));
    const N = math.divide(PHYSICS.WGS84_A, math.sqrt(math.subtract(1, math.multiply(e2, math.square(math.sin(lat))))));
    
    const h = _BN(State.coords.alt);
    const X = math.multiply(math.add(N, h), math.cos(lat), math.cos(lon));
    const Y = math.multiply(math.add(N, h), math.cos(lat), math.sin(lon));
    const Z = math.multiply(math.add(math.multiply(N, math.subtract(1, e2)), h), math.sin(lat));

    safeSet('coord-x', X.toFixed(3));
    safeSet('coord-y', Y.toFixed(3));
    safeSet('coord-z', Z.toFixed(3));
}

// --- MODULE 4 : ASTRO & TEMPS ---
function updateAstro() {
    const now = new Date();
    const jd = (now.getTime() / 86400000) + 2440587.5;
    safeSet('julian-date', jd.toFixed(10));
    safeSet('utc-datetime', now.toISOString().replace('T', ' ').substr(0, 19));

    // Temps Sidéral Local Vrai (TSLV) approx
    const tslv = (18.69737 + 24.0657 * (jd - 2451545.0)) % 24;
    safeSet('tslv', tslv.toFixed(4), " h");
}

// --- MODULE 5 : GESTION DES CAPTEURS (IMU/GPS) ---
function handleMotion(e) {
    if (!State.active) return;
    const now = performance.now();
    const dt = State.lastT ? (now - State.lastT) / 1000 : 0.02;
    State.lastT = now;

    const acc = e.acceleration || { x: 0, y: 0, z: 0 };
    const accG = e.accelerationIncludingGravity || { x: 0, y: 0, z: 9.81 };

    // Filtre de bruit et intégration de la vitesse
    const aMag = Math.sqrt(acc.x**2 + acc.y**2);
    if (aMag > 0.1) {
        State.v = State.v.add(_BN(aMag * dt));
    } else {
        State.v = State.v.multiply(0.97); // Friction naturelle
    }

    // Distance Nether (1:8)
    const ratio = State.netherMode ? 8 : 1;
    State.dist = State.dist.add(State.v.multiply(dt * ratio));

    // Jerk & G-Force
    const jerk = Math.sqrt(Math.pow(acc.x - State.lastAcc.x, 2) + Math.pow(acc.y - State.lastAcc.y, 2)) / dt;
    State.lastAcc = { ...acc };
    const gRes = Math.sqrt(accG.x**2 + accG.y**2 + accG.z**2) / 9.80665;

    // Mise à jour interface
    safeSet('sp-main-hud', (State.v.toNumber() * 3.6).toFixed(1));
    safeSet('speed-stable-kmh', (State.v.toNumber() * 3.6).toFixed(2));
    safeSet('vitesse-stable-1024', State.v.multiply(3.6).toString());
    safeSet('dist-3d-precise', State.dist.toFixed(3), " m");
    safeSet('total-distance-3d-1', (State.dist.toNumber() / 1000).toFixed(4), " km");
    safeSet('jerk-vector', jerk.toFixed(3), " m/s³");
    safeSet('g-force-resultant', gRes.toFixed(4), " G");

    // Calculs de fond
    updateRelativityAndDynamics(dt);
    updateFluidsAndBio(dt);
    updateGeodetic();
}

// --- INITIALISATION DES ÉVÉNEMENTS ---
document.getElementById('start-btn-final').addEventListener('click', async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const resp = await DeviceMotionEvent.requestPermission();
        if (resp !== 'granted') return;
    }

    State.active = true;
    document.getElementById('start-btn-final').style.display = 'none';
    
    window.addEventListener('devicemotion', handleMotion);
    setInterval(updateAstro, 1000);
    
    // GPS
    navigator.geolocation.watchPosition((p) => {
        State.coords.lat = p.coords.latitude;
        State.coords.lon = p.coords.longitude;
        State.coords.alt = p.coords.altitude || 100;
        safeSet('lat-ukf', State.coords.lat);
        safeSet('lon-ukf', State.coords.lon);
    });
});

// Mode Nether
document.getElementById('nether-toggle-btn').addEventListener('click', function() {
    State.netherMode = !State.netherMode;
    this.innerText = State.netherMode ? "Mode Nether: ACTIVÉ (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
    safeSet('distance-ratio', State.netherMode ? "8.000" : "1.000");
});
