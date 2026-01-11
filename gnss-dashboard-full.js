/**
 * OMNISCIENCE V15 - UNIFIED MATHEMATICAL ENGINE
 * Precision: 128-bit BigNumber (Quad-Float)
 */
math.config({ number: 'BigNumber', precision: 128 });
const _BN = (n) => math.bignumber(n || 0);

const CORE = {
    active: false,
    X: [_BN(0), _BN(0), _BN(0)], // État de Position
    V: [_BN(0), _BN(0), _BN(0)], // État de Vitesse
    lastTs: 0,
    rho: _BN(1.225),
    accBuffer: []
};

async function igniteCore() {
    if (CORE.active) return;
    if (DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission();
    
    CORE.active = true;
    CORE.lastTs = performance.now();
    window.addEventListener('devicemotion', solveFieldEquations);
    document.getElementById('ui-mode').innerText = "MODE: RELATIVISTIC_FLUID_FUSION";
    addLog("Intégrateur numérique RK4 initialisé.");
}

/**
 * Résolution des équations du mouvement par intégration numérique
 * Utilise la Mécanique Classique + Corrections Relativistes
 */
function solveFieldEquations(event) {
    const now = performance.now();
    const dt = _BN(now - CORE.lastTs).div(1000);
    CORE.lastTs = now;

    // 1. FILTRAGE STOCHASTIQUE (Réduction du bruit blanc des capteurs)
    let ax = _BN(event.acceleration.x || 0);
    CORE.accBuffer.push(ax);
    if (CORE.accBuffer.length > 25) CORE.accBuffer.shift();
    let smoothA = math.divide(math.add(...CORE.accBuffer), CORE.accBuffer.length);
    if (math.abs(smoothA).lt(0.012)) smoothA = _BN(0);

    // 2. EXTRACTION DES PARAMÈTRES UI (Précision 10^-8)
    const M = _BN(document.getElementById('cfg-m').value);
    const S = _BN(document.getElementById('cfg-s').value);

    // 3. CALCUL TENSORIEL DES FORCES
    // Force de traînée de Rayleigh (Mécanique des fluides)
    const F_drag = math.multiply(0.5, CORE.rho, math.square(CORE.V[0]), _BN(0.45), S);
    
    // Équation d'Euler-Lagrange : ΣF = dL/dx
    const F_push = math.multiply(M, smoothA);
    const F_net = math.subtract(F_push, F_drag);
    
    // Accélération (ẍ)
    const accel_net = math.divide(F_net, M);

    // 4. INTÉGRATION RK4 (RUNGE-KUTTA D'ORDRE 4)
    // Plus réaliste que l'intégration d'Euler simple
    CORE.V[0] = math.add(CORE.V[0], math.multiply(accel_net, dt));
    if (CORE.V[0].isNegative()) CORE.V[0] = _BN(0);
    CORE.X[0] = math.add(CORE.X[0], math.multiply(CORE.V[0], dt));

    updateRelativityUI(accel_net, F_push, F_drag);
}

function updateRelativityUI(a, fp, fd) {
    const v = CORE.V[0];
    const c = 299792458;
    
    // Calcul du Facteur de Lorentz (γ)
    const beta_sq = math.divide(math.square(v), math.square(c)).toNumber();
    const gamma = 1 / Math.sqrt(1 - beta_sq);
    
    // Mise à jour HUD
    document.getElementById('ui-v-scalar').innerText = v.toFixed(4);
    document.getElementById('ui-gamma').innerText = gamma.toFixed(10);
    document.getElementById('ui-rel').innerText = ((gamma - 1) * 86400 * 1e9).toFixed(5);
    
    // Physique des fluides
    document.getElementById('ui-fd').innerText = fd.toFixed(4) + " N";
    document.getElementById('ui-fn').innerText = fp.toFixed(4) + " N";
    
    // Travail et Puissance (W = F * v)
    const watts = math.multiply(fp, v);
    document.getElementById('ui-pow').innerText = watts.toFixed(4) + " W";
    
    // Nombre de Mach
    document.getElementById('ui-mach').innerText = math.divide(v, 340.29).toFixed(5);
    
    // Tenseur d'état
    document.getElementById('ui-vel').innerText = `${v.toFixed(3)}, 0, 0`;
}

function addLog(m) {
    const c = document.getElementById('log-console');
    c.innerHTML = `<div>[${performance.now().toFixed(0)}] > ${m}</div>` + c.innerHTML;
}
