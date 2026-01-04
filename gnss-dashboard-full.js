/**
 * OMNISCIENCE V100 PRO - SINGULARITY ULTRA CORE
 * Fusion Photonique, Acoustique & Inertielle 1024-bit
 */

math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const PHYS = {
    C: BN("299792458"),
    G_REF: BN("9.80665"),
    RHO_AIR: BN("1.225"),
    CD_HUMAN: BN("0.47"),
    AREA_HUMAN: BN("0.7"),
    TECTONIC_DRIFT: BN("0.0000000000015"),
    J_TO_KCAL: BN("0.000239006")
};

let State = {
    active: false,
    v: BN(0), v_old: BN(0), a_old: BN(0),
    dist: BN(0), calories: BN(0),
    lastT: null, mass: BN(70),
    dbLevel: 0, lastLux: 0, luxV: BN(0)
};

// --- SYSTÈME AUDIO (SIFFLEMENT VENT) ---
const WindAudio = {
    ctx: null, osc: null, gain: null,
    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.osc = this.ctx.createOscillator();
        this.gain = this.ctx.createGain();
        this.osc.type = "pink"; 
        this.osc.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        this.gain.gain.value = 0;
        this.osc.start();
    },
    update(v) {
        if (!this.gain) return;
        let s = Math.abs(v.toNumber());
        this.gain.gain.setTargetAtTime(Math.min(s / 40, 0.2), this.ctx.currentTime, 0.1);
    }
};

// --- BOUCLE DE RÉALITÉ ---
async function startSingularity() {
    State.active = true;
    State.lastT = BN(performance.now());
    WindAudio.init();

    // Capteur Lumière (Photonique)
    if ('AmbientLightSensor' in window) {
        const lux = new AmbientLightSensor({ frequency: 60 });
        lux.onreading = () => {
            let delta = Math.abs(lux.illuminance - State.lastLux);
            if (delta > 0.01) State.luxV = BN(delta).multiply("0.00001");
            State.lastLux = lux.illuminance;
            document.getElementById('env-lux').innerText = lux.illuminance.toFixed(1);
        };
        lux.start();
    }

    window.addEventListener('devicemotion', (e) => {
        const now = BN(performance.now());
        const dt = math.divide(math.subtract(now, State.lastT), BN(1000));
        State.lastT = now;
        if (dt.isZero()) return;

        // 1. ACCÉLÉRATION 3D (Verlet)
        let ay = BN(e.accelerationIncludingGravity.y || 0);
        if (math.abs(ay).lt(BN("0.005"))) ay = BN(0); // Ultra-sensible pour 1mm/s

        let a_avg = math.divide(math.add(ay, State.a_old), 2);
        let deltaV = math.multiply(a_avg, dt);

        // 2. FUSION (Inertie + Lumière + Tectonique)
        State.v = math.add(State.v, deltaV, PHYS.TECTONIC_DRIFT, State.luxV);
        
        // 3. TRAÎNÉE SUPERSONIQUE
        let v_ms = State.v.toNumber();
        let mach = v_ms / 340.29;
        let drag = math.multiply(BN(0.5), PHYS.RHO_AIR, PHYS.CD_HUMAN, PHYS.AREA_HUMAN, math.square(State.v));
        if (mach > 1) drag = math.multiply(drag, math.square(BN(mach))); // Mur du son

        State.v = math.subtract(State.v, math.divide(math.multiply(drag, dt), State.mass));
        if (State.v.lt(0)) State.v = BN(0);
        State.a_old = ay;
        State.luxV = BN(0); // Reset boost optique

        // 4. RENDU
        updateUI(ay, dt, mach);
    });
}

function updateUI(ay, dt, mach) {
    const vKmh = math.multiply(State.v, BN("3.6"));
    const sKmh = vKmh.toNumber();

    document.getElementById('sp-main-hud').innerText = vKmh.toFixed(1);
    document.getElementById('v1024-val').innerText = vKmh.toFixed(8);
    document.getElementById('v-micro').innerText = State.v.toFixed(9);
    document.getElementById('mach-val').innerText = mach.toFixed(3);
    
    // Effet Manège (Shake)
    if (sKmh > 5) {
        let shake = Math.min(sKmh / 20, 4);
        document.getElementById('main-container').style.transform = `translate(${(Math.random()-0.5)*shake}px, ${(Math.random()-0.5)*shake}px)`;
    }

    // Calcul Lorentz (Relativité)
    let beta = math.divide(State.v, PHYS.C);
    let lorentz = math.divide(BN(1), math.sqrt(math.subtract(BN(1), math.square(beta))));
    document.getElementById('lorentz-val').innerText = lorentz.toFixed(18);

    WindAudio.update(State.v);
                }
