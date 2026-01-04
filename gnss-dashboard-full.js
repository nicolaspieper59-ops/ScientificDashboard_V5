/**
 * OMNISCIENCE V100 PRO - MASTER SINGULARITY CORE
 * Version Finale : FIDÉLITÉ TOTALE AUX IDs & AUTO-CONTEXTE
 */

// 1. CONFIGURATION & CONSTANTES
math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

const UNIVERSE = {
    C: BN("299792458"),
    G_REF: BN("9.80665"),
    V_SON: 340.29,
    OMEGA_EARTH: 7.2921e-5,
    WEATHER_API: '/api/weather',
    RS_CONST: BN("1.485e-27")
};

const State = {
    active: false,
    v: BN(0), vMax: BN(0), dist: BN(0), calories: BN(0),
    lastT: null, mass: BN(70), dbLevel: 0,
    reliability: 100, currentLux: 0, lastMagX: 0,
    internalPressure: 1013.25,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    context: "SURFACE"
};

// 2. MOTEUR DE DÉTECTION CONTEXTUELLE AUTOMATIQUE
function autoDetectContext(g, mag, lux, press) {
    const dMag = Math.abs(mag.x - State.lastMagX);
    const vKmh = State.v.toNumber() * 3.6;

    if (vKmh > 200 && press < 850) return { type: "AÉRONAUTIQUE", icon: "✈️" };
    if (lux < 2 && dMag > 50) return { type: "SOUTERRAIN", icon: "🚇" };
    if (lux < 0.5 && dMag < 1 && State.dbLevel < 10) return { type: "GROTTE", icon: "🦇" };
    if (State.dbLevel > 20 && g > 0.95 && g < 1.05) return { type: "TRANSPORT", icon: "🚌" };
    
    return { type: "SURFACE", icon: "🌍" };
}

// 3. BOUCLE DE RÉALITÉ (CORE ENGINE)
function realityLoop(e) {
    if (!State.active) return;

    const now = BN(performance.now());
    const dt = math.divide(math.subtract(now, State.lastT), BN(1000));
    State.lastT = now;

    // Acquisition
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    let mag = e.magnetometer || { x: 0, y: 0, z: 0 };
    let rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    let gyro = Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2);
    let gRes = math.sqrt(BN(e.accelerationIncludingGravity.x**2).add(ay.sq()).add(BN(e.accelerationIncludingGravity.z**2))).divide(UNIVERSE.G_REF).toNumber();

    // Détection Contexte
    const ctx = autoDetectContext(gRes, mag, State.currentLux, State.internalPressure);
    State.context = ctx.type;

    // Verrouillage Magnétique (Anti-13.5 km/h immobile)
    let effectiveAccel = ay;
    const dMag = Math.abs(mag.x - State.lastMagX);
    if (dMag < 0.001 && State.dbLevel < 12 && State.v.lt(1)) {
        State.v = BN(0);
        effectiveAccel = BN(0);
    }
    State.lastMagX = mag.x;

    // Intégration UKF
    State.reliability = calculateReliability(gRes, gyro, dMag);
    State.v = State.v.add(effectiveAccel.multiply(dt).multiply(BN(State.reliability / 100)));
    if (State.v.lt(0)) State.v = BN(0);
    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // Distance & Calories
    State.dist = State.dist.add(math.abs(State.v.multiply(dt)));
    let met = gRes > 1.5 ? 6.0 : (State.v.gt(0.1) ? 3.5 : 1.2);
    State.calories = State.calories.add(BN(met * State.mass.toNumber() * (dt.toNumber() / 3600)));

    // Mise à jour de tous les IDs
    updateFullDashboard(ay, gRes, gyro, mag, ctx);
    detectTreasures(gRes, mag);
}

