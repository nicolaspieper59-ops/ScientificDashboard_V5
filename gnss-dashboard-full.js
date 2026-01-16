/**
 * OMNISCIENCE V23 EXTRÊME - AEROSPACE & VOLTIGE ENGINE
 * Spécial : Manèges, Saltos, Métro (Hautes Contraintes)
 */

math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const STATE = {
    active: false,
    startTime: Date.now(),
    lastT: performance.now(),
    // Vecteurs 3D
    v_inertial: _BN(0),
    dist_cumul: _BN(0),
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    accel_pure: { x: 0, y: 0, z: 0 }, // Sans gravité
    g_force: 1.0,
    // Paramètres Astro
    jd: 0,
    deltat: 69.18
};

// =============================================================
// 1. MOTEUR DE PHYSIQUE VECTORIELLE (GESTION DES G & SALTOS)
// =============================================================
function computeExtremePhysics(dt, motion) {
    if (dt <= 0 || dt > 0.2) return;

    // A. RÉCUPÉRATION DE L'ACCÉLÉRATION LINÉAIRE (SANS GRAVITÉ)
    // On utilise accelerationIncludingGravity - Gravity pour isoler le mouvement réel
    const rawX = motion.acceleration.x || 0;
    const rawY = motion.acceleration.y || 0;
    const rawZ = motion.acceleration.z || 0;

    // B. CALCUL DE LA G-FORCE (RÉSULTANTE)
    const gx = motion.accelerationIncludingGravity.x || 0;
    const gy = motion.accelerationIncludingGravity.y || 0;
    const gz = motion.accelerationIncludingGravity.z || 0;
    STATE.g_force = Math.sqrt(gx*gx + gy*gy + gz*gz) / 9.80665;

    // C. FILTRE ANTI-VIBRATION "MÉTRO" (Seuil haut pour environnement bruité)
    // Dans le métro, les vibrations rails/caisse créent du bruit blanc à 2Hz-5Hz
    const noise_floor = STATE.g_force > 1.5 ? 0.25 : 0.12; 
    let ax = Math.abs(rawX) < noise_floor ? 0 : rawX;
    let ay = Math.abs(rawY) < noise_floor ? 0 : rawY;
    let az = Math.abs(rawZ) < noise_floor ? 0 : rawZ;

    const a_mag = Math.sqrt(ax*ax + ay*ay + az*az);

    // D. INTÉGRATION RÉACTIVE AVEC COMPENSATION DE FREINAGE
    // Si la G-force est élevée (virage manège), on limite l'intégration de vitesse linéaire
    // pour éviter que le "poids" ne soit pris pour de la "vitesse"
    const centrifugal_correction = Math.max(0.5, 2.0 - STATE.g_force); 

    if (a_mag > 0.1) {
        const dv = _BN(a_mag * dt * centrifugal_correction);
        STATE.v_inertial = math.add(STATE.v_inertial, dv);
    } else {
        // Friction active pour stabiliser l'arrêt
        STATE.v_inertial = math.multiply(STATE.v_inertial, _BN(0.92));
    }

    if (math.smaller(STATE.v_inertial, 0.01)) STATE.v_inertial = _BN(0);

    // E. CUMUL DISTANCE
    STATE.dist_cumul = math.add(STATE.dist_cumul, math.multiply(STATE.v_inertial, _BN(dt)));
}

// =============================================================
// 2. MODULE ASTRONOMIQUE & RELATIVISTE
// =============================================================
function updateAstroAndRelativity() {
    const v = STATE.v_inertial;
    const v_ms = Number(v);
    
    // Lorentz & Énergie
    const beta2 = math.divide(math.square(v), math.square(_BN(299792458)));
    const gamma = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    const e_rel = math.multiply(gamma, math.multiply(_BN(80), math.square(_BN(299792458))));

    // Jour Julien & TSLV
    STATE.jd = (Date.now() / 86400000) + 2440587.5;

    // AFFICHAGE HUD
    UI('speed-stable-ms', v.toFixed(6));
    UI('speed-stable-kmh', math.multiply(v, 3.6).toFixed(4));
    UI('v-cosmic', math.multiply(v, 3.6).toFixed(2));
    UI('g-resultant', STATE.g_force.toFixed(3)); // Nouveau ID nécessaire ou réutilisation
    UI('ui-gamma', gamma.toFixed(15));
    UI('relativistic-energy', e_rel.toExponential(4));
    UI('ast-jd', STATE.jd.toFixed(6));
    UI('ast-deltat', "69.18 s");
    UI('dist-3d', STATE.dist_cumul.toFixed(4));
    
    // Reynolds & Mach
    UI('mach-number', (v_ms / 340.29).toFixed(5));
    UI('reynolds-number', ((1.225 * v_ms * 1.7) / 1.81e-5).toExponential(2));
    
    // Distance Lumière
    const light_dist = math.multiply(v, _BN((Date.now() - STATE.startTime)/1000));
    UI('distance-light-s', light_dist.toFixed(4));
}

// =============================================================
// 3. GESTION DES CAPTEURS HAUTE FRÉQUENCE
// =============================================================
function initSensors() {
    window.addEventListener('devicemotion', (e) => {
        if (!STATE.active) return;
        const dt = (performance.now() - STATE.lastT) / 1000;
        STATE.lastT = performance.now();
        
        computeExtremePhysics(dt, e);
        
        UI('f-acc-xyz', `${e.acceleration.x?.toFixed(2)}|${e.acceleration.y?.toFixed(2)}|${e.acceleration.z?.toFixed(2)}`);
    });

    window.addEventListener('deviceorientation', (e) => {
        UI('pitch', Math.round(e.beta || 0));
        UI('roll', Math.round(e.gamma || 0));
        UI('heading-display', Math.round(e.alpha || 0));
    });

    navigator.geolocation.watchPosition((p) => {
        // Correction GPS douce
        const v_gps = _BN(p.coords.speed || 0);
        const err = math.subtract(v_gps, STATE.v_inertial);
        STATE.v_inertial = math.add(STATE.v_inertial, math.multiply(err, _BN(0.05)));
        
        UI('lat-ukf', p.coords.latitude.toFixed(7));
        UI('lon-ukf', p.coords.longitude.toFixed(7));
    }, null, { enableHighAccuracy: true });
}

function startAdventure() {
    STATE.active = true;
    STATE.startTime = Date.now();
    document.getElementById('main-init-btn').innerText = "SYSTEM_RUNNING";
    initSensors();
    
    setInterval(updateAstroAndRelativity, 100); // 10Hz UI
}

function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

window.startAdventure = startAdventure;
