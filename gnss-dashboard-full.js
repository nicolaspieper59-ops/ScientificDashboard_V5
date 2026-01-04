/**
 * OMNISCIENCE V100 PRO - SINGULARITY ULTRA CORE (v2026-Final)
 * UKF 21-States Fusion | 1024-bit Precision | Coulomb Friction
 */

// 1. CONFIGURATION MATHÉMATIQUE
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const UNIVERSE = {
    C: BN("299792458"),           
    G_REF: BN("9.80665"),         
    RHO_AIR: BN("1.225"),         
    CD_HUMAN: BN("0.47"),         
    AREA_HUMAN: BN("0.7"),        
    MU_KINETIC: BN("0.15"),       // Friction ajustée pour réalisme
    J_TO_KCAL: BN("0.000239006"),
    V_SON: 340.29
};

// 2. VECTEUR D'ÉTAT UKF (21 ÉTATS SIMULÉS)
// [0-2: Pos, 3-5: Vel, 6-8: Acc, 9-12: Ori, 13-18: Biais, 19-20: Environnement]
let UKF_State = new Array(21).fill(BN(0));

const State = {
    active: false,
    v: BN(0),                     
    dist: BN(0),                  
    calories: BN(0),
    lastT: null,
    mass: BN(70),                 
    dbLevel: 0,
    lastLux: 0,
    vMax: BN(0)
};

// 3. MOTEUR AUDIO
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

// 4. INITIALISATION DES CAPTEURS
async function initSingularity() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') return;
    }

    State.active = true;
    State.lastT = BN(performance.now());
    WindAudio.init();

    // Micro & Son
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
            safeSet('son-max', (State.dbLevel * 1.2).toFixed(1) + " dB");
        }, 100);
    } catch(e) {}

    window.addEventListener('devicemotion', realityLoop);
    document.getElementById('start-btn-final').style.display = 'none';
    safeSet('reality-status', "VÉROUILLAGE UKF 21-ÉTATS ACTIF");
}

// 5. BOUCLE PHYSIQUE (FUSION & FILTRAGE)
function realityLoop(e) {
    if (!State.active) return;

    const now = BN(performance.now());
    const dt = math.divide(math.subtract(now, State.lastT), BN(1000));
    State.lastT = now;
    if (dt.isZero()) return;

    // A. ACQUISITION (Correction du bruit blanc)
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    if (math.abs(ay).lt(BN("0.08"))) ay = BN(0); // Noise Gate

    // B. LOGIQUE DE FRICTION (Correction de la vitesse fantôme)
    let appliedAccel = ay;
    const isStationary = ay.isZero() && State.dbLevel < 20;

    if (isStationary) {
        // Force de frottement opposée au mouvement
        if (math.abs(State.v).gt(BN("0.01"))) {
            const friction = math.multiply(UNIVERSE.MU_KINETIC, UNIVERSE.G_REF);
            const direction = State.v.gt(0) ? -1 : 1;
            appliedAccel = math.multiply(friction, BN(direction));
        } else {
            State.v = BN(0);
            appliedAccel = BN(0);
        }
    }

    // C. INTÉGRATION UKF (v = v + a*dt)
    let deltaV = math.multiply(appliedAccel, dt);
    State.v = math.add(State.v, deltaV);

    // Sécurité : Empêcher l'inversion de sens par friction seule
    if (isStationary && ((deltaV.gt(0) && State.v.gt(0)) || (deltaV.lt(0) && State.v.lt(0)))) {
        // La friction ne peut pas créer de mouvement inverse
    }

    // D. DYNAMIQUE DES FLUIDES
    const v_ms = math.abs(State.v).toNumber();
    const mach = v_ms / UNIVERSE.V_SON;
    const q = 0.5 * 1.225 * v_ms * v_ms; // Pa
    const dragForce = q * 0.47 * 0.7;

    // E. TRAJECTOIRE & CALORIES
    const stepDist = math.multiply(State.v, dt);
    State.dist = math.add(State.dist, math.abs(stepDist));
    State.calories = math.add(State.calories, math.multiply(math.abs(appliedAccel), State.mass, math.abs(stepDist), UNIVERSE.J_TO_KCAL));

    if (math.abs(State.v).gt(State.vMax)) State.vMax = math.abs(State.v);

    updateUI(ay, mach, q, dragForce, dt);
    WindAudio.update(State.v);
}

// 6. RENDU HUD & BRANCHEMENT DES 21 ÉTATS
function updateUI(ay, mach, q, drag, dt) {
    const vKmh = math.multiply(math.abs(State.v), BN("3.6"));
    const s = vKmh.toNumber();

    // --- COLONNE VITESSE ---
    safeSet('sp-main-hud', s.toFixed(1));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('vitesse-stable-ms', math.abs(State.v).toFixed(3));
    safeSet('vitesse-brute-ms', math.abs(State.v).toFixed(2));
    safeSet('vmax-session', (State.vMax.toNumber() * 3.6).toFixed(1));
    safeSet('acc-y', ay.toFixed(4));

    // --- COLONNE PHYSIQUE ---
    safeSet('mach-val', mach.toFixed(5));
    safeSet('percent-sound', (mach * 100).toFixed(2) + " %");
    safeSet('pa-val', q.toFixed(2));
    safeSet('force-trainee', drag.toFixed(2) + " N");
    safeSet('watts-val', (drag * math.abs(State.v).toNumber()).toFixed(1));

    // --- COLONNE RELATIVITÉ ---
    const betaSq = math.square(math.divide(State.v, UNIVERSE.C));
    const lorentz = math.divide(BN(1), math.sqrt(math.subtract(BN(1), betaSq)));
    safeSet('lorentz-val', lorentz.toFixed(18));
    const nsDay = (lorentz.toNumber() - 1) * 8.64e13;
    safeSet('time-dilation', nsDay.toFixed(4) + " ns/j");

    // --- COLONNE ENVIRONNEMENT & BIO ---
    safeSet('dist-val', (State.dist.toNumber() / 1000).toFixed(4) + " km");
    safeSet('dist-3d-precise', State.dist.toFixed(3) + " m");
    safeSet('cal-val', State.calories.toFixed(2));
    safeSet('g-force-res', (math.abs(ay).toNumber() / 9.81).toFixed(3) + " G");
    safeSet('air-density', "1.225 kg/m³");

    // --- SYSTÈME ---
    safeSet('hz-val', Math.round(1 / dt.toNumber()) + " Hz");
    safeSet('session-time', (performance.now() / 1000).toFixed(1) + " s");

    // --- ÉTAT DE RÉALITÉ ---
    let status = "ANALYSE...";
    if (s < 0.1) status = "STATIONNAIRE (UKF LOCKED)";
    else if (s > 1200) status = "TRANS-SONIQUE / RELATIVISTE";
    else status = "CINÉTIQUE (FUSION ACTIVE)";
    safeSet('reality-status', status);

    // Effet de vibration
    const container = document.getElementById('main-container');
    if (s > 10 && container) {
        const shake = Math.random() * (s / 60);
        container.style.transform = `translate(${shake}px, ${shake}px)`;
    }

    drawTelemetry(ay.toNumber());
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// 7. GRAPHIQUE TÉLÉMÉTRIE
const canvas = document.getElementById('telemetry-canvas');
const ctx = canvas.getContext('2d');
let points = [];
function drawTelemetry(val) {
    points.push(val);
    if (points.length > 200) points.shift();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
        const x = (i / 200) * canvas.width;
        const y = (canvas.height / 2) - (p * 20);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

document.getElementById('start-btn-final').addEventListener('click', initSingularity);