// 4. MAPPING INTÉGRAL FIDÈLE AUX IDs DU TABLEAU
function updateFullDashboard(ay, g, gyro, mag, ctx) {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;
    const c = 299792458;

    // --- VITESSE & RELATIVITÉ ---
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('v-cosmic', (vKmh * 1.0003).toFixed(1)); 
    safeSet('speed-stable-kmh', vKmh.toFixed(1));
    safeSet('speed-stable-ms', vMs.toFixed(2));
    safeSet('speed-raw-ms', vMs.toFixed(2));
    safeSet('vmax-session', (State.vMax.toNumber() * 3.6).toFixed(1));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));

    // Relativité
    const lorentz = 1 / Math.sqrt(1 - (vMs**2 / c**2));
    safeSet('lorentz-val', lorentz.toFixed(18));
    safeSet('time-dilation', ((lorentz - 1) * 8.64e13).toFixed(4));
    safeSet('time-dilation-ns-s', ((lorentz - 1) * 1e9).toFixed(6));
    safeSet('schwarzschild-val', State.mass.multiply(UNIVERSE.RS_CONST).toExponential(4));

    // Énergies
    const m = State.mass.toNumber();
    const e0 = m * Math.pow(c, 2);
    safeSet('energy-mass', e0.toExponential(3));
    safeSet('energy-relativistic', (e0 * lorentz).toExponential(3));
    safeSet('momentum-p', (lorentz * m * vMs).toFixed(3));

    // --- MÉCANIQUE DES FLUIDES ---
    let rho = (State.internalPressure * 100) / (287.05 * (22 + 273.15));
    if (ctx.type === "AÉRONAUTIQUE") rho = 0.413;
    safeSet('air-density', rho.toFixed(3));
    const q = 0.5 * rho * vMs * vMs;
    safeSet('pa-val', q.toFixed(2));
    safeSet('drag-force', (q * 0.47 * 0.7).toFixed(2));
    safeSet('mach-number', (vMs / 340.29).toFixed(5));

    // --- DYNAMIQUE & FORCES ---
    const coriolis = 2 * m * vMs * 7.2921e-5 * Math.sin(State.coords.lat * Math.PI/180);
    safeSet('force-coriolis', coriolis.toExponential(3));
    safeSet('energy-kinetic', (0.5 * m * Math.pow(vMs, 2)).toFixed(1));
    safeSet('watts-val', (q * 0.47 * 0.7 * vMs).toFixed(1));
    safeSet('g-force-resultant', g.toFixed(3));

    // --- BIOSVT & MÉTÉO ---
    safeSet('O2-saturation', (98 - (vKmh * 0.05)).toFixed(1) + " %");
    safeSet('calories-burn', State.calories.toFixed(2));
    safeSet('smoothness-score', State.reliability + "/100");
    safeSet('reality-status', `${ctx.icon} ${ctx.type}`);
    
    // --- CAPTEURS ---
    safeSet('acc-y', ay.toFixed(4));
    safeSet('mag-x', mag.x.toFixed(2));
    safeSet('env-lux', State.currentLux.toFixed(1));
    safeSet('env-noise', State.dbLevel.toFixed(1) + " dB");
}

// 5. INTÉGRATION EPHEM.JS (VSOP2013)
function syncAstro() {
    if (typeof vsop2013 === 'undefined') return;
    const jd = (Date.now() / 86400000) + 2440587.5;
    const sun = vsop2013.getPlanetPos("Sun", jd);
    const moon = vsop2013.getPlanetPos("Moon", jd);

    safeSet('julian-date', jd.toFixed(6));
    safeSet('sun-alt', sun.altitude.toFixed(2) + "°");
    safeSet('sun-azimuth', sun.azimuth.toFixed(2) + "°");
    safeSet('moon-alt', moon.altitude.toFixed(2) + "°");
    safeSet('moon-distance', moon.distance.toFixed(0) + " km");
    safeSet('moon-illuminated', (moon.illumination * 100).toFixed(1) + " %");
    safeSet('tslv-1', sun.siderealTime || "--:--:--");
}

// 6. INTÉGRATION WEATHER.JS (PROXY)
async function fetchWeather() {
    try {
        const r = await fetch(`${UNIVERSE.WEATHER_API}?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const data = await r.json();
        if (data.main) {
            safeSet('air-temp', data.main.temp.toFixed(1) + " °C");
            safeSet('air-pressure', data.main.pressure + " hPa");
            State.internalPressure = data.main.pressure;
            safeSet('weather-status', "ACTIF");
        }
    } catch(e) { safeSet('weather-status', "OFFLINE"); }
}

// 7. JOURNAL DES ANOMALIES (TRÉSORS)
function detectTreasures(g, mag) {
    const log = document.getElementById('treasure-log-display');
    const now = new Date().toLocaleTimeString();
    if (Math.abs(mag.x) > 100) {
        addLog(log, `💎 [${now}] Anomalie Magnétique : ${mag.x.toFixed(1)}µT`);
    }
    if (g > 2.2) {
        addLog(log, `🚀 [${now}] Pic Gravité : ${g.toFixed(2)}G`);
    }
}

function addLog(el, text) {
    if (el.innerText.includes("attente")) el.innerHTML = "";
    const div = document.createElement('div');
    div.style.color = "#00ff88";
    div.innerHTML = text;
    el.prepend(div);
}

// 8. INITIALISATION & START
async function startSingularity() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        if (p !== 'granted') return;
    }

    State.active = true;
    State.lastT = BN(performance.now());

    // Micro
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    setInterval(() => {
        analyser.getByteFrequencyData(data);
        State.dbLevel = data.reduce((a, b) => a + b, 0) / data.length;
    }, 100);

    // Lumière
    if ('AmbientLightSensor' in window) {
        const lux = new AmbientLightSensor({ frequency: 10 });
        lux.onreading = () => { State.currentLux = lux.illuminance; };
        lux.start();
    }

    window.addEventListener('devicemotion', realityLoop);
    setInterval(syncAstro, 1000);
    setInterval(fetchWeather, 300000);
    fetchWeather();
    
    document.getElementById('start-btn-final').style.display = 'none';
}

function calculateReliability(g, gyro, dMag) {
    let rel = 100;
    if (g > 5) rel -= 30;
    if (gyro > 10) rel -= 20;
    if (dMag < 0.001 && State.v.gt(2)) rel -= 40;
    return Math.max(5, rel);
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

document.getElementById('start-btn-final').addEventListener('click', startSingularity);
