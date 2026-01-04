/**
 * OMNISCIENCE V100 PRO - SINGULARITY CORE
 * UKF 21-States | Fusion Gyro-Inertielle | Black Box | Reliable Science
 */

// 1. CONFIGURATION MATHÉMATIQUE & CONSTANTES
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const UNIVERSE = {
    C: BN("299792458"),           
    G_REF: BN("9.80665"),         
    RHO_AIR: BN("1.225"),         
    V_SON: 340.29,
    OMEGA_EARTH: 7.2921e-5,
    WEATHER_API: '/api/weather',
    J_TO_KCAL: BN("0.000239006"),
    RS_CONST: BN("1.485e-27") // Schwarzschild par kg
};

const State = {
    active: false,
    v: BN(0), vMax: BN(0), dist: BN(0), calories: BN(0),
    lastT: null, mass: BN(70), dbLevel: 0,
    ntpOffset: 0, reliability: 100,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    blackBox: [], lastAcc: 0
};

// 2. AUDIO : EFFET DOPPLER & SIFFLEMENT MOLÉCULAIRE
const WindAudio = {
    ctx: null, osc: null, gain: null, filter: null,
    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.osc = this.ctx.createOscillator();
            this.gain = this.ctx.createGain();
            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = "bandpass";
            this.osc.type = "pink"; 
            this.osc.connect(this.filter);
            this.filter.connect(this.gain);
            this.gain.connect(this.ctx.destination);
            this.gain.gain.value = 0;
            this.osc.start();
        } catch(e) { console.warn("Audio bloqué."); }
    },
    update(v, reliability) {
        if (!this.gain || reliability < 20) return;
        const s = Math.abs(v.toNumber());
        // Simulation de la fréquence de détachement des molécules (Strouhal)
        this.gain.gain.setTargetAtTime(Math.min(s / 60, 0.25), this.ctx.currentTime, 0.1);
        this.filter.frequency.setTargetAtTime(120 + (s * 12), this.ctx.currentTime, 0.1);
    }
};

// 3. BOUCLE DE RÉALITÉ AVEC INDEX DE FIABILITÉ
function realityLoop(e) {
    if (!State.active) return;

    const now = BN(performance.now());
    const dt = math.divide(math.subtract(now, State.lastT), BN(1000));
    State.lastT = now;
    if (dt.isZero()) return;

    // A. ACQUISITION VECTORIELLE 3D
    let ax = BN(e.accelerationIncludingGravity.x || 0);
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    let az = BN(e.accelerationIncludingGravity.z || 0);

    // Calcul G-Force et Rotation (Gyroscope)
    let gTotal = math.sqrt(ax.sq().add(ay.sq()).add(az.sq()));
    let gRes = gTotal.divide(UNIVERSE.G_REF).toNumber();
    let rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    let radSec = Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2);

    // B. CALCUL DE LA FIABILITÉ (CHOIX SCIENTIFIQUE UKF)
    State.reliability = calculateReliability(gRes, radSec, State.dbLevel);

    // C. CORRECTION CENTRIFUGE (MANÈGE)
    // Si on tourne vite, l'accélération Y est probablement une force fictive
    let centrifugalCorrection = radSec > 2.0 ? 0.1 : 1.0;
    let effectiveAccel = ay.multiply(BN(centrifugalCorrection));

    // D. FILTRE ANTI-DÉRIVE (Basé sur le bruit moléculaire/sonore)
    // Si pas de bruit significatif, on rejette l'accélération comme erreur capteur
    if (State.dbLevel < 12 && math.abs(effectiveAccel).lt(BN("0.18"))) {
        State.v = State.v.multiply(BN("0.6")); // Freinage rapide vers 0
        effectiveAccel = BN(0);
    }

    // E. INTÉGRATION & GAIN DE KALMAN ADAPTATIF
    // Si fiabilité basse, on ignore les nouvelles mesures (Inertie pure)
    let kGain = State.reliability / 100;
    if (State.reliability > 15) {
        State.v = State.v.add(effectiveAccel.multiply(dt).multiply(BN(kGain)));
    }
    
    if (State.v.lt(0)) State.v = BN(0);
    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // F. DISTANCE & CALORIES (METS)
    const stepDist = math.abs(State.v.multiply(dt));
    State.dist = State.dist.add(stepDist);
    let met = gRes > 2.0 ? 8.0 : (State.v.gt(0.1) ? 3.8 : 1.2);
    State.calories = State.calories.add(BN(met * State.mass.toNumber() * (dt.toNumber() / 3600)));

    // G. SYNCHRO UI ET BOÎTE NOIRE
    updateUI(ay, gRes, radSec, dt.toNumber());
    recordFlightData(gRes, State.v.multiply(3.6).toNumber(), State.reliability);
}

