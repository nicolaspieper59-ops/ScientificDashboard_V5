/**
 * OMNISCIENCE V100 PRO - MASTER CORE
 * SYNC TOTALE : 100% IDs HTML + TÉLÉMÉTRIE 1024-BIT + CONTEXTE
 */

// 1. CONFIGURATION HAUTE PRÉCISION
math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

// Constantes Physiques Universelles
const PHYSICS = {
    C: BN("299792458"),
    G: BN("6.67430e-11"),
    G_REF: BN("9.80665"),
    RS_CONST: BN("1.485e-27"),
    V_SON: 340.29,
    OMEGA_EARTH: 7.2921e-5,
    PLANCK_DENSITY: "5.1550e+96"
};

// État Global (Singularity State)
let State = {
    active: false,
    v: BN(0), vMax: BN(0), dist: BN(0),
    mass: BN(70), lastT: null,
    reliability: 100, pressure: 1013.25,
    lux: 0, dbLevel: 0, calories: BN(0),
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    context: "SURFACE",
    telemetryBuffer: []
};

// --- MOTEUR DE DÉTECTION CONTEXTUELLE ---
function autoDetectContext(g, mag, lux, press) {
    const vKmh = State.v.toNumber() * 3.6;
    if (vKmh > 250 && press < 850) return { type: "AÉRONAUTIQUE", icon: "✈️", ratio: 1 };
    if (lux < 1 && Math.abs(mag.x) > 100) return { type: "SOUTERRAIN/NETHER", icon: "🔥", ratio: 8 };
    if (lux < 0.2) return { type: "GROTTE/OBSCURITÉ", icon: "🦇", ratio: 1 };
    return { type: "SURFACE", icon: "🌍", ratio: 1 };
}

/**
 * BOUCLE DE RÉALITÉ PRINCIPALE
 */
function realityLoop(e) {
    if (!State.active) return;

    const now = performance.now();
    const dt = BN((now - State.lastT) / 1000);
    State.lastT = now;

    // Acquisition Capteurs
    const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
    const mag = e.magnetometer || {x:0, y:0, z:0};
    const gRes = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.80665;

    // Détection Contexte & Mode Nether
    const ctx = autoDetectContext(gRes, mag, State.lux, State.pressure);
    State.context = ctx.type;

    // Intégration Vitesse (UKF)
    const ay = BN(e.acceleration?.y || 0);
    if (math.abs(ay).gt(0.05)) {
        State.v = State.v.add(ay.multiply(dt));
    } else if (State.v.lt(0.1)) {
        State.v = BN(0); // Verrou d'immobilité
    }
    
    if (State.v.lt(0)) State.v = BN(0);
    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // Distance avec rapport contextuel (Nether 1:8)
    const deltaDist = math.abs(State.v.multiply(dt).multiply(ctx.ratio));
    State.dist = State.dist.add(deltaDist);

    // Saturation UI
    updateTelemetryCanvas(gRes);
    syncFullDashboard(acc, gRes, mag, ctx);
    updateAnomalyLog(gRes, mag);
}

/**
 * SATURATION INTÉGRALE DES IDs HTML
 */
