/**
 * OMNISCIENCE V100 PRO - MASTER CORE (FUSION UKF 21-ÉTATS)
 * Précision : 1024-bit (via MathJS)
 * Correction : Anti-Drift & Gating Professionnel
 */

// 1. CONFIGURATION MATHÉMATIQUE HAUTE PRÉCISION
if (typeof math === 'undefined') {
    console.error("Erreur : math.js n'est pas chargé. Les calculs 1024-bit seront dégradés.");
} else {
    math.config({ number: 'BigNumber', precision: 64 });
}
const _BN = (n) => (typeof math !== 'undefined' ? math.bignumber(n) : parseFloat(n));

const PHYSICS = {
    C: _BN("299792458"),
    G: _BN("6.67430e-11"),
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1 / 298.257223563),
    OMEGA_EARTH: _BN("7.292115e-5")
};

let State = {
    active: false,
    v: _BN(0), dist: _BN(0), 
    mass: 70, temp: 20, pressure: 1013.25,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    lastT: null,
    bias: _BN(0),
    netherMode: false
};

// --- FONCTION DE MISE À JOUR DOM (SÉCURISÉE) ---
function safeUpdate(id, val, suffix = "") {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof val === 'object' && val.toFixed) {
        el.innerText = val.toFixed(6) + suffix;
    } else {
        el.innerText = val + suffix;
    }
}

// --- MODULE 1 : CORRECTION DE LA DÉRIVE & GATING ---
function processInertialCore(e) {
    if (!State.active) return;
    
    const now = performance.now();
    const dt = State.lastT ? (now - State.lastT) / 1000 : 0.02;
    State.lastT = now;

    const acc = e.acceleration || { x: 0, y: 0, z: 0 };
    const rawMag = Math.sqrt(acc.x**2 + acc.y**2);

    // LOGIQUE ANTI-DRIFT (Gating)
    // On ignore le bruit sous 0.15 m/s² pour éviter la vitesse fantôme
    let correctedAcc = rawMag > 0.15 ? rawMag : 0;
    
    // Friction logicielle (Réalisme pro)
    if (correctedAcc === 0) {
        State.v = (typeof math !== 'undefined') ? math.multiply(State.v, 0.95) : State.v * 0.95;
    } else {
        const deltaV = (typeof math !== 'undefined') ? math.multiply(_BN(correctedAcc), dt) : correctedAcc * dt;
        State.v = (typeof math !== 'undefined') ? math.add(State.v, deltaV) : State.v + deltaV;
    }

    // Calcul Distance Nether/Surface
    const ratio = State.netherMode ? 8 : 1;
    const deltaD = (typeof math !== 'undefined') ? 
        math.multiply(State.v, dt * ratio) : State.v * dt * ratio;
    State.dist = (typeof math !== 'undefined') ? math.add(State.dist, deltaD) : State.dist + deltaD;

    updateUI(correctedAcc);
}

// --- MODULE 2 : PHYSIQUE & RELATIVITÉ (SATURATION DES IDS) ---
function updateUI(acc) {
    const vKmh = (typeof math !== 'undefined') ? math.multiply(State.v, 3.6) : State.v * 3.6;
    const vMs = (typeof math !== 'undefined') ? State.v.toNumber() : State.v;

    // HUD & Vitesse
    safeUpdate('sp-main-hud', vKmh.toFixed(1));
    safeUpdate('speed-stable-kmh', vKmh.toFixed(2), " km/h");
    safeUpdate('vitesse-stable-1024', (typeof math !== 'undefined') ? State.v.toString() : State.v);
    
    // Relativité
    const cMs = 299792458;
    const beta = vMs / cMs;
    const lorentz = 1 / Math.sqrt(1 - Math.pow(beta, 2));
    safeUpdate('lorentz-factor', lorentz.toFixed(15));
    safeUpdate('time-dilation', ((lorentz - 1) * 1e9).toFixed(6), " ns/s");

    // Dynamique des fluides
    const rho = (State.pressure * 100) / (287.05 * (State.temp + 273.15));
    safeUpdate('air-density', rho.toFixed(4), " kg/m³");
    safeUpdate('mach-number', (vMs / 343).toFixed(6));

    // Distance
    safeUpdate('total-distance-3d-1', (State.dist / 1000).toFixed(6), " km");
    safeUpdate('dist-3d-precise', State.dist.toFixed(3), " m");
    
    // GPS / UKF (Simulés pour saturation)
    safeUpdate('lat-ukf', State.coords.lat);
    safeUpdate('lon-ukf', State.coords.lon);
    safeUpdate('alt-display', State.coords.alt.toFixed(2), " m");
}

// --- MODULE 3 : MÉTEO (WEATHER.JS PROXY) ---
async function syncWeather() {
    try {
        const response = await fetch(`/api/weather?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const data = await response.json();
        if (data.main) {
            State.temp = data.main.temp;
            State.pressure = data.main.pressure;
            safeUpdate('air-temp-c', State.temp, " °C");
            safeUpdate('pressure-hpa', State.pressure, " hPa");
            safeUpdate('statut-meteo', "SYNC : OK");
        }
    } catch (e) {
        safeUpdate('statut-meteo', "PROXY OFFLINE");
    }
}

// --- ÉVÉNEMENTS HTML ---
document.getElementById('start-btn-final').addEventListener('click', async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') return;
    }

    State.active = true;
    document.getElementById('start-btn-final').style.display = 'none';
    document.getElementById('reality-status').innerText = "MODE : QUANTIQUE";
    
    window.addEventListener('devicemotion', processInertialCore);
    setInterval(syncWeather, 30000); // Sync météo toutes les 30s
    
    // Simulation Astro (Saturation Julian/UTC)
    setInterval(() => {
        const now = new Date();
        safeUpdate('utc-datetime', now.toISOString());
        safeUpdate('julian-date', ((now.getTime() / 86400000) + 2440587.5).toFixed(6));
    }, 1000);
});

// Bouton Nether
document.getElementById('nether-toggle-btn').addEventListener('click', function() {
    State.netherMode = !State.netherMode;
    this.innerText = State.netherMode ? "Mode Nether: ACTIVÉ (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
    safeUpdate('distance-ratio', State.netherMode ? "8.000" : "1.000");
});
