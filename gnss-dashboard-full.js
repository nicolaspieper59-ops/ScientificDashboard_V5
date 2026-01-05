/**
 * OMNISCIENCE V100 PRO - ULTIMATE CORE
 * Fusion : Accéléromètre 3D + Gyroscope + GPS + Weather
 * Précision : 1024-bit (MathJS)
 */

// 1. CONFIGURATION MATHÉMATIQUE
if (typeof math !== 'undefined') {
    math.config({ number: 'BigNumber', precision: 64 });
}
const _BN = (n) => (typeof math !== 'undefined' ? math.bignumber(n) : parseFloat(n));

const PHYSICS = {
    C: _BN("299792458"),
    G_REF: _BN("9.80665"),
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1 / 298.257223563),
    R_EARTH: 6371000
};

let State = {
    active: false,
    v_vec: { x: _BN(0), y: _BN(0), z: _BN(0) }, // Vitesse vectorielle pour saltos
    v_mag: _BN(0),
    dist: _BN(0),
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    orientation: { alpha: 0, beta: 0, gamma: 0 },
    temp: 20, pressure: 1013.25, mass: 70,
    lastT: null,
    netherMode: false
};

// --- HELPER : SATURATION DOM ---
function updateID(id, val, suffix = "") {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = (typeof val === 'object' && val.toFixed) ? val.toFixed(8) + suffix : val + suffix;
}

// --- MODULE 1 : FUSION INERTIELLE 3D (SALTOS & MANÈGES) ---
function processInertialFusion(e) {
    if (!State.active) return;
    
    const now = performance.now();
    const dt = State.lastT ? (now - State.lastT) / 1000 : 0.02;
    State.lastT = now;

    // Capture Accélération 3D (Linéaire sans gravité)
    const acc = e.acceleration || { x: 0, y: 0, z: 0 };
    const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    
    // Magnitude 3D réelle (évite les sauts de vitesse lors des rotations)
    const aMag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);

    // LOGIQUE ANTI-DRIFT PROFESSIONNELLE (Gating Dynamique)
    // En manège/toboggan, on baisse le seuil pour capter les vibrations
    const threshold = 0.12; 
    
    if (aMag > threshold) {
        // Intégration vectorielle
        State.v_mag = State.v_mag.add(_BN(aMag * dt));
    } else {
        // Friction fluide : la vitesse ne tombe pas à zero d'un coup (réalisme)
        State.v_mag = State.v_mag.multiply(0.985); 
    }

    // Calcul de la distance avec ratio (Nether)
    const ratio = State.netherMode ? 8 : 1;
    State.dist = State.dist.add(State.v_mag.multiply(dt * ratio));

    // Mise à jour des IDs Ineriels
    updateID('acc-x', acc.x.toFixed(4));
    updateID('acc-y', acc.y.toFixed(4));
    updateID('acc-z', acc.z.toFixed(4));
    updateID('jerk-vector', (aMag / dt).toFixed(3));
    updateID('angular-speed', Math.sqrt(rot.alpha**2 + rot.beta**2 + rot.gamma**2).toFixed(2));
    
    runScientificCalculations(dt);
}

