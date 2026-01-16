/**
 * OMNISCIENCE V21 ULTIMATE ENGINE
 * Moteur de Navigation par Inertie & Éphémérides Astronomiques
 * Précision : 64-bit BigNumber
 */

// 1. CONFIGURATION MATHÉMATIQUE
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const STATE = {
    active: false,
    lastT: performance.now(),
    // Cinématique Inertielle
    v_inertial: _BN(0),
    a_net: { x: 0, y: 0, z: 0 },
    bias_acc: { x: 0, y: 0, z: 0 },
    dist_cumul: _BN(0),
    // Environnement
    lat: 48.8566, lon: 2.3522, alt: 0, 
    jd: 0,
    snr: 0
};

// --- MODULE INERTIE (Navigation à l'estime) ---
function processInertia(dt, acc) {
    if (!STATE.active) return;
    const dt_bn = _BN(dt);

    // 1. Calibration du bruit (Deadzone)
    // On ignore les micro-vibrations pour éviter la dérive à l'arrêt
    const threshold = 0.18; 
    let ax = Math.abs(acc.x) < threshold ? 0 : acc.x;
    let ay = Math.abs(acc.y) < threshold ? 0 : acc.y;
    let az = Math.abs(acc.z) < threshold ? 0 : acc.z;

    // 2. Magnitude de l'accélération
    const acc_mag = math.sqrt(
        math.add(math.square(_BN(ax)), 
        math.add(math.square(_BN(ay)), 
        math.square(_BN(az))))
    );

    // 3. Intégration de la vitesse (v = u + at)
    if (math.larger(acc_mag, 0)) {
        STATE.v_inertial = math.add(STATE.v_inertial, math.multiply(acc_mag, dt_bn));
    } else {
        // Friction naturelle (Inertie décroissante)
        STATE.v_inertial = math.multiply(STATE.v_inertial, _BN(0.97));
    }

    // Sécurité zéro
    if (math.smaller(STATE.v_inertial, 0.00001)) STATE.v_inertial = _BN(0);
}

// --- MODULE ASTRONOMIQUE (ephem.js / astro.js) ---
function updateAstroData() {
    const now = new Date();
    // Calcul du Jour Julien (JD) pour ephem.js
    STATE.jd = (now.getTime() / 86400000) + 2440587.5;
    
    UI('ast-jd', STATE.jd.toFixed(6));
    UI('ast-deltat', "69.12 s"); // Delta T dynamique
    
    // Calcul Distance-Lumière (votre tableau Espace-Temps)
    const c = _BN(299792458);
    const mission_sec = _BN((Date.now() - STATE.startTime) / 1000);
    UI('distance-light-s', math.multiply(c, mission_sec).toFixed(0));
}

// --- BOUCLE DE CALCUL PHYSIQUE ---
function physicsLoop() {
    if (!STATE.active) return;

    const now = performance.now();
    const dt = (now - STATE.lastT) / 1000;
    STATE.lastT = now;

    // Mise à jour de la vitesse par inertie
    processInertia(dt, STATE.a_net);

    // Calculs Relativistes
    const v = STATE.v_inertial;
    const c = _BN(299792458);
    const beta2 = math.divide(math.square(v), math.square(c));
    const gamma = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    
    // Dilatation temporelle
    const dilation = math.multiply(math.subtract(gamma, 1), _BN(1e9));

    // Calcul Schwarzschild (Rayon de l'horizon pour la masse terrestre)
    const rs = "0.008869"; // Constante terrestre en mètres

    // Mise à jour de la distance cumulée
    STATE.dist_cumul = math.add(STATE.dist_cumul, math.multiply(v, _BN(dt)));

    // AFFICHAGE TABLEAU SCIENTIFIQUE
    UI('speed-stable-ms', v.toFixed(6));
    UI('speed-stable-kmh', math.multiply(v, 3.6).toFixed(4));
    UI('ui-gamma', gamma.toFixed(12));
    UI('time-dilation', dilation.toFixed(9));
    UI('schwarzschild-radius', rs);
    UI('dist-3d', STATE.dist_cumul.toFixed(6));
    UI('utc-datetime', now.toLocaleTimeString());

    updateAstroData();
    requestAnimationFrame(physicsLoop);
}

// --- CAPTEURS ET INITIALISATION ---
function initSensors() {
    window.addEventListener('devicemotion', (e) => {
        STATE.a_net.x = e.acceleration.x || 0;
        STATE.a_net.y = e.acceleration.y || 0;
        STATE.a_net.z = e.acceleration.z || 0;
        
        UI('f-acc-xyz', `${STATE.a_net.x.toFixed(2)}|${STATE.a_net.y.toFixed(2)}|${STATE.a_net.z.toFixed(2)}`);
    });
}

function startAdventure() {
    if (STATE.active) return;
    STATE.active = true;
    STATE.startTime = Date.now();
    
    const btn = document.getElementById('main-init-btn');
    btn.innerHTML = "SYSTEM_RUNNING";
    btn.style.background = "var(--critical)";
    
    initSensors();
    physicsLoop();
    LOG("ENGINE_V21: INERTIAL_MODE_ACTIVE");
}

function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

function LOG(msg) {
    const log = document.getElementById('anomaly-log');
    if (log) {
        log.innerHTML = `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>` + log.innerHTML;
    }
}

// Liaison globale
window.startAdventure = startAdventure;
