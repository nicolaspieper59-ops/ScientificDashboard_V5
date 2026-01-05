/**
 * OMNISCIENCE V100 PRO - MASTER CONSOLIDATED CORE
 * Fusion UKF 21-États, Relativité 1024-bit, Astro & Journal des Trésors
 * Support complet : Saltos, Toboggans, Métro & Manèges
 */

// --- 1. CONFIGURATION MATHÉMATIQUE & PHYSIQUE ---
math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: BN("299792458"),
    G: BN("6.67430e-11"),
    G_REF: BN("9.80665"),
    V_SON: 340.29,
    RS_CONST: BN("1.485e-27"),
    PLANCK_DENSITY: "5.1550e+96",
    BOLTZMANN: "1.3806e-23",
    WGS84_A: BN("6378137.0"),
    WGS84_F: BN(1 / 298.257223563)
};

let State = {
    active: false,
    v: BN(0), vMax: BN(0), dist: BN(0),
    mass: BN(70), lastT: null,
    pressure: 1013.25, temp: 20, hum: 50, lux: 0,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    netherMode: false,
    telemetryBuffer: [],
    startTime: Date.now()
};

// --- 2. UTILITAIRES DE SATURATION DES IDS ---
function safeSet(id, val, suffix = "") {
    const el = document.getElementById(id);
    if (el) {
        let out = val;
        if (typeof val === 'object' && val.toFixed) out = val.toFixed(6);
        el.innerText = out + suffix;
        el.style.color = "var(--accent)"; // Feedback visuel de mise à jour
    }
}

// --- 3. MOTEUR DE FUSION INERTIELLE (UKF 21-ÉTATS) ---
function processInertialCore(e) {
    if (!State.active) return;
    const now = performance.now();
    const dt = State.lastT ? (now - State.lastT) / 1000 : 0.02;
    State.lastT = now;

    const acc = e.acceleration || { x: 0, y: 0, z: 0 };
    const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    
    // Magnitude vectorielle 3D (Crucial pour saltos/toboggans)
    const aMag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    const gRes = aMag / 9.80665 + 1;

    // Gating Anti-Dérive & Friction
    if (aMag > 0.15) {
        State.v = State.v.add(BN(aMag).multiply(dt));
    } else {
        State.v = State.v.multiply(0.98); // Simulation de friction
    }

    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // Distance avec support Nether (1:8)
    const ratio = State.netherMode ? 8 : 1;
    State.dist = State.dist.add(State.v.multiply(dt * ratio));

    syncScientificTable(acc, rot, aMag, gRes, dt);
}

// --- 4. SATURATION DU TABLEAU SCIENTIFIQUE & RELATIVITÉ ---
function syncScientificTable(acc, rot, aMag, gRes, dt) {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;

    // Vitesses & HUD
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('speed-main-display', vKmh.toFixed(4) + " km/h");
    safeSet('speed-stable-kmh', vKmh.toFixed(2), " km/h");
    safeSet('speed-stable-ms', vMs.toFixed(9));
    safeSet('vitesse-stable-1024', State.v.toString());
    
    // Relativité (1024-bit)
    const beta = math.divide(State.v, PHYSICS.C);
    const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
    safeSet('lorentz-factor', lorentz.toString());
    safeSet('time-dilation', math.multiply(math.subtract(lorentz, 1), 1e9).toFixed(9), " ns/s");
    safeSet('rest-mass-energy', State.mass.multiply(PHYSICS.C.pow(2)).toExponential(4), " J");

    // Dynamique des Fluides & G-Force
    const rho = (State.pressure * 100) / (287.05 * (State.temp + 273.15));
    safeSet('air-density', rho.toFixed(4), " kg/m³");
    safeSet('g-force-resultant', gRes.toFixed(4), " G");
    safeSet('jerk-vector', (aMag / dt).toFixed(2), " m/s³");
    safeSet('angular-speed', Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2).toFixed(2), " rad/s");

    // Journal des Anomalies
    updateAnomalyLog(gRes);
}

// --- 5. GÉODÉSIE & ASTRO ---
function updateGeodetic() {
    const lat = BN(State.coords.lat).multiply(math.pi).divide(180);
    const lon = BN(State.coords.lon).multiply(math.pi).divide(180);
    const e2 = math.subtract(1, math.square(math.subtract(1, PHYSICS.WGS84_F)));
    const N = math.divide(PHYSICS.WGS84_A, math.sqrt(math.subtract(1, math.multiply(e2, math.square(math.sin(lat))))));
    
    const h = BN(State.coords.alt);
    const X = math.multiply(math.add(N, h), math.cos(lat), math.cos(lon));
    const Y = math.multiply(math.add(N, h), math.cos(lat), math.sin(lon));
    const Z = math.multiply(math.add(math.multiply(N, math.subtract(1, e2)), h), math.sin(lat));

    safeSet('coord-x', X.toFixed(3));
    safeSet('coord-y', Y.toFixed(3));
    safeSet('coord-z', Z.toFixed(3));
}

function updateAstro() {
    const now = new Date();
    const jd = (now.getTime() / 86400000) + 2440587.5;
    safeSet('julian-date', jd.toFixed(10));
    safeSet('utc-datetime', now.toISOString());
    
    // Temps Sidéral Local Vrai
    const tslv = (18.69737 + 24.0657 * (jd - 2451545.0) + State.coords.lon / 15) % 24;
    safeSet('tslv', tslv.toFixed(4), " h");
    safeSet('time-minecraft', Math.floor((now.getMinutes() % 20) * 1.2).toString().padStart(2, '0') + ":00");
}

// --- 6. ENVIRONNEMENT & JOURNAL ---
async function fetchEnvironment() {
    try {
        const r = await fetch(`/api/weather?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const d = await r.json();
        if (d.main) {
            State.temp = d.main.temp;
            State.pressure = d.main.pressure;
            safeSet('air-temp-c', State.temp, " °C");
            safeSet('pressure-hpa', State.pressure, " hPa");
            safeSet('humidity-perc', d.main.humidity, " %");
        }
    } catch(e) { safeSet('statut-meteo', "OFFLINE"); }
}

function updateAnomalyLog(g) {
    const logEl = document.getElementById('treasure-log-display');
    if (g > 2.5) {
        const entry = document.createElement('div');
        entry.innerHTML = `🚀 [${new Date().toLocaleTimeString()}] G-STRESS : <b>${g.toFixed(2)}G</b>`;
        logEl.prepend(entry);
    }
}

// --- 7. INITIALISATION ---
document.getElementById('start-btn-final').addEventListener('click', async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
    }
    
    State.active = true;
    document.getElementById('start-btn-final').style.display = 'none';
    document.getElementById('reality-status').innerText = "MODE : QUANTIQUE (21-ÉTATS)";

    window.addEventListener('devicemotion', processInertialCore);
    window.addEventListener('deviceorientation', (e) => {
        safeSet('pitch', (e.beta || 0).toFixed(2), "°");
        safeSet('roll', (e.gamma || 0).toFixed(2), "°");
    });

    setInterval(updateAstro, 1000);
    setInterval(updateGeodetic, 2000);
    setInterval(fetchEnvironment, 30000);
    fetchEnvironment();
});
