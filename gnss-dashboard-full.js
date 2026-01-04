/**
 * OMNISCIENCE V100 PRO - SINGULARITY ULTRA CORE (Final Master)
 * Moteur de Réalité : Physique 3D, Acoustique, Photonique & Relativité
 */

// 1. CONFIGURATION HAUTE PRÉCISION
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const UNIVERSE = {
    C: BN("299792458"),           // Célérité de la lumière (m/s)
    G_REF: BN("9.80665"),         // Gravité standard (m/s²)
    RHO_AIR: BN("1.225"),         // Densité air (kg/m³)
    CD_HUMAN: BN("0.47"),         // Coeff traînée
    AREA_HUMAN: BN("0.7"),        // Surface frontale (m²)
    TECTONIC_DRIFT: BN("0.0000000000015"), // Dérive (m/s)
    J_TO_KCAL: BN("0.000239006"),
    EARTH_G: BN("6.67430e-11")    // Constante gravitationnelle
};

const State = {
    active: false,
    v: BN(0),                     // Vitesse scalaire 3D (m/s)
    v_old: BN(0), 
    a_old: BN(0),                 // Pour Verlet
    dist: BN(0),                  // Distance cumulée (m)
    calories: BN(0), 
    lastT: null,
    mass: BN(70),                 // Masse dynamique
    dbLevel: 0,
    luxV: BN(0),                  // Correction photonique
    lastLux: 0
};

// 2. MOTEUR ACOUSTIQUE (VENT & FRICTION)
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
        } catch(e) { console.warn("Audio Context bloqué."); }
    },
    update(v) {
        if (!this.gain) return;
        const s = Math.abs(v.toNumber());
        const vol = Math.min(s / 40, 0.25); 
        const f = 150 + (s * 15);
        this.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
        this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1);
    }
};

// 3. INITIALISATION & CAPTEURS EXOTIQUES
async function initSingularity() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') return;
    }

    State.active = true;
    State.lastT = BN(performance.now());
    WindAudio.init();

    // A. Microphone (Radar Acoustique)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const aCtx = new AudioContext();
        const analyser = aCtx.createAnalyser();
        const source = aCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        setInterval(() => {
            analyser.getByteFrequencyData(data);
            State.dbLevel = data.reduce((a, b) => a + b, 0) / data.length;
            safeSet('env-noise', State.dbLevel.toFixed(1) + " dB");
        }, 100);
    } catch(e) { console.error("Microphone indisponible"); }

    // B. Lumière (Interférométrie Virtuelle)
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
    safeSet('reality-status', "VÉROUILLAGE 1024-BIT ACTIF");
}

// 4. BOUCLE PHYSIQUE PRINCIPALE (VERLET 3D)
function realityLoop(e) {
    if (!State.active) return;

    const now = BN(performance.now());
    const dt = math.divide(math.subtract(now, State.lastT), BN(1000));
    State.lastT = now;
    if (dt.isZero()) return;

    // A. Acquisition Inertielle (Sensibilité Millimétrique)
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    if (math.abs(ay).lt(BN("0.005"))) ay = BN(0); // Seuil micro-vibration

    // B. Intégration de Verlet (Mémoire du mouvement)
    let a_avg = math.divide(math.add(ay, State.a_old), 2);
    let deltaV = math.multiply(a_avg, dt);

    // C. Fusion Multimodale (Inertie + Tectonique + Photonique)
    State.v = math.add(State.v, deltaV, UNIVERSE.TECTONIC_DRIFT, State.luxV);

    // D. Balistique & Résistance Supersonique
    let v_ms = State.v.toNumber();
    let mach = v_ms / 340.29;
    
    // Traînée dynamique (Air + Vent acoustique)
    const windEffect = math.divide(BN(State.dbLevel), BN(100));
    let drag = math.multiply(BN(0.5), math.add(UNIVERSE.RHO_AIR, windEffect), UNIVERSE.CD_HUMAN, UNIVERSE.AREA_HUMAN, math.square(State.v));
    
    if (mach > 1) drag = math.multiply(drag, math.square(BN(mach))); // Mur du son

    State.v = math.subtract(State.v, math.divide(math.multiply(drag, dt), State.mass));
    if (State.v.lt(0)) State.v = BN(0);

    // E. Distance & Énergie (Travail)
    const stepDist = math.multiply(State.v, dt);
    State.dist = math.add(State.dist, stepDist);
    const workJ = math.multiply(math.abs(ay), State.mass, stepDist);
    State.calories = math.add(State.calories, math.multiply(workJ, UNIVERSE.J_TO_KCAL, BN(4)));

    State.a_old = ay;
    State.luxV = BN(0); // Reset flash photonique

    updateUI(ay, mach, dt);
}

