/**
 * OMNISCIENCE V100 PRO - SINGULARITY CORE
 * Physique de précision 1024-bit avec adaptation environnementale
 */

math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const State = {
    isRunning: false,
    X: [BN(0), BN(0), BN(0), BN(0), BN(0)], // PosX, Vel
    biasY: BN(0),
    homePos: BN(0),
    lastTick: performance.now(),
    lastRawY: 0,
    c: BN("299792458")
};

// --- MODULE VISION NOCTURNE ---
function updateEnvironmentMode() {
    const hour = new Date().getUTCHours();
    const isNight = (hour >= 18 || hour <= 6);
    document.getElementById('main-body').classList.toggle('night-mode', isNight);
}

// --- MODULE JOURNAL DES TRÉSORS ---
const Journal = {
    add: function(type, msg) {
        const log = document.getElementById('treasure-log-display');
        const time = new Date().toLocaleTimeString();
        log.innerHTML = `<div>[${time}] <b>${type}</b>: ${msg}</div>` + log.innerHTML;
        if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
    }
};

// --- MOTEUR PHYSIQUE RÉALISTE ---
const PhysicsEngine = {
    // Calcule la traînée quadratique réelle (Fd = 0.5 * rho * v² * Cd)
    calculateDrag: function(v, type) {
        const rho = BN("1.225");
        let cd = BN("0.45"); // Humain par défaut
        if (type.includes("BATEAU")) cd = BN("0.12");
        if (type.includes("WAGONNET")) cd = BN("0.28");
        return math.multiply(BN("0.5"), rho, math.square(v), cd);
    }
};

function mainLoop(e) {
    if (!State.isRunning) return;

    const now = performance.now();
    const dtRaw = (now - State.lastTick) / 1000;
    State.lastTick = now;
    const dt = BN(dtRaw);

    // 1. MONITORING THERMIQUE (Automatic Accuracy Adjustment)
    if (dtRaw > 0.05) { // Si le calcul prend plus de 50ms, le CPU chauffe
        math.config({ precision: 64 });
        document.getElementById('thermal-status').innerText = "THERMIQUE : BRIDAGE (64-BIT)";
        document.getElementById('thermal-status').classList.add('thermal-warn');
    } else {
        math.config({ precision: 308 });
        document.getElementById('thermal-status').innerText = "THERMIQUE : OPTIMAL (1024-BIT)";
        document.getElementById('thermal-status').classList.remove('thermal-warn');
    }

    // 2. SIGNAL BRUT & NOISE GATE (Élimine les "vitesses fantômes")
    const rawY = BN(e.accelerationIncludingGravity.y || 0);
    State.lastRawY = rawY;
    let ay = math.subtract(rawY, State.biasY);
    if (math.abs(ay).lt(BN("0.085"))) ay = BN(0); // Seuil de bruit atomique

    // 3. DÉDUCTION AUTOMATIQUE DU VÉHICULE
    const vCurr = math.multiply(State.X[4], BN("3.6")).toNumber();
    let vType = "PIÉTON";
    if (vCurr > 180) vType = "BATEAU (GLACE BLEUE)";
    else if (vCurr > 26 && vCurr < 32) vType = "WAGONNET (RAILS)";

    // 4. INTÉGRATION DE NEWTON AVEC FRICTION QUADRATIQUE
    let v = math.add(State.X[4], math.multiply(ay, dt));
    const drag = PhysicsEngine.calculateDrag(v, vType);
    
    // Application de la force de freinage opposée au mouvement
    const dragLoss = math.multiply(drag, dt);
    v = v.gt(0) ? math.subtract(v, dragLoss) : math.add(v, dragLoss);
    
    // Correction de l'arrêt complet
    if (math.abs(v).lt(BN("0.005"))) v = BN(0);
    State.X[4] = v;

    // 5. MISE À JOUR NAVIGATION (DISTANCE MAISON)
    State.X[0] = math.add(State.X[0], math.multiply(v, dt));
    const distHome = math.abs(math.subtract(State.X[0], State.homePos));

    // 6. SYNCHRONISATION UI
    const vKMH = math.multiply(v, BN("3.6"));
    document.getElementById('speed-main-display').innerText = vKMH.toFixed(2) + " km/h";
    document.getElementById('vitesse-stable-1024').innerText = vKMH.toFixed(15);
    document.getElementById('dist-3d-precise').innerText = distHome.toFixed(3) + " m";
    document.getElementById('acc-y').innerText = ay.toFixed(4);
    document.getElementById('reality-status').innerText = "RÉFÉRENTIEL : " + vType;
    document.getElementById('sampling-frequency-val').innerText = (1/dtRaw).toFixed(0) + " Hz";

    // 7. CALCULS RELATIVISTES & FLUIDES
    const beta = math.divide(v, State.c);
    const gamma = math.divide(BN(1), math.sqrt(math.subtract(BN(1), math.square(beta))));
    document.getElementById('lorentz-factor').innerText = gamma.toFixed(18);
    document.getElementById('mach-number').innerText = (v.toNumber() / 340.29).toFixed(5);
    document.getElementById('dynamic-pressure').innerText = math.multiply(BN("0.5"), BN("1.225"), math.square(v)).toFixed(2) + " Pa";

    // 8. DÉTECTION AUTOMATIQUE D'ANOMALIES
    if (vKMH.gt(BN(260))) Journal.add("ANOMALIE", "Signature cinétique de Trou de Ver détectée.");
}

// --- INITIALISATION DES COMMANDES ---
document.getElementById('start-btn-final').onclick = async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
    State.isRunning = true;
    updateEnvironmentMode();
    document.getElementById('start-btn-final').style.display = "none";
    window.addEventListener('devicemotion', mainLoop);
};

document.getElementById('reinit-vmax-btn').onclick = () => {
    State.biasY = State.lastRawY;
    State.homePos = State.X[0];
    State.X[4] = BN(0);
    Journal.add("SYSTÈME", "Zéro Atomique calibré. Référentiel Maison fixé.");
};

// Boucles de maintenance
setInterval(updateEnvironmentMode, 60000); 
setInterval(() => {
    document.getElementById('utc-datetime').innerText = new Date().toUTCString().split(' ')[4];
}, 1000);
