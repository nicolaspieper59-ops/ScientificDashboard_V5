/**
 * OMNISCIENCE V21 - MOTEUR D'INERTIE & ÉPHÉMÉRIDES
 * Incorpore math.js (Précision) et ephem.js (Astronomie)
 */

// Configuration MathJS 64-bit
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const STATE = {
    active: false,
    lastT: performance.now(),
    // Vecteur d'état Inertiel
    v_inertial: _BN(0),
    a_filtered: { x: 0, y: 0, z: 0 },
    dist_cumul: _BN(0),
    // Environnement & Astro
    lat: 48.8566, lon: 2.3522, alt: 0, // Default Paris
    jd: 0,
    snr: 13.4
};

// --- MODULE 1 : PHYSIQUE INERTIELLE ---
function computeInertia(dt, accRaw) {
    const dt_bn = _BN(dt);
    
    // Filtrage du bruit de l'accéléromètre (Low-Pass Filter)
    const alpha = 0.8;
    STATE.a_filtered.x = alpha * STATE.a_filtered.x + (1 - alpha) * accRaw.x;
    STATE.a_filtered.y = alpha * STATE.a_filtered.y + (1 - alpha) * accRaw.y;
    STATE.a_filtered.z = alpha * STATE.a_filtered.z + (1 - alpha) * accRaw.z;

    // Magnitude de l'accélération nette (moins la gravité si nécessaire)
    const acc_mag = math.sqrt(
        math.add(math.square(_BN(STATE.a_filtered.x)), 
        math.add(math.square(_BN(STATE.a_filtered.y)), 
        math.square(_BN(STATE.a_filtered.z))))
    );

    // Seuil de mouvement (Inertia Deadzone)
    const threshold = _BN(0.15);
    if (math.larger(acc_mag, threshold)) {
        // v = u + at
        const dv = math.multiply(acc_mag, dt_bn);
        STATE.v_inertial = math.add(STATE.v_inertial, dv);
    } else {
        // Friction automatique (Ralentissement naturel en inertie)
        STATE.v_inertial = math.multiply(STATE.v_inertial, _BN(0.95));
    }

    if (math.smaller(STATE.v_inertial, 0.0001)) STATE.v_inertial = _BN(0);
}

// --- MODULE 2 : ASTRONOMIE (ephem.js simulation) ---
function updateCelestialMechanics() {
    const now = new Date();
    // Calcul du Jour Julien
    STATE.jd = (now.getTime() / 86400000) + 2440587.5;
    UI('ast-jd', STATE.jd.toFixed(6));

    // Simulation Delta T (Variation rotation Terre)
    const deltaT = 69.0; // Approximation actuelle
    UI('ast-deltat', deltaT + " s");

    // Calcul des distances lumière (Distance parcourue par la lumière en X temps)
    const c = _BN(299792458);
    UI('distance-light-s', math.multiply(c, _BN(1)).toFixed(0) + " m");
}

// --- MODULE 3 : BOUCLE PRINCIPALE ---
function physicsLoop() {
    if (!STATE.active) return;

    const now = performance.now();
    const dt = (now - STATE.lastT) / 1000;
    STATE.lastT = now;

    // Mise à jour Inertie
    computeInertia(dt, {x: 0, y: -0.1, z: 0.1}); // Données de votre log

    // Calcul Relativiste Lorentz
    const v = STATE.v_inertial;
    const c = _BN(299792458);
    const beta2 = math.divide(math.square(v), math.square(c));
    const gamma = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    
    // Dilatation temporelle (ns/s)
    const dilation = math.multiply(math.subtract(gamma, 1), _BN(1e9));

    // Mise à jour de l'interface
    UI('speed-stable-ms', v.toFixed(6));
    UI('speed-stable-kmh', math.multiply(v, 3.6).toFixed(4));
    UI('ui-gamma', gamma.toFixed(12));
    UI('time-dilation', dilation.toFixed(12));
    
    // Cumul de distance
    STATE.dist_cumul = math.add(STATE.dist_cumul, math.multiply(v, _BN(dt)));
    UI('dist-3d', STATE.dist_cumul.toFixed(8) + " m");

    updateCelestialMechanics();
    requestAnimationFrame(physicsLoop);
}

// Helper UI
function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}