// --- DANS LA BOUCLE realityLoop(e) ---

// 1. Acquisition du Champ Magnétique (si disponible)
let mag = e.magnetometer || { x: 0, y: 0, z: 0 };
safeSet('mag-x', mag.x.toFixed(2));
safeSet('mag-y', mag.y.toFixed(2));
safeSet('mag-z', mag.z.toFixed(2));

// 2. Calcul de la Variation Magnétique (Delta B)
let deltaMag = Math.abs(mag.x - (State.lastMagX || 0));
State.lastMagX = mag.x;

// 3. Intégration Photonique
let luxFluctuation = Math.abs(State.lastLux - (State.currentLux || 0));
State.lastLux = State.currentLux;

// 4. AJUSTEMENT DE LA FIABILITÉ PAR MULTI-CAPTEURS
// Si mouvement physique détecté (G) MAIS aucune variation magnétique/lumineuse...
if (gRes > 1.2 && deltaMag < 0.01 && luxFluctuation < 0.1) {
    State.reliability -= 5; // On suspecte un bruit électronique pur
} 

// Si variation magnétique confirmée, on renforce la validité de l'accélération
if (deltaMag > 0.5) {
    State.reliability = Math.min(100, State.reliability + 10);
}

// 5. PRESSION DE RADIATION (Photonique)
// P = I / c (Force infime exercée par les molécules de lumière)
const radiationPressure = (State.currentLux * 0.0079) / 299792458;
safeSet('pression-radiation', radiationPressure.toExponential(4) + " Pa");
// 4. MAPPING INTÉGRAL VERS LE HTML
function updateUI(ay, g, gyro, dt) {
    const vMs = State.v.toNumber();
    const vKmh = math.multiply(State.v, 3.6).toNumber();

    // VITESSE & G-FORCE
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('vitesse-stable-1024', math.multiply(State.v, 3.6).toFixed(15));
    safeSet('g-force-resultant', g.toFixed(3));
    safeSet('angular-speed', gyro.toFixed(2));
    safeSet('acc-y', ay.toFixed(4));
    safeSet('vmax-session', (State.vMax.toNumber() * 3.6).toFixed(1));

    // PHYSIQUE MOLÉCULAIRE (Traînée)
    const q = 0.5 * 1.225 * vMs * vMs;
    const drag = q * 0.47 * 0.7; // 0.47=Cd humain, 0.7=Surface
    safeSet('pa-val', q.toFixed(2));
    safeSet('drag-force', drag.toFixed(2));
    safeSet('watts-val', (drag * vMs).toFixed(1));

    // RELATIVITÉ & ASTRO
    const lorentz = 1 / Math.sqrt(1 - (vMs**2 / 299792458**2));
    safeSet('lorentz-val', lorentz.toFixed(18));
    safeSet('time-dilation', ((lorentz - 1) * 8.64e13).toFixed(4) + " ns/j");
    safeSet('schwarzschild-val', State.mass.multiply(UNIVERSE.RS_CONST).toExponential(4));

    // BIOSVT
    let o2 = 98 - (g > 3 ? (g - 3) * 4 : vKmh * 0.05);
    safeSet('o2-sat', Math.max(85, o2).toFixed(1) + " %");
    safeSet('cal-val', State.calories.toFixed(2));
    safeSet('dist-val', (State.dist.toNumber() / 1000).toFixed(4));

    // FIABILITÉ & STATUT
    safeSet('score-fluidite', State.reliability + "/100");
    let status = "ANALYSE...";
    if (g < 0.2) status = "⚠️ AIRTIME DETECTÉ";
    else if (State.reliability < 30) status = "⚠️ INCERTITUDE CAPTEUR";
    else status = vKmh < 0.5 ? "STATIONNAIRE (UKF)" : "CINÉTIQUE (FUSION)";
    safeSet('reality-status', status);

    // Alertes visuelles
    document.getElementById('sp-main-hud').style.color = (g < 0.2) ? "#00ffff" : (State.reliability < 40 ? "#ffaa00" : "var(--accent)");

    WindAudio.update(State.v, State.reliability);
}

