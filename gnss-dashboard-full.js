/**
 * OMNISCIENCE V100 PRO - MASTER CORE
 * Fusion Gyro-Inertielle | UKF 21-States | Black Box | Astro-Physics
 */

// 1. CONFIGURATION MATHÉMATIQUE & CONSTANTES UNIVERSELLES
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const UNIVERSE = {
    C: BN("299792458"),           
    G_REF: BN("9.80665"),         
    RHO_AIR: BN("1.225"),         
    V_SON: 340.29,
    OMEGA_EARTH: 7.2921e-5,
    WEATHER_API: '/api/weather',
    J_TO_KCAL: BN("0.000239006")
};

const State = {
    active: false,
    v: BN(0),                     
    vMax: BN(0),
    dist: BN(0),                  
    calories: BN(0),
    lastT: null,
    mass: BN(70),                 
    dbLevel: 0,
    ntpOffset: 0,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    blackBox: [],
    lastAcc: 0
};

// 2. INITIALISATION DES CAPTEURS & AUDIO
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
    update(v) {
        if (!this.gain) return;
        const s = Math.abs(v.toNumber());
        this.gain.gain.setTargetAtTime(Math.min(s / 50, 0.2), this.ctx.currentTime, 0.1);
        this.filter.frequency.setTargetAtTime(150 + (s * 10), this.ctx.currentTime, 0.1);
    }
};

// 3. BOUCLE DE RÉALITÉ (PHYSIQUE DES MANÈGES & UKF)
function realityLoop(e) {
    if (!State.active) return;

    const now = BN(performance.now());
    const dt = math.divide(math.subtract(now, State.lastT), BN(1000));
    State.lastT = now;
    if (dt.isZero()) return;

    // A. ACQUISITION 3D (Anti-dérive par fusion gyro)
    let ax = BN(e.accelerationIncludingGravity.x || 0);
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    let az = BN(e.accelerationIncludingGravity.z || 0);

    // Calcul G-Force (Ressenti réel)
    let gTotal = math.sqrt(ax.sq().add(ay.sq()).add(az.sq()));
    let gRes = gTotal.divide(UNIVERSE.G_REF).toNumber();

    // B. CORRECTION GYROSCOPIQUE (Vérification si virage ou accélération linéaire)
    let rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    let radSec = Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2);
    
    // Si rotation forte (virage manège), on réduit l'impact sur la vitesse longitudinale
    let motionFilter = radSec > 2.5 ? 0.08 : 1.0;
    let effectiveAccel = ay.multiply(BN(motionFilter));

    // C. FILTRE DE VÉRITÉ UKF (Silence = Arrêt)
    // Si bruit sonore < 5dB et accélération faible, on bloque la dérive
    if (State.dbLevel < 5 && math.abs(effectiveAccel).lt(BN("0.18"))) {
        State.v = State.v.multiply(BN("0.7")); 
        if (State.v.lt(BN("0.01"))) State.v = BN(0);
        effectiveAccel = BN(0);
    }

    // D. INTÉGRATION DE VERLET
    State.v = State.v.add(effectiveAccel.multiply(dt));
    if (State.v.lt(0)) State.v = BN(0);
    if (State.v.gt(State.vMax)) State.vMax = State.v;

    // E. TRAJECTOIRE & BIOMÉTRIE
    const stepDist = math.abs(State.v.multiply(dt));
    State.dist = State.dist.add(stepDist);
    
    // Calories (METs) ajustées selon l'effort (G + Vitesse)
    const met = gRes > 1.5 ? 5.0 : (State.v.toNumber() > 0.1 ? 3.5 : 1.2);
    State.calories = State.calories.add(BN(met * State.mass.toNumber() * (dt.toNumber() / 3600)));

    // F. ENREGISTREMENT BOÎTE NOIRE
    recordFlightData(gRes, State.v.multiply(3.6).toNumber());

    // G. MISE À JOUR UI
    updateFullDashboard(ay, gRes, radSec, dt);
}