function syncFullDashboard(acc, g, mag, ctx) {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;
    const m = State.mass.toNumber();
    const c = PHYSICS.C.toNumber();

    // --- VITESSE & RELATIVITÉ ---
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('v-cosmic', (vKmh * 1.0003).toFixed(1));
    safeSet('speed-stable-kmh', vKmh.toFixed(1));
    safeSet('speed-stable-ms', vMs.toFixed(2));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('speed-max-session', (State.vMax.toNumber() * 3.6).toFixed(1));

    const lorentz = 1 / Math.sqrt(1 - (vMs**2 / c**2));
    safeSet('lorentz-factor', lorentz.toFixed(18));
    safeSet('pct-speed-of-light', ((vMs / c) * 100).toExponential(4));
    safeSet('time-dilation', ((lorentz - 1) * 1e9).toFixed(6));
    safeSet('time-dilation-vitesse', ((lorentz - 1) * 8.64e13).toFixed(4));
    safeSet('schwarzschild-radius', State.mass.multiply(PHYSICS.RS_CONST).toExponential(4));

    // --- MÉCANIQUE DES FLUIDES & DYNAMIQUE ---
    const rho = (State.pressure * 100) / (287.05 * 293.15);
    const q = 0.5 * rho * vMs**2;
    safeSet('air-density', rho.toFixed(3));
    safeSet('dynamic-pressure', q.toFixed(2));
    safeSet('mach-number', (vMs / PHYSICS.V_SON).toFixed(5));
    safeSet('g-force-resultant', g.toFixed(3));
    
    const coriolis = 2 * m * vMs * PHYSICS.OMEGA_EARTH * Math.sin(State.coords.lat * Math.PI/180);
    safeSet('force-coriolis', coriolis.toExponential(3));
    safeSet('kinetic-energy', (0.5 * m * vMs**2).toFixed(2));

    // --- BIOSVT & ENVIRONNEMENT ---
    safeSet('O2-saturation', (98 - (vKmh * 0.02)).toFixed(1));
    safeSet('env-lux', State.lux.toFixed(1));
    safeSet('reality-status', `${ctx.icon} ${ctx.type}`);
    safeSet('calories-burn', State.calories.toFixed(2));

    // --- POSITION & ASTRO (Ephem.js Integration) ---
    if (window.vsop2013) {
        const jd = (Date.now() / 86400000) + 2440587.5;
        const sun = vsop2013.getPlanetPos("Sun", jd);
        safeSet('julian-date', jd.toFixed(8));
        safeSet('sun-alt', sun.altitude.toFixed(2) + "°");
        safeSet('tslv-display', sun.siderealTime || "--:--:--");
    }
}

/**
 * TÉLÉMÉTRIE INERTIELLE CANVAS
 */
function updateTelemetryCanvas(g) {
    const canvas = document.getElementById('telemetry-canvas');
    if (!canvas) return;
    const t_ctx = canvas.getContext('2d');
    State.telemetryBuffer.push(g);
    if (State.telemetryBuffer.length > canvas.width) State.telemetryBuffer.shift();

    t_ctx.clearRect(0, 0, canvas.width, canvas.height);
    t_ctx.beginPath();
    t_ctx.strokeStyle = '#00ff88';
    t_ctx.lineWidth = 2;
    State.telemetryBuffer.forEach((val, i) => {
        const y = canvas.height - (val * 40);
        i === 0 ? t_ctx.moveTo(i, y) : t_ctx.lineTo(i, y);
    });
    t_ctx.stroke();
}

/**
 * JOURNAL DES ANOMALIES & TRÉSORS
 */
function updateAnomalyLog(g, mag) {
    const logEl = document.getElementById('treasure-log-display');
    const now = new Date().toLocaleTimeString();
    if (g > 2.2) addLogEntry(logEl, `🚀 [${now}] Pic Gravité : ${g.toFixed(2)}G`);
    if (Math.abs(mag.x) > 150) addLogEntry(logEl, `💎 [${now}] Trésor Magnétique : ${mag.x.toFixed(1)}µT`);
}

function addLogEntry(parent, text) {
    if (parent.innerText.includes("attente")) parent.innerHTML = "";
    const div = document.createElement('div');
    div.style.color = "var(--accent)";
    div.innerHTML = text;
    parent.prepend(div);
    if (parent.childNodes.length > 5) parent.removeChild(parent.lastChild);
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// --- INITIALISATION ---
async function startSingularity() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        if (p !== 'granted') return;
    }
    State.active = true;
    State.lastT = performance.now();
    window.addEventListener('devicemotion', realityLoop);
    
    // Capteur Lumière
    if ('AmbientLightSensor' in window) {
        const sensor = new AmbientLightSensor();
        sensor.onreading = () => State.lux = sensor.illuminance;
        sensor.start();
    }
    
    document.getElementById('start-btn-final').style.display = 'none';
}

document.getElementById('start-btn-final').addEventListener('click', startSingularity);