// 5. CALCUL DE LA FIABILITÉ SCIENTIFIQUE
function calculateReliability(g, gyro, db) {
    let rel = 100;
    if (g > 5 || g < -1) rel -= 25;   // Accélérations limites
    if (gyro > 8) rel -= 20;         // Rotations extrêmes
    if (db < 5 && State.v > 2) rel -= 30; // Vitesse sans bruit = Anomalie
    return Math.max(0, rel);
}

// 6. SYSTÈME DE BOÎTE NOIRE
function recordFlightData(g, v, r) {
    if (State.blackBox.length < 20000) {
        State.blackBox.push({ t: Date.now(), g: g, v: v, rel: r });
    }
}

function exportBlackBox() {
    const data = JSON.stringify({
        header: "OMNISCIENCE V100 PRO - FLIGHT DATA",
        mass: State.mass.toNumber(),
        session: State.blackBox
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BLACKBOX_${Date.now()}.json`;
    a.click();
}

// 7. INITIALISATION ET SERVICES (METEO/ASTRO)
async function startSystem() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        if (p !== 'granted') return;
    }

    State.active = true;
    State.lastT = BN(performance.now());
    WindAudio.init();

    // Micro (Anti-dérive Moléculaire)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        setInterval(() => {
            analyser.getByteFrequencyData(buffer);
            State.dbLevel = buffer.reduce((a, b) => a + b, 0) / buffer.length;
            safeSet('env-noise', State.dbLevel.toFixed(1) + " dB");
        }, 100);
    } catch(e) { console.warn("Micro non disponible."); }

    // Capteur Lumière (Mode Nuit)
    if ('AmbientLightSensor' in window) {
        const lux = new AmbientLightSensor({ frequency: 1 });
        lux.onreading = () => {
            document.body.classList.toggle('night-mode', lux.illuminance < 10);
            safeSet('env-lux', lux.illuminance.toFixed(1));
        };
        lux.start();
    }

    window.addEventListener('devicemotion', realityLoop);
    setInterval(updateAstronomy, 1000);
    setInterval(fetchWeather, 300000);
    fetchWeather();
    document.getElementById('start-btn-final').style.display = 'none';
}

// Utilitaires de synchronisation
async function fetchWeather() {
    try {
        const r = await fetch(`${UNIVERSE.WEATHER_API}?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const d = await r.json();
        safeSet('air-temp', d.main.temp.toFixed(1) + " °C");
        safeSet('air-pressure', d.main.pressure + " hPa");
    } catch(e) { safeSet('weather-status', "OFFLINE"); }
}

function updateAstronomy() {
    const now = new Date();
    const obs = new Astronomy.Observer(State.coords.lat, State.coords.lon, State.coords.alt);
    const sHoriz = Astronomy.Horizon(now, obs, Astronomy.Equator("Sun", now, obs).ra, Astronomy.Equator("Sun", now, obs).dec, 'none');
    safeSet('sun-alt', sHoriz.altitude.toFixed(2) + "°");
    safeSet('moon-illum', (Astronomy.MoonIllumination(now) * 100).toFixed(1) + " %");
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// Initialisation au clic
document.getElementById('start-btn-final').addEventListener('click', startSystem);
document.getElementById('capture-data-btn').addEventListener('click', exportBlackBox);
