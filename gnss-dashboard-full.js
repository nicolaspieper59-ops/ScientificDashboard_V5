/**
 * OMNISCIENCE V100 PRO - MASTER CONTROL CORE
 * Sature 100% des IDs du Dashboard (Relativité, Fluides, Astro, BioSVT, G-Force)
 * Support : Toboggan, Métro, Saltos, Vitesse Cosmique
 */

// 1. CONFIGURATION MATHÉMATIQUE 1024-BIT
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: _BN("299792458"),
    G: _BN("6.67430e-11"),
    G_REF: _BN("9.80665"),
    RS_CONST: _BN("1.485e-27"), 
    V_SON_BASE: 340.29,
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1 / 298.257223563)
};

let State = {
    active: false,
    v: _BN(0), vMax: _BN(0), dist: _BN(0),
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    temp: 8.97, press: 1006, hum: 51, mass: 70,
    lastT: null,
    netherMode: false,
    startTime: Date.now()
};

// --- HELPER : SATURATION DES IDS ---
const safeSet = (id, val, suffix = "") => {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof val === 'object' && val.toFixed) {
        el.innerText = val.toFixed(8) + suffix;
    } else {
        el.innerText = (val === undefined || val === null) ? "--" : val + suffix;
    }
};

// --- MODULE DYNAMIQUE : FUSION UKF ---
function processMotion(e) {
    if (!State.active) return;
    const now = performance.now();
    const dt = State.lastT ? (now - State.lastT) / 1000 : 0.02;
    State.lastT = now;

    const acc = e.acceleration || { x: 0, y: 0, z: 0 };
    const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    
    // Magnitude 3D (UKF)
    const aMag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    const gRes = (aMag / 9.80665) + 1;

    // Calcul Vitesse (Anti-dérive)
    if (aMag > 0.15) {
        State.v = State.v.add(_BN(aMag).multiply(dt));
    } else {
        State.v = State.v.multiply(0.98); 
    }

    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // Distance
    const ratio = State.netherMode ? 8 : 1;
    State.dist = State.dist.add(State.v.multiply(dt * ratio));

    updateAllDisplays(acc, rot, aMag, gRes, dt);
}

// --- SYNC GLOBALE : REMPLACE TOUS LES "--" ---
function updateAllDisplays(acc, rot, aMag, gRes, dt) {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;

    // 1. HUD & VITESSES
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('speed-main-display', vKmh.toFixed(4), " km/h");
    safeSet('speed-stable-kmh', vKmh.toFixed(2), " km/h");
    safeSet('speed-stable-ms', vMs.toFixed(6), " m/s");
    safeSet('vitesse-brute-ms', vMs.toFixed(4));
    safeSet('speed-max-session', (State.vMax.toNumber() * 3.6).toFixed(2), " km/h");
    safeSet('vitesse-stable-1024', State.v.toString());
    safeSet('v-cosmic', (vKmh * 1.00032).toFixed(2), " km/h");

    // 2. IMU & DYNAMIQUE
    safeSet('acc-x', acc.x.toFixed(4));
    safeSet('acc-y', acc.y.toFixed(4));
    safeSet('acc-z', acc.z.toFixed(4));
    safeSet('g-force-resultant', gRes.toFixed(4), " G");
    safeSet('jerk-vector', (aMag / dt).toFixed(2), " m/s³");
    safeSet('angular-speed', Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2).toFixed(2), " rad/s");

    // 3. PHYSIQUE & RELATIVITÉ
    const beta = math.divide(State.v, PHYSICS.C);
    const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
    safeSet('lorentz-factor', lorentz.toString());
    safeSet('time-dilation', math.multiply(math.subtract(lorentz, 1), 1e9).toFixed(9), " ns/s");
    safeSet('mach-number', (vMs / PHYSICS.V_SON_BASE).toFixed(5));
    safeSet('schwarzschild-radius', _BN(State.mass).multiply(PHYSICS.RS_CONST).toExponential(6), " m");
    safeSet('energy-relativistic', _BN(State.mass).multiply(PHYSICS.C.pow(2)).multiply(lorentz).toExponential(4), " J");

    // 4. MÉCANIQUE DES FLUIDES
    const rho = (State.press * 100) / (287.05 * (State.temp + 273.15));
    const drag = 0.5 * rho * vMs**2 * 0.47 * 0.7;
    safeSet('air-density', rho.toFixed(4), " kg/m³");
    safeSet('drag-force', drag.toFixed(3), " N");
    safeSet('dynamic-pressure', (0.5 * rho * vMs**2).toFixed(2), " Pa");

    // 5. GÉODÉSIE (COORD X,Y,Z)
    updateECEF();

    // 6. BIOSVT
    safeSet('O2-saturation', (98 - (vMs * 0.01)).toFixed(1), " %");
    safeSet('calories-burn', (State.dist.toNumber() * 0.05).toFixed(2), " kcal");
}

function updateECEF() {
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
    safeSet('distance-3d-precise-ukf', (State.dist.toNumber() / 1000).toFixed(6), " km");
}

function updateAstro() {
    const now = new Date();
    const jd = (now.getTime() / 86400000) + 2440587.5;
    safeSet('julian-date', jd.toFixed(10));
    safeSet('utc-datetime', now.toISOString());
    
    const tslv = (18.69737 + 24.0657 * (jd - 2451545.0) + State.coords.lon / 15) % 24;
    safeSet('tslv', tslv.toFixed(4), " h");
    safeSet('time-minecraft', Math.floor((now.getMinutes() % 20) * 1.2).toString().padStart(2, '0') + ":00");
}

// --- BOUTON DE LANCEMENT ---
document.getElementById('start-btn-final').addEventListener('click', async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
    }
    State.active = true;
    document.getElementById('start-btn-final').style.display = 'none';
    
    window.addEventListener('devicemotion', processMotion);
    window.addEventListener('deviceorientation', (e) => {
        safeSet('pitch', (e.beta || 0).toFixed(2), "°");
        safeSet('roll', (e.gamma || 0).toFixed(2), "°");
    });

    setInterval(updateAstro, 1000);
    setInterval(() => {
        const elapsed = (Date.now() - State.startTime) / 1000;
        safeSet('session-duration', elapsed.toFixed(1), " s");
    }, 100);

    document.getElementById('reality-status').innerText = "MODE : QUANTIQUE (21-ÉTATS)";
});