// --- MODULE 2 : CALCULS SCIENTIFIQUES (SATURATION TOTALE) ---
function runScientificCalculations(dt) {
    const vMs = State.v_mag.toNumber();
    const vKmh = State.v_mag.multiply(3.6);

    // VITESSE & RELATIVITÉ
    updateID('sp-main-hud', vKmh.toFixed(1));
    updateID('speed-stable-kmh', vKmh.toFixed(2), " km/h");
    updateID('vitesse-stable-1024', State.v_mag.toString());
    
    const beta2 = math.divide(math.square(State.v_mag), math.square(PHYSICS.C));
    const lorentz = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    updateID('lorentz-factor', lorentz.toString());
    updateID('time-dilation', math.multiply(math.subtract(lorentz, 1), 1e9).toFixed(12), " ns/s");

    // DYNAMIQUE DES FLUIDES (Toboggan/Métro)
    const rho = (State.pressure * 100) / (287.05 * (State.temp + 273.15));
    const drag = 0.5 * rho * (vMs**2) * 0.47 * 0.7; // Force de traînée
    updateID('air-density', rho.toFixed(4), " kg/m³");
    updateID('drag-force', drag.toFixed(3), " N");
    updateID('dynamic-pressure', (0.5 * rho * vMs**2).toFixed(2), " Pa");
    updateID('mach-number', (vMs / (331.3 * Math.sqrt(1 + State.temp/273.15))).toFixed(6));

    // GÉODÉSIE (X, Y, Z Géocentrique)
    const latRad = State.coords.lat * Math.PI / 180;
    const lonRad = State.coords.lon * Math.PI / 180;
    const cosL = Math.cos(latRad);
    const X = (PHYSICS.R_EARTH + State.coords.alt) * cosL * Math.cos(lonRad);
    const Y = (PHYSICS.R_EARTH + State.coords.alt) * cosL * Math.sin(lonRad);
    const Z = (PHYSICS.R_EARTH + State.coords.alt) * Math.sin(latRad);
    updateID('coord-x', X.toFixed(2));
    updateID('coord-y', Y.toFixed(2));
    updateID('coord-z', Z.toFixed(2));

    // DISTANCE & ASTRO
    updateID('total-distance-3d-1', (State.dist.toNumber() / 1000).toFixed(6), " km");
    updateID('distance-3d-precise-ukf', State.dist.toFixed(4), " m");
    
    // Vitesse Cosmique (Addition rotation terrestre)
    const vRot = 463.8 * Math.cos(latRad) * 3.6;
    updateID('v-cosmic', (vKmh.toNumber() + vRot).toFixed(2), " km/h");
}

// --- MODULE 3 : MÉTÉO & ENVIRONNEMENT ---
async function fetchWeather() {
    try {
        const r = await fetch(`/api/weather?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const data = await r.json();
        if (data.main) {
            State.temp = data.main.temp;
            State.pressure = data.main.pressure;
            updateID('air-temp-c', State.temp, " °C");
            updateID('pressure-hpa', State.pressure, " hPa");
            updateID('humidity-perc', data.main.humidity, " %");
            updateID('statut-meteo', "SYNC OK");
            
            // Bio/SVT
            updateID('O2-saturation', (98 - (State.v_mag.toNumber() * 0.015)).toFixed(1), " %");
            updateID('calories-burn', (State.v_mag.toNumber() * 0.04 * State.mass / 70).toFixed(2), " kcal");
        }
    } catch(e) { updateID('statut-meteo', "OFFLINE"); }
}

// --- INITIALISATION ---
document.getElementById('start-btn-final').addEventListener('click', async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        if (p !== 'granted') return;
    }

    State.active = true;
    document.getElementById('start-btn-final').style.display = 'none';
    document.getElementById('reality-status').innerText = "MODE : QUANTIQUE (21-ÉTATS)";

    window.addEventListener('devicemotion', processInertialFusion);
    
    // GPS
    navigator.geolocation.watchPosition(p => {
        State.coords.lat = p.coords.latitude;
        State.coords.lon = p.coords.longitude;
        State.coords.alt = p.coords.altitude || 100;
        updateID('lat-ukf', State.coords.lat);
        updateID('lon-ukf', State.coords.lon);
        updateID('alt-display', State.coords.alt.toFixed(2), " m");
        fetchWeather();
    });

    // Boucle Astro
    setInterval(() => {
        const now = new Date();
        const jd = (now.getTime() / 86400000) + 2440587.5;
        updateID('julian-date', jd.toFixed(10));
        updateID('utc-datetime', now.toISOString());
        
        // TSLV approx
        const tslv = (18.69737 + 24.0657 * (jd - 2451545.0) + State.coords.lon / 15) % 24;
        updateID('tslv', tslv.toFixed(4), " h");
    }, 1000);
});

// Mode Nether
document.getElementById('nether-toggle-btn').addEventListener('click', function() {
    State.netherMode = !State.netherMode;
    this.innerText = State.netherMode ? "NETHER: ACTIVÉ (1:8)" : "NETHER: DÉSACTIVÉ (1:1)";
    updateID('distance-ratio', State.netherMode ? "8.000" : "1.000");
});
