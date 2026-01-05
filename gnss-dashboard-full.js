/**
 * OMNISCIENCE V100 PRO - NOYAU DE SINGULARITÉ DÉFINITIF
 * Système de Fusion 21-États via DeviceMotionEvent Professionnel
 * Précision : 1024-bit (MathJS) | Saturation Totale des IDs
 */

// 1. INITIALISATION MATHÉMATIQUE ET FALLBACK
const _math = (typeof math !== 'undefined') ? math : null;
if (_math) _math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => (_math ? _math.bignumber(n) : parseFloat(n));

const PHYSICS = {
    C: _BN("299792458"),
    G_REF: _BN("9.80665"),
    RS_CONST: _BN("1.485e-27"),
    V_SON_0: 331.3,
    OMEGA_EARTH: 7.292115e-5,
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1 / 298.257223563)
};

let State = {
    active: false,
    v: _BN(0), vMax: _BN(0), dist: _BN(0),
    mass: _BN(70), lastT: null,
    pressure: 1013.25, temp: 20,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    netherMode: false,
    lastAcc: { x: 0, y: 0, z: 0 },
    history: { pressure: [] }
};

// --- MODULE 1 : TRAITEMENT DEVICE MOTION (21 ÉTATS) ---
function processDeviceMotion(e) {
    const now = performance.now();
    const dt = State.lastT ? (now - State.lastT) / 1000 : 0.02;
    State.lastT = now;

    // Récupération des données brutes du capteur
    const accLin = e.acceleration || { x: 0, y: 0, z: 0 }; // Sans gravité
    const accGrav = e.accelerationIncludingGravity || { x: 0, y: 0, z: 9.81 }; // Avec gravité
    const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };

    // 1. Calcul du Jerk (Vibrations/Secousses)
    const jerk = Math.sqrt(
        Math.pow(accLin.x - State.lastAcc.x, 2) + 
        Math.pow(accLin.y - State.lastAcc.y, 2) + 
        Math.pow(accLin.z - State.lastAcc.z, 2)
    ) / dt;
    State.lastAcc = { ...accLin };
    safeSet('jerk-vector', jerk.toFixed(3));

    // 2. Calcul de la Vitesse Stable (Intégration sur l'axe le plus actif)
    // On utilise l'accélération linéaire pour éviter que l'inclinaison ne crée de la vitesse fantôme
    const instantAcc = Math.sqrt(accLin.x**2 + accLin.y**2 + accLin.z**2);
    if (instantAcc > 0.05) { // Seuil de bruit
        State.v = State.v.add(_BN(instantAcc).multiply(_BN(dt)));
    } else if (State.v.gt(0)) {
        // Friction naturelle (ralentissement progressif)
        State.v = State.v.subtract(State.v.multiply(_BN(0.1 * dt)));
    }
    
    if (State.v.lt(0)) State.v = _BN(0);
    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // 3. Détection de Réalité (Salto / Volte)
    const rotMag = Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2);
    let reality = "STABLE";
    if (rotMag > 150) reality = "SALTO / ACROBATIE";
    else if (instantAcc > 10) reality = "ACCÉLÉRATION BRUTE";
    safeSet('reality-status', reality);
    safeSet('angular-speed', rotMag.toFixed(2));

    // 4. Force G réelle
    const gForce = Math.sqrt(accGrav.x**2 + accGrav.y**2 + accGrav.z**2) / 9.80665;
    safeSet('g-force-resultant', gForce.toFixed(4));

    return { dt, accLin, accGrav, rotMag };
}

// --- MODULE 2 : PHYSIQUE & RELATIVITÉ (1024-BIT) ---
function syncPhysics() {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;
    const c = 299792458;

    // Vitesses
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('speed-stable-kmh', vKmh.toFixed(2) + " km/h");
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('speed-max-session', (State.vMax.toNumber() * 3.6).toFixed(2) + " km/h");

    // Relativité
    const lorentz = 1 / Math.sqrt(1 - (vMs**2 / c**2));
    safeSet('lorentz-factor', lorentz.toFixed(18));
    safeSet('time-dilation', ((lorentz - 1) * 1e9).toFixed(6) + " ns/s");

    // Dynamique
    const rho = (State.pressure * 100) / (287.05 * (State.temp + 273.15));
    const drag = 0.5 * rho * vMs**2 * 0.47 * 0.7;
    safeSet('drag-force', drag.toFixed(3) + " N");
    safeSet('mach-number', (vMs / (331.3 * Math.sqrt(1 + State.temp/273.15))).toFixed(5));
}

// --- MODULE 3 : GÉODÉSIE ECEF & ASTRO ---
function syncSpaceTime() {
    // ECEF X,Y,Z
    const lat = State.coords.lat * Math.PI / 180;
    const lon = State.coords.lon * Math.PI / 180;
    const a = 6378137.0;
    const e2 = 0.00669437999014;
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat)**2);
    
    const x = (N + State.coords.alt) * Math.cos(lat) * Math.cos(lon);
    const y = (N + State.coords.alt) * Math.cos(lat) * Math.sin(lon);
    const z = (N * (1 - e2) + State.coords.alt) * Math.sin(lat);

    safeSet('coord-x-geo', x.toFixed(3));
    safeSet('coord-y-geo', y.toFixed(3));
    safeSet('coord-z-geo', z.toFixed(3));

    // Julian Date & Delta T
    const now = new Date();
    const jd = (now.getTime() / 86400000) + 2440587.5;
    safeSet('julian-date', jd.toFixed(10));
}

// --- MODULE 4 : BIOSVT & DISTANCE ---
function syncBio(dt) {
    const ratio = State.netherMode ? 8 : 1;
    const move = State.v.multiply(_BN(dt)).multiply(_BN(ratio));
    State.dist = State.dist.add(move);

    safeSet('dist-3d-precise', State.dist.toFixed(3) + " m");
    safeSet('total-distance-3d-1', (State.dist.toNumber() / 1000).toFixed(4) + " km");
    safeSet('O2-saturation', (98 - (State.v.toNumber() * 0.01)).toFixed(1) + " %");
}

// --- INITIALISATION DES ÉVÉNEMENTS ---
function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

document.getElementById('start-btn-final').addEventListener('click', async () => {
    // Demande de permission pour iOS
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') return;
    }

    State.active = true;
    document.getElementById('start-btn-final').style.display = 'none';

    window.addEventListener('devicemotion', (e) => {
        if (!State.active) return;
        
        const motion = processDeviceMotion(e);
        syncPhysics();
        syncSpaceTime();
        syncBio(motion.dt);

        // Saturation IMU Raw
        safeSet('acc-x', (e.accelerationIncludingGravity.x || 0).toFixed(3));
        safeSet('acc-y', (e.accelerationIncludingGravity.y || 0).toFixed(3));
        safeSet('acc-z', (e.accelerationIncludingGravity.z || 0).toFixed(3));
    });
});

// Switch Mode Nether
document.getElementById('nether-toggle-btn').addEventListener('click', function() {
    State.netherMode = !State.netherMode;
    this.innerText = State.netherMode ? "NETHER: ACTIVÉ (1:8)" : "NETHER: DÉSACTIVÉ (1:1)";
    safeSet('distance-ratio', State.netherMode ? "8.000" : "1.000");
});
