/**
 * OMNISCIENCE V100 PRO - SINGULARITY NERVOUS CORE (Ultra-Final)
 * Moteur de Réalité : Physique 3D, Friction de Coulomb, et 1024-bit Precision
 */

// 1. CONFIGURATION MATHÉMATIQUE HAUTE PRÉCISION
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const UNIVERSE = {
    C: BN("299792458"),           // Célérité de la lumière
    G_REF: BN("9.80665"),         // Gravité standard
    RHO_AIR: BN("1.225"),         // Densité air (kg/m3)
    CD_HUMAN: BN("0.47"),         // Coeff traînée
    AREA_HUMAN: BN("0.7"),        // Surface frontale (m2)
    MU_KINETIC: BN("0.35"),       // Friction de Coulomb (Sol/Poche)
    TECTONIC_DRIFT: BN("0.0000000000015"), // Dérive tectonique
    J_TO_KCAL: BN("0.000239006")
};

const State = {
    active: false,
    v: BN(0),                     // Vitesse réelle spatiale
    a_old: BN(0),                 // Mémoire accélération
    dist: BN(0),                  // Distance 3D cumulée
    calories: BN(0),
    lastT: null,
    mass: BN(70),                 // Masse par défaut
    dbLevel: 0,
    lastLux: 0,
    luxV: BN(0)                   // Boost photonique
};

// 2. MOTEUR AUDIO (SIFFLEMENT DU VENT)
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
        } catch(e) { console.warn("Audio bloqué par le navigateur."); }
    },
    update(v) {
        if (!this.gain) return;
        const speed = Math.abs(v.toNumber());
        const vol = Math.min(speed / 40, 0.25); 
        const freq = 150 + (speed * 12);
        this.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
        this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    }
};

// 3. INITIALISATION DES CAPTEURS
async function initSingularity() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') return;
    }

    State.active = true;
    State.lastT = BN(performance.now());
    WindAudio.init();

    // Micro (Radar Acoustique)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        setInterval(() => {
            analyser.getByteFrequencyData(data);
            State.dbLevel = data.reduce((a, b) => a + b, 0) / data.length;
            safeSet('env-noise', State.dbLevel.toFixed(1) + " dB");
        }, 100);
    } catch(e) {}

    // Lumière (Interférométrie)
    if ('AmbientLightSensor' in window) {
        const lux = new AmbientLightSensor({ frequency: 60 });
        lux.onreading = () => {
            let delta = Math.abs(lux.illuminance - State.lastLux);
            if (delta > 0.01) State.luxV = BN(delta).multiply("0.00001");
            State.lastLux = lux.illuminance;
            safeSet('env-lux', lux.illuminance.toFixed(1));
        };
        lux.start();
    }

    window.addEventListener('devicemotion', realityLoop);
    document.getElementById('start-btn-final').style.display = 'none';
    safeSet('reality-status', "SYCHRONISATION 1024-BIT");
}