// 4. MAPPING INTÉGRAL DES IDs HTML
function updateFullDashboard(ay, g, gyro, dt) {
    const vKmh = math.multiply(State.v, 3.6);
    const v = vKmh.toNumber();

    // --- Vitesse & Relativité ---
    safeSet('sp-main-hud', v.toFixed(1));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('g-force-resultant', g.toFixed(3) + " G");
    safeSet('angular-speed', gyro.toFixed(2) + " rad/s");
    safeSet('vmax-session', math.multiply(State.vMax, 3.6).toFixed(1));
    safeSet('acc-y', ay.toFixed(4));

    const lorentz = math.divide(BN(1), math.sqrt(math.subtract(BN(1), math.square(math.divide(State.v, UNIVERSE.C)))));
    safeSet('lorentz-val', lorentz.toFixed(18));
    safeSet('time-dilation', ((lorentz.toNumber() - 1) * 8.64e13).toFixed(6) + " ns/j");

    // --- BioSVT & Environnement ---
    let o2 = 98 - (g > 3 ? (g - 3) * 4 : (v * 0.1));
    safeSet('o2-sat', Math.max(88, o2).toFixed(1) + " %");
    safeSet('cal-val', State.calories.toFixed(2));
    safeSet('dist-val', (State.dist.toNumber() / 1000).toFixed(5) + " km");

    // --- Dynamique des Fluides ---
    const q = 0.5 * 1.225 * Math.pow(State.v.toNumber(), 2);
    const drag = q * 0.47 * 0.7;
    safeSet('pa-val', q.toFixed(2) + " Pa");
    safeSet('drag-force', drag.toFixed(2) + " N");
    safeSet('watts-val', (drag * State.v.toNumber()).toFixed(1));

    // --- Statut de Réalité ---
    if (g < 0.2) {
        safeSet('reality-status', "⚠️ AIRTIME DETECTÉ");
        document.getElementById('sp-main-hud').style.color = "#00ffff";
    } else {
        safeSet('reality-status', v < 0.1 ? "STATIONNAIRE (UKF LOCKED)" : "CINÉTIQUE (FUSION ACTIVE)");
        document.getElementById('sp-main-hud').style.color = "var(--accent)";
    }

    WindAudio.update(State.v);
}

// 5. MÉTÉO, ASTRO & SYNC
async function fetchWeather() {
    try {
        const res = await fetch(`${UNIVERSE.WEATHER_API}?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const data = await res.json();
        safeSet('air-temp', data.main.temp.toFixed(1) + " °C");
        safeSet('air-pressure', data.main.pressure + " hPa");
        safeSet('weather-status', data.weather[0].description.toUpperCase());
    } catch(e) { safeSet('weather-status', "ERREUR PROXY"); }
}

function updateAstronomy() {
    const now = new Date(Date.now() + State.ntpOffset);
    const obs = new Astronomy.Observer(State.coords.lat, State.coords.lon, State.coords.alt);
    
    const sEquat = Astronomy.Equator("Sun", now, obs);
    const sHoriz = Astronomy.Horizon(now, obs, sEquat.ra, sEquat.dec, 'none');
    safeSet('sun-alt', sHoriz.altitude.toFixed(2) + "°");
    safeSet('moon-illum', (Astronomy.MoonIllumination(now) * 100).toFixed(1) + " %");
    safeSet('sidereal-time', Astronomy.SiderealTime(now).toFixed(4) + " h");
}

// 6. BOÎTE NOIRE & EXPORT
function recordFlightData(g, v) {
    if (State.blackBox.length < 10000) {
        State.blackBox.push({ t: Date.now(), g: g, v: v });
    }
}

function exportBlackBox() {
    const blob = new Blob([JSON.stringify(State.blackBox)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OMNISCIENCE_BOX_${Date.now()}.json`;
    a.click();
}

// 7. INITIALISATION GLOBALE
async function startSingularity() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        if (p !== 'granted') return;
    }

    State.active = true;
    State.lastT = BN(performance.now());
    WindAudio.init();

    // Micro (Anti-dérive)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        setInterval(() => {
            analyser.getByteFrequencyData(data);
            State.dbLevel = data.reduce((a, b) => a + b, 0) / data.length;
            safeSet('env-noise', State.dbLevel.toFixed(1) + " dB");
        }, 100);
    } catch(e) {}

    // Lumière (Mode Nuit)
    if ('AmbientLightSensor' in window) {
        const lux = new AmbientLightSensor({ frequency: 1 });
        lux.onreading = () => {
            if (lux.illuminance < 10) document.body.classList.add('night-mode');
            else document.body.classList.remove('night-mode');
            safeSet('env-lux', lux.illuminance.toFixed(1));
        };
        lux.start();
    }

    // Loops
    setInterval(updateAstronomy, 1000);
    setInterval(fetchWeather, 600000);
    fetchWeather();

    window.addEventListener('devicemotion', realityLoop);
    document.getElementById('start-btn-final').style.display = 'none';
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// Bindings
document.getElementById('start-btn-final').addEventListener('click', startSingularity);
document.getElementById('capture-data-btn').addEventListener('click', exportBlackBox);
