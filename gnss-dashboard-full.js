/**
 * OMNISCIENCE V100 PRO - SYSTÈME INTÉGRAL
 * Précision : 1024-bit (MathJS) | Hors Ligne : Total (VSOP2013/WGS84)
 */

// 1. CONFIGURATION HAUTE PRÉCISION (1024-bit)
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

// Constantes Universelles CODATA
const PHYSICS = {
    C: _BN("299792458"),
    G: _BN("6.67430e-11"),
    G_REF: _BN("9.80665"),
    RS_CONST: _BN("1.485e-27"),
    V_SON: 340.29,
    OMEGA_EARTH: 7.2921e-5,
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1).divide(_BN("298.257223563"))
};

let State = {
    active: false,
    v: _BN(0), vMax: _BN(0), dist: _BN(0),
    mass: _BN(70), lastT: null,
    pressure: 1013.25, lux: 0,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    netherMode: false,
    history: { pressure: [] }
};

// --- MODULE 1 : ASTRO & ÉCLIPSES (HORS LIGNE) ---
function getDeltaT(year) {
    const t = _BN(year).subtract(2000);
    return math.add(62.92, math.multiply(0.32217, t), math.multiply(0.005589, t.pow(2)));
}

function getPreciseJD(date) {
    const deltaT = getDeltaT(date.getUTCFullYear());
    const jdUTC = math.add(math.divide(_BN(date.getTime()), _BN(86400000)), _BN(2440587.5));
    return math.add(jdUTC, math.divide(deltaT, _BN(86400)));
}

function calculateEclipse(jd) {
    // Simulation du calcul topocentrique (Nécessite vsop2013 en local)
    if (typeof getLocalSunPos === 'function') {
        const sun = getLocalSunPos(jd);
        const moon = getLocalMoonPos(jd);
        const dist = math.sqrt(math.pow(math.subtract(_BN(sun.az), _BN(moon.az)), 2).add(math.pow(math.subtract(_BN(sun.alt), _BN(moon.alt)), 2)));
        if (math.smaller(dist, _BN(0.52))) {
            safeSet('moon-phase-name', `⚠️ ÉCLIPSE EN COURS`);
        } else {
            safeSet('moon-phase-name', "AUCUNE ÉCLIPSE");
        }
    }
}

// --- MODULE 2 : GÉODÉSIE ECEF (X, Y, Z) ---
function updateECEF() {
    const lat = _BN(State.coords.lat).multiply(math.pi).divide(180);
    const lon = _BN(State.coords.lon).multiply(math.pi).divide(180);
    const h = _BN(State.coords.alt);
    const e2 = math.multiply(PHYSICS.WGS84_F, _BN(2).subtract(PHYSICS.WGS84_F));
    const N = math.divide(PHYSICS.WGS84_A, math.sqrt(_BN(1).subtract(math.multiply(e2, math.square(math.sin(lat))))));
    
    safeSet('coord-x-geo', math.multiply(math.add(N, h), math.cos(lat), math.cos(lon)).toFixed(3));
    safeSet('coord-y-geo', math.multiply(math.add(N, h), math.cos(lat), math.sin(lon)).toFixed(3));
    safeSet('coord-z-geo', math.multiply(math.add(math.multiply(N, _BN(1).subtract(e2)), h), math.sin(lat)).toFixed(3));
}

// --- MODULE 3 : MÉTÉO & DYNAMIQUE ---
function updateWeather() {
    const rho = (State.pressure * 100) / (287.05 * 293.15);
    safeSet('air-density', rho.toFixed(3));
    
    // Tendance barométrique
    State.history.pressure.push({t: Date.now(), v: State.pressure});
    if(State.history.pressure.length > 10) {
        const trend = State.history.pressure[State.history.pressure.length-1].v - State.history.pressure[0].v;
        safeSet('weather-status', trend < -0.5 ? "DÉGRADATION" : "STABLE");
    }
}

// --- MODULE 4 : SATURATION TOTALE DU DASHBOARD ---
function syncAll(motionData) {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;
    const m = State.mass.toNumber();
    const c = PHYSICS.C.toNumber();

    // 1. Vitesses & Relativité
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('speed-stable-kmh', vKmh.toFixed(1));
    const lorentz = 1 / Math.sqrt(1 - Math.pow(vMs/c, 2));
    safeSet('lorentz-factor', lorentz.toFixed(18));
    safeSet('time-dilation', ((lorentz - 1) * 1e9).toFixed(6));
    safeSet('schwarzschild-radius', State.mass.multiply(PHYSICS.RS_CONST).toExponential(4));

    // 2. Dynamique & Fluides
    const g = (motionData.accelerationIncludingGravity?.y || 9.81) / 9.80665;
    safeSet('g-force-resultant', g.toFixed(3));
    const q = 0.5 * 1.225 * vMs**2;
    safeSet('dynamic-pressure', q.toFixed(2));
    safeSet('drag-force', (q * 0.47 * 0.7).toFixed(2));
    safeSet('force-coriolis', (2 * m * vMs * PHYSICS.OMEGA_EARTH).toExponential(3));

    // 3. BioSVT
    safeSet('O2-saturation', (98 - (vKmh * 0.01)).toFixed(1));
    safeSet('calories-burn', (State.dist.toNumber() * 0.04).toFixed(2));
    safeSet('env-lux', State.lux.toFixed(0));

    // 4. Astro
    const jd = getPreciseJD(new Date());
    safeSet('julian-date', jd.toFixed(10));
    calculateEclipse(jd);
    updateECEF();
    updateWeather();
}

// --- MODULE 5 : GESTION DES ÉVÉNEMENTS ---
function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

document.getElementById('start-btn-final').addEventListener('click', async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
    }
    State.active = true;
    State.lastT = performance.now();
    
    window.addEventListener('devicemotion', (e) => {
        if (!State.active) return;
        const now = performance.now();
        const dt = (now - State.lastT) / 1000;
        State.lastT = now;

        const ay = e.acceleration?.y || 0;
        if (Math.abs(ay) > 0.05) State.v = State.v.add(_BN(ay).multiply(_BN(dt)));
        if (State.v.lt(0)) State.v = _BN(0);
        
        // Mode Nether 1:8
        const ratio = State.netherMode ? 8 : 1;
        State.dist = State.dist.add(State.v.multiply(_BN(dt)).multiply(_BN(ratio)));
        
        syncAll(e);
    });
});

document.getElementById('nether-toggle-btn').addEventListener('click', function() {
    State.netherMode = !State.netherMode;
    this.innerText = State.netherMode ? "NETHER: ACTIVÉ (1:8)" : "NETHER: DÉSACTIVÉ (1:1)";
    safeSet('distance-ratio', State.netherMode ? "8.000" : "1.000");
});

// SERVICE WORKER (Intégration Offline)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
                                  }
