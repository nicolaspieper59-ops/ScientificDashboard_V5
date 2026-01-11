math.config({ number: 'BigNumber', precision: 128 });
const _BN = (n) => math.bignumber(n || 0);

let State = {
    active: false,
    v: _BN(0),
    lastT: performance.now(),
    mass: _BN(80),
    vol: _BN(0.075),
    area: _BN(0.6),
    cd: _BN(0.47)
};

const safeSet = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
};

function startGeolocation() {
    State.active = true;
    window.addEventListener('devicemotion', handleMotion);
}

function handleMotion(event) {
    if (!State.active) return;

    const now = performance.now();
    const dt = _BN(now - State.lastT).div(1000);
    State.lastT = now;
    if (dt.lt(0.001)) return;

    // Détection Milieu (Air/Eau/Espace)
    const gRaw = event.accelerationIncludingGravity;
    const gMag = math.sqrt(math.add(math.square(gRaw.x), math.square(gRaw.y), math.square(gRaw.z)));
    let rho = _BN(1.225);
    let milieu = "ATMOSPHÈRE";

    if (gMag.lt(1.0)) { milieu = "ESPACE"; rho = _BN("1e-20"); }

    // Calcul des Forces
    const pitch = Math.atan2(gRaw.y, gRaw.z);
    const fDrag = math.multiply(0.5, rho, math.square(State.v), 0.47, 0.6);
    const fSlope = math.multiply(State.mass, 9.81, Math.sin(pitch));
    
    let ax = _BN(event.acceleration.x || 0);
    // FILTRE ANTI-PISTON : On ignore les micro-mouvements < 0.2 m/s²
    if (math.abs(ax).lt(0.2)) ax = _BN(0);
    const fPush = math.multiply(State.mass, ax);

    const netForce = math.subtract(math.add(fPush, fSlope), fDrag);
    const accelNet = math.divide(netForce, State.mass);

    // Intégration de la vitesse
    State.v = math.add(State.v, math.multiply(accelNet, dt));

    // Correction de dérive (Arrêt propre)
    if (State.v.lt(0.05) && ax.isZero()) State.v = _BN(0);
    if (State.v.isNegative()) State.v = _BN(0);

    updateUI(milieu, fs = fSlope, fd = fDrag, fp = fPush, anet = accelNet);
}



function updateUI(milieu, fs, fd, fp, anet) {
    const vKmh = math.multiply(State.v, 3.6).toNumber();
    safeSet('main-speed', vKmh.toFixed(3));
    safeSet('ui-env', milieu);
    safeSet('ui-f-push', fp.toFixed(2));
    safeSet('ui-f-slope', fs.toFixed(2));
    safeSet('ui-f-drag', fd.toFixed(2));
    safeSet('ui-real-accel', anet.toFixed(4));
    safeSet('g-force-val', math.abs(anet).div(9.81).add(1).toFixed(3));

    const gamma = 1 / Math.sqrt(1 - (Math.pow(vKmh/3.6, 2) / Math.pow(299792458, 2)));
    safeSet('dilatation-lorentz', ((gamma - 1) * 86400 * 1e9).toFixed(6) + " ns/j");
}
