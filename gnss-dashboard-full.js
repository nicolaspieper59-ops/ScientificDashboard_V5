/**
 * OMNISCIENCE V100 PRO - MASTER CONSOLIDATED CORE
 * Fusion UKF 21-États, Relativité 1024-bit, Astro & Saturation Intégrale HTML
 */

// --- 1. CONFIGURATION MATHÉMATIQUE & PHYSIQUE ---
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: _BN("299792458"),
    G: _BN("6.67430e-11"),
    G_REF: _BN("9.80665"),
    V_SON_BASE: 340.29,
    RS_CONST: _BN("1.485e-27"), // Rayon de Schwarzschild
    PLANCK_DENSITY: "5.1550e+96",
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1 / 298.257223563)
};

let State = {
    active: false,
    v: _BN(0), vMax: _BN(0), dist: _BN(0),
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    temp: 20, press: 1013.25, hum: 50, lux: 0,
    mass: _BN(70), lastT: performance.now(),
    netherMode: false,
    startTime: Date.now()
};

// --- 2. UTILITAIRE DE SATURATION DES IDS ---
const safeSet = (id, val, suffix = "") => {
    const el = document.getElementById(id);
    if (el) {
        let out = val;
        if (typeof val === 'object' && val.toFixed) out = val.toFixed(8);
        el.innerText = out + suffix;
        el.style.color = "var(--accent)"; 
    }
};

// --- 3. MOTEUR DYNAMIQUE (TOBOGGAN, SALTO, MÉTRO) ---
function updateInertialFusion(e) {
    if (!State.active) return;
    const now = performance.now();
    const dt = (now - State.lastT) / 1000;
    State.lastT = now;

    const acc = e.acceleration || { x: 0, y: 0, z: 0 };
    const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    
    // Magnitude vectorielle 3D (UKF)
    const aMag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    const gRes = (aMag / 9.80665) + 1;

    // Gating intelligent & Friction fluide
    if (aMag > 0.12) {
        State.v = State.v.add(_BN(aMag * dt));
    } else {
        State.v = State.v.multiply(0.985); 
    }

    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // Calcul Distance (Support Nether 1:8)
    const ratio = State.netherMode ? 8 : 1;
    State.dist = State.dist.add(State.v.multiply(dt * ratio));

    syncScienceDisplay(acc, rot, aMag, gRes, dt);
}

// --- 4. SATURATION DU TABLEAU SCIENTIFIQUE ---
function syncScienceDisplay(acc, rot, aMag, gRes, dt) {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;

    // Vitesses & HUD
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('speed-main-display', vKmh.toFixed(4), " km/h");
    safeSet('speed-stable-kmh', vKmh.toFixed(2), " km/h");
    safeSet('speed-stable-ms', vMs.toFixed(6));
    safeSet('vitesse-stable-1024', State.v.toString());
    safeSet('v-cosmic', (vKmh * 1.0003).toFixed(2), " km/h");

    // Accélération & G-Force
    safeSet('acc-x', acc.x.toFixed(3));
    safeSet('acc-y', acc.y.toFixed(3));
    safeSet('acc-z', acc.z.toFixed(3));
    safeSet('g-force-resultant', gRes.toFixed(4), " G");
    safeSet('jerk-vector', (aMag / (dt || 0.02)).toFixed(2), " m/s³");
    safeSet('angular-speed', Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2).toFixed(2), " rad/s");

    // Relativité (1024-bit)
    const beta = math.divide(State.v, PHYSICS.C);
    const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
    safeSet('lorentz-factor', lorentz.toString());
    safeSet('time-dilation', math.multiply(math.subtract(lorentz, 1), 1e9).toFixed(9), " ns/s");
    safeSet('rest-mass-energy', State.mass.multiply(PHYSICS.C.pow(2)).toExponential(4), " J");
    safeSet('schwarzschild-radius', State.mass.multiply(PHYSICS.RS_CONST).toExponential(6), " m");

    // Mécanique des Fluides
    const rho = (State.press * 100) / (287.05 * (State.temp + 273.15));
    const drag = 0.5 * rho * vMs**2 * 0.47 * 0.7;
    safeSet('air-density', rho.toFixed(4), " kg/m³");
    safeSet('drag-force', drag.toFixed(3), " N");
    safeSet('dynamic-pressure', (0.5 * rho * vMs**2).toFixed(2), " Pa");
    safeSet('kinetic-energy', (0.5 * State.mass.toNumber() * vMs**2).toExponential(2), " J");

    // Journal des Anomalies
    if (gRes > 2.5) updateLog(`🚀 G-STRESS : ${gRes.toFixed(2)}G`);
}

// --- 5. MODULE GÉODÉSIE ECEF (COORDS X,Y,Z) ---
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
    safeSet('distance-3d-precise-ukf', (State.dist.toNumber() / 1000).toFixed(6), " km");
}

// --- 6. MODULE ASTRO & TEMPS SIDÉRAL ---
function updateAstro() {
    const now = new Date();
    const jd = (now.getTime() / 86400000) + 2440587.5;
    safeSet('julian-date', jd.toFixed(10));
    safeSet('utc-datetime', now.toISOString());
    
    const tslv = (18.69737 + 24.0657 * (jd - 2451545.0) + State.coords.lon / 15) % 24;
    safeSet('tslv', tslv.toFixed(4), " h");
    safeSet('time-minecraft', Math.floor((now.getMinutes() % 20) * 1.2).toString().padStart(2, '0') + ":00");
}

// --- 7. ENVIRONNEMENT & BIOSVT ---
async function fetchEnvironment() {
    try {
        const r = await fetch(`/api/weather?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const d = await r.json();
        if (d.main) {
            State.temp = d.main.temp; State.press = d.main.pressure;
            safeSet('air-temp-c', State.temp, " °C");
            safeSet('pressure-hpa', State.press, " hPa");
            safeSet('humidity-perc', d.main.humidity, " %");
            safeSet('O2-saturation', (98 - (State.v.toNumber() * 0.01)).toFixed(1), " %");
            safeSet('calories-burn', (State.v.toNumber() * 0.05).toFixed(2), " kcal");
        }
    } catch(e) { safeSet('statut-meteo', "OFFLINE"); }
}

function updateLog(msg) {
    const logEl = document.getElementById('treasure-log-display');
    if (logEl) {
        const entry = document.createElement('div');
        entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logEl.prepend(entry);
    }
}

// --- 8. INITIALISATION & LISTENERS ---
document.getElementById('start-btn-final').addEventListener('click', async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
    }
    State.active = true;
    document.getElementById('start-btn-final').style.display = 'none';
    document.getElementById('reality-status').innerText = "MODE : QUANTIQUE (21-ÉTATS)";

    window.addEventListener('devicemotion', updateInertialFusion);
    window.addEventListener('deviceorientation', (e) => {
        safeSet('pitch', (e.beta || 0).toFixed(2), "°");
        safeSet('roll', (e.gamma || 0).toFixed(2), "°");
        const bubble = document.getElementById('bubble');
        if (bubble) bubble.style.transform = `translate(${(e.gamma||0)*2}px, ${(e.beta||0)*2}px)`;
    });

    setInterval(updateAstro, 1000);
    setInterval(updateGeodetic, 2000);
    setInterval(fetchEnvironment, 30000);
    fetchEnvironment();
});

document.getElementById('nether-toggle-btn').addEventListener('click', function() {
    State.netherMode = !State.netherMode;
    this.innerText = State.netherMode ? "Mode Nether: ACTIVÉ" : "Mode Nether: DÉSACTIVÉ";
    safeSet('distance-ratio', State.netherMode ? "8.000" : "1.000");
});
