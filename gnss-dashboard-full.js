/**
 * OMNISCIENCE V25.9 - ABSOLUTE FINAL ENGINE
 * Correction : Logique de Dissipation + Gravité Quantique
 */

const PHY = {
    c: 299792458,
    G: 6.67430e-11,
    M_e: 5.9722e24,
    R_earth: 6378137,
    Planck: 6.62607015e-34,
    Omega_earth: 7.292115e-5 // Rotation terrestre rad/s
};

function updateScientificLogic(STATE) {
    const v = Number(STATE.v);
    const alt = Number(STATE.pos.alt);
    const latRad = STATE.pos.lat * (Math.PI / 180);
    const mass = 80; // Masse standard stockée dans le buffer

    // 1. RELATIVITÉ GÉNÉRALE (DILATATION GRAVITATIONNELLE)
    // Formule : t' = t * sqrt(1 - 2GM/rc^2)
    const rs = (2 * PHY.G * PHY.M_e) / Math.pow(PHY.c, 2);
    const r = PHY.R_earth + alt;
    const dilat_g = (1 - Math.sqrt(1 - rs / r)) * 1e9; // conversion en ns/s
    UI('time-dilation-g', dilat_g.toFixed(9));
    UI('schwarzschild-radius', rs.toFixed(8));

    // 2. MÉCANIQUE QUANTIQUE (PLANCK & MOMENTUM)
    const p = mass * v;
    const de_broglie = PHY.Planck / (p || 1e-10);
    UI('momentum-p', p.toFixed(2));
    UI('quantum-drag', de_broglie.toExponential(4));

    // 3. FORCE DE CORIOLIS (MODÈLE NON-SUPPLICIÉ)
    // F = 2 * m * v * omega * sin(lat)
    const f_coriolis = 2 * mass * v * PHY.Omega_earth * Math.sin(latRad);
    UI('coriolis', (f_coriolis * 1000).toFixed(4)); // en milli-Newtons

    // 4. ESPACE_TEMPS_C (DISTANCE LUMIÈRE)
    const dist_total = Number(STATE.dist);
    UI('distance-light-s', (dist_total / PHY.c).toExponential(8));
    UI('distance-light-h', (dist_total / (PHY.c * 3600)).toExponential(12));

    // 5. BIOMÉTRIQUE (ESTIMATION D'EFFORT)
    // Basé sur le métabolisme de transport (MET)
    const kcal = (met_score(v) * mass * (dt / 3600));
    UI('adrenaline-idx', (0.10 + (STATE.accel.g_res - 1) * 0.5).toFixed(2));
}

// Correction de la Friction (Évite l'arrêt mou)
function applyNonLinearFriction(v, dt) {
    if (v < 0.01) return 0;
    const rho = 1.225;
    const Cx = 0.4;
    const S = 0.5;
    const mu = 0.015; // Coefficient de roulement
    
    const drag = 0.5 * rho * v * v * Cx * S;
    const friction = mu * 80 * 9.81;
    const deceleration = (drag + friction) / 80;
    
    return Math.max(0, v - (deceleration * dt));
}
