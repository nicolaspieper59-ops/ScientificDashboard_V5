/**
 * OMNISCIENCE V100 PRO - SINGULARITY NERVOUS CORE (v1024-Ultra-Final)
 * Moteur de Réalité : Physique Inertielle, Acoustique & Haute Précision
 */

// 1. CONFIGURATION MATHÉMATIQUE 1024-BIT
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const UNIVERSE = {
    C: BN("299792458"),           // Célérité de la lumière
    G_REF: BN("9.80665"),         // Gravité standard
    RHO_AIR: BN("1.225"),         // Densité air (kg/m3)
    CD_HUMAN: BN("0.47"),         // Traînée
    AREA_HUMAN: BN("0.7"),        // Surface frontale (m2)
    TECTONIC_DRIFT: BN("0.0000000000015"), // Dérive tectonique (m/s)
    J_TO_KCAL: BN("0.000239006")
};

const State = {
    active: false,
    v: BN(0),                     // Vitesse réelle (m/s)
    v_old: BN(0),                 // Pour Verlet
    a_old: BN(0),                 // Pour Verlet
    dist: BN(0),                  // Distance cumulée (m)
    calories: BN(0),              // Énergie (kcal)
    lastT: null,
    mass: BN(70),                 // Valeur par défaut
    dbLevel: 0,
    isNight: false,
    kalman: { q: 0.001, r: 0.04, p: 1.0, x: 0.0 } // Filtre de lissage nerveux
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
        } catch(e) { console.error("Audio bloqué"); }
    },
    update(v) {
        if (!this.gain) return;
        const speed = Math.abs(v.toNumber());
        const volume = Math.min(speed / 40, 0.2); 
        const freq = 150 + (speed * 12);
        this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
        this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    }
};

// 3. INITIALISATION DU SYSTÈME
async function initSingularity() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') return;
    }

    State.active = true;
    State.lastT = BN(performance.now());
    
    // Démarrage Audio
    WindAudio.init();

    // Démarrage Microphone (Pression Acoustique)
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
        }, 100);
    } catch(e) {}

    window.addEventListener('devicemotion', realityLoop);
    document.getElementById('start-btn-final').style.display = 'none';
    document.getElementById('reality-status').innerText = "VÉROUILLAGE 1024-BIT ACTIF";
}

// 4. BOUCLE PHYSIQUE (MÉTHODE DE VERLET)
function realityLoop(e) {
    if (!State.active) return;

    const now = BN(performance.now());
    const dt = math.divide(math.subtract(now, State.lastT), BN(1000));
    State.lastT = now;
    if (dt.isZero()) return;

    // A. ACQUISITION NERVEUSE
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    if (math.abs(ay).lt(BN("0.02"))) ay = BN(0); // Noise Gate ultra-sensible

    // B. INTÉGRATION DE VERLET (Réalisme de l'inertie)
    // On calcule la vitesse en fonction de la moyenne de l'accélération
    let a_avg = math.divide(math.add(ay, State.a_old), 2);
    let deltaV = math.multiply(a_avg, dt);
    
    // C. DYNAMIQUE DES FLUIDES & DÉRIVE
    // Ajout de la dérive tectonique + impact du vent acoustique sur la traînée
    const windFactor = math.divide(BN(State.dbLevel), BN(100));
    const drag = math.multiply(BN(0.5), math.add(UNIVERSE.RHO_AIR, windFactor), UNIVERSE.CD_HUMAN, UNIVERSE.AREA_HUMAN, math.square(State.v));
    const deccelDrag = math.divide(drag, State.mass);

    State.v = math.add(State.v, deltaV, UNIVERSE.TECTONIC_DRIFT);
    if (State.v.gt(0)) State.v = math.subtract(State.v, math.multiply(deccelDrag, dt));
    if (State.v.lt(0)) State.v = BN(0);

    State.a_old = ay;

    // D. CALCUL V-MAX THÉORIQUE (400W de puissance humaine)
    const vMaxTheo = math.cbrt(math.divide(math.multiply(BN(2), BN(400)), math.multiply(UNIVERSE.RHO_AIR, UNIVERSE.CD_HUMAN, BN(0.7))));

    // E. DISTANCE & CALORIES (Travail Mécanique)
    const stepDist = math.multiply(State.v, dt);
    State.dist = math.add(State.dist, stepDist);
    const work = math.multiply(math.abs(ay), State.mass, stepDist);
    State.calories = math.add(State.calories, math.multiply(work, UNIVERSE.J_TO_KCAL, BN(4)));

    // F. RELATIVITÉ
    const lorentz = math.divide(BN(1), math.sqrt(math.subtract(BN(1), math.square(math.divide(State.v, UNIVERSE.C)))));

    updateUI(ay, lorentz, vMaxTheo, dt);
    WindAudio.update(State.v);
}

// 5. RENDU ET EFFETS DE COCKPIT
function updateUI(ay, lorentz, vMax, dt) {
    const vKmh = math.multiply(State.v, BN("3.6"));
    const speedNum = vKmh.toNumber();

    // HUD ET VITESSE (NERVOSITÉ MAX)
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('v1024-val', vKmh.toFixed(15));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));

    // DYNAMIQUE
    safeSet('dist-val', State.dist.toFixed(4) + " m");
    safeSet('g-val', math.divide(ay, UNIVERSE.G_REF).toFixed(3));
    safeSet('acc-y', ay.toFixed(4));
    safeSet('vmax-theo', math.multiply(vMax, BN(3.6)).toFixed(1) + " km/h");

    // SYSTÈME ET BIO
    safeSet('cal-val', State.calories.toFixed(2));
    safeSet('hz-val', math.round(math.divide(BN(1), dt)).toString());
    safeSet('lorentz-val', lorentz.toFixed(18));

    // EFFET DE VIBRATION (STRESS G-FORCE)
    if (speedNum > 10) {
        const shake = Math.random() * (speedNum / 50);
        document.getElementById('main-container').style.transform = `translate(${shake}px, ${shake}px)`;
    }

    // IMPACT FLASH (Si G > 4)
    if (math.abs(ay).gt(math.multiply(UNIVERSE.G_REF, 4))) {
        document.body.style.backgroundColor = "#fff";
        setTimeout(() => document.body.style.backgroundColor = "", 50);
    }

    drawTelemetry(ay.toNumber());
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// 6. GRAPHIQUE BRUT (TÉLÉMÉTRIE)
const canvas = document.getElementById('telemetry-canvas');
const ctx = canvas.getContext('2d');
let points = [];

function drawTelemetry(val) {
    points.push(val);
    if (points.length > 200) points.shift();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = document.body.classList.contains('night-mode') ? '#ff0000' : '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
        const x = (i / 200) * canvas.width;
        const y = (canvas.height / 2) - (p * 20);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

// 7. LISTENERS
document.getElementById('start-btn-final').addEventListener('click', initSingularity);

// Mode Grotte via API Light
if ('AmbientLightSensor' in window) {
    const sensor = new AmbientLightSensor();
    sensor.onreading = () => {
        const isDark = sensor.illuminance < 5;
        document.body.classList.toggle('night-mode', isDark);
        safeSet('cave-status', isDark ? "ACTIF (OBSCURITÉ)" : "AUTO");
    };
    sensor.start();
        }
