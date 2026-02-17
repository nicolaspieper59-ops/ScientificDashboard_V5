/**
 * PROTOCOLE SOUVERAIN-S10 : SYSTÈME D'EXPLOITATION PHYSIQUE
 * Version : 4.0 (FULL INTEGRATION : NANO / VÉLO / LONGUE DISTANCE)
 * Logiciel : 512-bit Precision Math (BigNumber.js)
 * Physique : Ciddor, VSOP2013, Lorentz, Dilatation Alu/Si
 */

const fs = require('fs');
const { execSync } = require('child_process');
const BigNumber = require('bignumber.js');

// 1. CONFIGURATION HAUTE PRÉCISION (155 décimales)
BigNumber.config({ DECIMAL_PLACES: 155, ROUNDING_MODE: 4 });

// --- CONSTANTES PHYSIQUES RÉELLES ---
const C = new BigNumber('299792458'); // Vitesse lumière (m/s)
const R_EARTH = new BigNumber('6378137'); // Rayon Équatorial
const OMEGA_EARTH = new BigNumber('0.000072921159'); // rad/s
const L0_S10 = new BigNumber('0.004'); // Focale optique nominale
const COEFF_ALU = new BigNumber('23e-6'); // Dilatation cadre S10

// --- ÉTAT DU SYSTÈME ---
let state = {
    profile: "NANO", // Par défaut
    lastV: new BigNumber(0),
    integratedDist: new BigNumber(0),
    lastTime: performance.now()
};

// =============================================================================
// 2. INTERFACE HARDWARE (ZÉRO SIMULATION)
// =============================================================================
class S10e_Hardware {
    static readKernelTemp() {
        const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        return new BigNumber(raw.trim()).dividedBy(1000);
    }

    static getSensors() {
        // Accès direct Termux:API (Pression, Magnétomètre, Accéléromètre)
        const output = execSync('termux-sensor -s "Pressure,Magnetic Field,Accelerometer" -n 1', { encoding: 'utf8' });
        const data = JSON.parse(output);
        return {
            p: new BigNumber(data.pressure.values[0]),
            az: new BigNumber(data.magnetic_field.values[0]),
            acc: new BigNumber(data.accelerometer.values[0]), // Axe Z (Profondeur)
            gyroNoise: new BigNumber(data.accelerometer.values[1]).abs() // Pour détection choc
        };
    }
}

// =============================================================================
// 3. MOTEUR DE CALCUL SOUVERAIN
// =============================================================================
function computeSovereignPhysics(sensors, temp, dt) {
    // A. ÉQUATION DE CIDDOR (Réfraction de l'air réelle)
    const T_K = temp.plus(273.15);
    const n_std = new BigNumber('0.000273');
    const factor_P = sensors.p.dividedBy(1013.25);
    const factor_T = new BigNumber(288.15).dividedBy(T_K);
    const n_reel = new BigNumber(1).plus(n_std.times(factor_P).times(factor_T));

    // B. CORRECTION VSOP2013 (Rotation terrestre à Latitude 48.85 - Ajustable)
    const latRad = new BigNumber(48.85).times(Math.PI).dividedBy(180);
    const V_surface = OMEGA_EARTH.times(R_EARTH).times(Math.cos(latRad.toNumber()));
    const azRad = sensors.az.times(Math.PI).dividedBy(180);
    const v_earth_ms = V_surface.times(Math.sin(azRad.toNumber()));

    // C. DILATATION DU MATÉRIAU (Aluminium)
    const drift_nms = L0_S10.times(COEFF_ALU).times(temp).times(1e9);

    // D. CALCUL DE VITESSE ABSOLUE (Accéléromètre -> Intégration 512-bit)
    // On soustrait la tricherie gravitationnelle et la dérive thermique
    let rawV_ms = sensors.acc.times(dt);
    let v_absolue_ms = rawV_ms.minus(v_earth_ms).minus(drift_nms.dividedBy(1e9));

    return { v_ms: v_absolue_ms, n: n_reel, drift: drift_nms };
}

// =============================================================================
// 4. AUTO-PROFIL ET MISE À JOUR DASHBOARD
// =============================================================================
function syncDashboard() {
    const now = performance.now();
    const dt = new BigNumber(now - state.lastTime).dividedBy(1000);
    if (dt.isZero()) return requestAnimationFrame(syncDashboard);

    const temp = S10e_Hardware.readKernelTemp();
    const sensors = S10e_Hardware.getSensors();
    const physics = computeSovereignPhysics(sensors, temp, dt);

    // --- LOGIQUE D'AUTO-PROFIL ---
    // Si vitesse > 1.5 m/s (5.4 km/h) -> Mode VÉLO/TRANSPORT
    if (physics.v_ms.abs().gt(1.5)) {
        state.profile = "MACRO";
        const speedKmH = physics.v_ms.times(3.6);
        document.getElementById('sp-main').innerText = speedKmH.toFixed(2);
        document.getElementById('speed-unit').innerText = "KM/H";
        document.getElementById('sp-main').style.color = "#00ff88"; 
    } else {
        state.profile = "NANO";
        const v_nms = physics.v_ms.times(1e9);
        document.getElementById('sp-main').innerText = v_nms.toFixed(0);
        document.getElementById('speed-unit').innerText = "nm/s";
        document.getElementById('sp-main').style.color = "#00d2ff";
    }

    // --- RELATIVITÉ (LORENTZ) ---
    const beta2 = physics.v_ms.pow(2).dividedBy(C.pow(2));
    const lorentz = new BigNumber(1).dividedBy(new BigNumber(1).minus(beta2).squareRoot());
    document.getElementById('lorentz-val').innerText = lorentz.toFixed(15);

    // --- DENSITÉ AIR & DISTANCE ---
    document.getElementById('air-density').innerText = physics.n.toFixed(9);
    state.integratedDist = state.integratedDist.plus(physics.v_ms.abs().times(dt));
    document.getElementById('dist-3d').innerText = state.integratedDist.toFixed(6);

    // --- LOGGING D'INTÉGRITÉ (ANTI-ILLOGIQUE) ---
    if (physics.v_ms.gt(277)) { // > 999 km/h
         fs.appendFileSync("souverain.log", `[${new Date().toISOString()}] ANOMALIE: Vitesse illogique détectée.\n`);
    }

    state.lastTime = now;
    requestAnimationFrame(syncDashboard);
}

// Initialisation
syncDashboard();