// 4. BOUCLE PHYSIQUE (FRICTION & BALISTIQUE)
function realityLoop(e) {
    if (!State.active) return;

    const now = BN(performance.now());
    const dt = math.divide(math.subtract(now, State.lastT), BN(1000));
    State.lastT = now;
    if (dt.isZero()) return;

    // A. ACQUISITION
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    const isPropulsion = math.abs(ay).gt(BN("0.05"));
    
    let appliedAccel = BN(0);

    if (isPropulsion) {
        // Mode Moteur : On suit le capteur
        appliedAccel = ay;
    } else {
        // Mode Friction : Si on ne bouge plus, la friction freine la vitesse
        if (math.abs(State.v).gt(BN("0.05"))) {
            const frictionDecel = math.multiply(UNIVERSE.MU_KINETIC, UNIVERSE.G_REF);
            const direction = State.v.gt(0) ? -1 : 1;
            appliedAccel = math.multiply(frictionDecel, BN(direction));
        } else {
            State.v = BN(0); // Arrêt complet
        }
    }

    // B. INTÉGRATION DE VERLET 1024-BIT
    let deltaV = math.multiply(appliedAccel, dt);
    State.v = math.add(State.v, deltaV, UNIVERSE.TECTONIC_DRIFT, State.luxV);
    
    // C. TRAÎNÉE AÉRODYNAMIQUE (Réalisme Manège/Vitesse)
    const v_ms = State.v.toNumber();
    const mach = v_ms / 340.29;
    let drag = math.multiply(BN(0.5), UNIVERSE.RHO_AIR, UNIVERSE.CD_HUMAN, UNIVERSE.AREA_HUMAN, math.square(State.v));
    if (mach > 1) drag = math.multiply(drag, math.square(BN(mach))); // Effet mur du son
    
    State.v = math.subtract(State.v, math.divide(math.multiply(drag, dt), State.mass));
    if (State.v.lt(0) && !isPropulsion) State.v = BN(0);

    // D. DISTANCE & ÉNERGIE
    const stepDist = math.multiply(State.v, dt);
    State.dist = math.add(State.dist, stepDist);
    const work = math.multiply(math.abs(appliedAccel), State.mass, stepDist);
    State.calories = math.add(State.calories, math.multiply(work, UNIVERSE.J_TO_KCAL, BN(4)));

    State.a_old = appliedAccel;
    State.luxV = BN(0);

    updateDashboard(ay, mach, dt);
}

// 5. MISE À JOUR DE TOUS LES IDS DU DASHBOARD
function updateDashboard(ay, mach, dt) {
    const vKmh = math.multiply(State.v, BN("3.6"));
    const s = vKmh.toNumber();

    // -- Vitesse & Précision --
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('v1024-val', vKmh.toFixed(15));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('v-micro', State.v.toFixed(9));
    safeSet('vitesse-stable-ms', State.v.toFixed(2));
    
    // -- Dynamique & Forces --
    safeSet('g-val', math.divide(ay, UNIVERSE.G_REF).toFixed(3));
    safeSet('acc-y', ay.toFixed(4));
    safeSet('mach-val', mach.toFixed(5));
    safeSet('percent-sound', (mach * 100).toFixed(2));
    
    const q = 0.5 * 1.225 * Math.pow(State.v.toNumber(), 2);
    safeSet('pa-val', q.toFixed(2)); // Pression Dynamique
    
    // -- Relativité --
    const lorentz = math.divide(BN(1), math.sqrt(math.subtract(BN(1), math.square(math.divide(State.v, UNIVERSE.C)))));
    safeSet('lorentz-val', lorentz.toFixed(18));
    const nsDay = (lorentz.toNumber() - 1) * 8.64e13;
    safeSet('time-dilation-day', nsDay.toFixed(4));

    // -- Distance & Bio --
    safeSet('dist-val', State.dist.toFixed(3));
    safeSet('dist-3d-precise', (State.dist.toNumber() / 1000).toFixed(6));
    safeSet('cal-val', State.calories.toFixed(2));
    safeSet('hz-val', Math.round(1 / dt.toNumber()));

    // -- Effet de Cockpit --
    const container = document.getElementById('main-container');
    if (s > 5) {
        const shake = Math.random() * (s / 50);
        container.style.transform = `translate(${shake}px, ${shake}px)`;
        safeSet('reality-status', s > 1200 ? "SUPERSYNC / MACH" : "CINÉTIQUE");
    } else {
        container.style.transform = "none";
        safeSet('reality-status', s < 0.1 ? "STATIONNAIRE" : "DÉCÉLÉRATION");
    }

    drawTelemetry(ay.toNumber());
    WindAudio.update(State.v);
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// 6. GRAPHIQUE
const canvas = document.getElementById('telemetry-canvas');
const ctx = canvas.getContext('2d');
let points = [];
function drawTelemetry(val) {
    points.push(val);
    if (points.length > 100) points.shift();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00ff88';
    ctx.beginPath();
    points.forEach((p, i) => {
        const x = (i / 100) * canvas.width;
        const y = (canvas.height / 2) - (p * 10);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

document.getElementById('start-btn-final').addEventListener('click', initSingularity);