// 5. RENDU ET SYNCHRONISATION DOM (Tous les IDs)
function updateUI(ay, mach, dt) {
    const vKmh = math.multiply(State.v, BN("3.6"));
    const sKmhNum = vKmh.toNumber();

    // COL 2 : DYNAMIQUE (HUD Central)
    safeSet('sp-main-hud', vKmh.toFixed(1));
    safeSet('v1024-val', vKmh.toFixed(8));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('v-micro', State.v.toFixed(9));
    safeSet('dist-val', State.dist.toFixed(3) + " m");
    safeSet('dist-3d-precise', State.dist.toFixed(3) + " m");
    safeSet('acc-y', ay.toFixed(4));

    // COL 3 : ÉNERGIE & BALISTIQUE
    safeSet('g-val', math.divide(ay, UNIVERSE.G_REF).toFixed(3) + " G");
    safeSet('cal-val', State.calories.toFixed(2));
    safeSet('calories-burn', State.calories.toFixed(2));
    safeSet('mach-val', mach.toFixed(4));
    
    // Pression Dynamique (q = 1/2 * rho * v²)
    const dynPress = math.multiply(BN(0.5), UNIVERSE.RHO_AIR, math.square(State.v));
    safeSet('pa-val', dynPress.toFixed(2));

    // V-Max Théorique (basé sur 400W de puissance humaine)
    const vMax = math.cbrt(math.divide(BN(800), math.multiply(UNIVERSE.RHO_AIR, UNIVERSE.CD_HUMAN, BN(0.7))));
    safeSet('vmax-theo', math.multiply(vMax, BN(3.6)).toFixed(1) + " km/h");

    // COL 4 : ASTRO & RELATIVITÉ
    const betaSq = math.square(math.divide(State.v, UNIVERSE.C));
    const lorentz = math.divide(BN(1), math.sqrt(math.subtract(BN(1), betaSq)));
    safeSet('lorentz-val', lorentz.toFixed(18));
    safeSet('lorentz-factor', lorentz.toFixed(18));

    // COL 1 : SYSTÈME
    safeSet('hz-val', math.round(math.divide(BN(1), dt)).toString() + " Hz");
    
    // EFFET VISUEL : Vibration Manège / Choc
    const container = document.getElementById('main-container');
    if (sKmhNum > 10) {
        const shake = Math.random() * (sKmhNum / 40);
        container.style.transform = `translate(${shake}px, ${shake}px)`;
    } else {
        container.style.transform = "none";
    }

    // FLASH IMPACT (> 4G)
    if (math.abs(ay).gt(math.multiply(UNIVERSE.G_REF, 4))) {
        document.body.style.backgroundColor = "#fff";
        setTimeout(() => document.body.style.backgroundColor = "", 50);
    }

    drawTelemetry(ay.toNumber());
    WindAudio.update(State.v);
}

// 6. TELEMÉTRIE GRAPHIQUE (JERK)
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

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// LISTENERS
document.getElementById('start-btn-final').addEventListener('click', initSingularity);

// Mode Grotte Auto
if ('AmbientLightSensor' in window) {
    const sensor = new AmbientLightSensor();
    sensor.onreading = () => {
        document.body.classList.toggle('night-mode', sensor.illuminance < 5);
        safeSet('cave-status', sensor.illuminance < 5 ? "ACTIF" : "OFF");
    };
    sensor.start();
                                    } 
