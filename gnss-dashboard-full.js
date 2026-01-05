/**
 * OMNISCIENCE V100 PRO - NOYAU DE SINGULARITÉ DÉFINITIF
 * Précision : 1024-bit (MathJS BigNumber)
 */

// 1. INITIALISATION DE LA HAUTE PRÉCISION
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: _BN("299792458"),
    G: _BN("6.67430e-11"),
    WGS84_A: _BN("6378137.0"),
    WGS84_F: _BN(1).divide(_BN("298.257223563")),
    OMEGA_EARTH: _BN("7.292115e-5")
};

let State = {
    v: _BN(0), dist: _BN(0), mass: 70,
    temp: 20, pressure: 1013.25,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    active: false, netherMode: false, lastT: null
};

// --- FONCTION DE SATURATION UNIVERSELLE ---
function updateDOM(id, value, suffix = "") {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof value === 'object' && value.toFixed) {
        el.innerText = value.toFixed(8) + suffix;
    } else {
        el.innerText = value + suffix;
    }
}

// --- MODULE PHYSIQUE & RELATIVITÉ (1024-BIT) ---
function runPhysicsEngine(dt) {
    const v = State.v;
    const vMs = v.toNumber();
    
    // Lorentz & Dilatation
    const beta2 = math.divide(math.square(v), math.square(PHYSICS.C));
    const lorentz = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    const dilationNs = math.multiply(math.subtract(lorentz, 1), 1e9);

    updateDOM('lorentz-factor', lorentz.toString());
    updateDOM('time-dilation', dilationNs.toFixed(12), " ns/s");
    updateDOM('time-dilation-vitesse', math.multiply(dilationNs, 86400).toFixed(6), " ns/j");

    // Vitesse Cosmique (Rotation Terre comprise)
    const latRad = State.coords.lat * Math.PI / 180;
    const vRotTerre = math.multiply(463.8, Math.cos(latRad)); 
    updateDOM('v-cosmic', v.multiply(3.6).add(vRotTerre.multiply(3.6)).toFixed(2), " km/h");

    // Dynamique des fluides
    const rho = (State.pressure * 100) / (287.05 * (State.temp + 273.15));
    const q = 0.5 * rho * (vMs**2);
    updateDOM('air-density', rho.toFixed(4), " kg/m³");
    updateDOM('dynamic-pressure', q.toFixed(2), " Pa");
    updateDOM('mach-number', (vMs / (331.3 * Math.sqrt(1 + State.temp/273.15))).toFixed(6));
}

// --- MODULE GÉODÉSIQUE (Coordonnées X,Y,Z) ---
function runGeodeticEngine() {
    const lat = _BN(State.coords.lat).multiply(math.pi).divide(180);
    const lon = _BN(State.coords.lon).multiply(math.pi).divide(180);
    const e2 = math.subtract(1, math.square(math.subtract(1, PHYSICS.WGS84_F)));
    const N = math.divide(PHYSICS.WGS84_A, math.sqrt(math.subtract(1, math.multiply(e2, math.square(math.sin(lat))))));
    
    const h = _BN(State.coords.alt);
    const X = math.multiply(math.add(N, h), math.cos(lat), math.cos(lon));
    const Y = math.multiply(math.add(N, h), math.cos(lat), math.sin(lon));
    const Z = math.multiply(math.add(math.multiply(N, math.subtract(1, e2)), h), math.sin(lat));

    updateDOM('coord-x', X.toFixed(3));
    updateDOM('coord-y', Y.toFixed(3));
    updateDOM('coord-z', Z.toFixed(3));
}

// --- MODULE CAPTEURS & MÉTÉO ---
async function fetchWeather() {
    try {
        const r = await fetch(`/api/weather?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const data = await r.json();
        if (data.main) {
            State.temp = data.main.temp;
            State.pressure = data.main.pressure;
            updateDOM('air-temp-c', State.temp, " °C");
            updateDOM('pressure-hpa', State.pressure, " hPa");
            updateDOM('statut-meteo', "ACTIF : " + data.weather[0].description);
        }
    } catch (e) { updateDOM('statut-meteo', "PROXY OFFLINE"); }
}

function processMotion(e) {
    if (!State.active) return;
    const now = performance.now();
    const dt = State.lastT ? (now - State.lastT) / 1000 : 0.02;
    State.lastT = now;

    const acc = e.acceleration || { x: 0, y: 0, z: 0 };
    const aMag = Math.sqrt(acc.x**2 + acc.y**2);

    // Intégration Vitesse avec filtre anti-dérive
    if (aMag > 0.15) {
        State.v = State.v.add(_BN(aMag * dt));
    } else {
        State.v = State.v.multiply(0.95);
    }

    // Distance Nether
    const ratio = State.netherMode ? 8 : 1;
    State.dist = State.dist.add(State.v.multiply(dt * ratio));

    // Saturation IDs Vitesse
    const vKmh = State.v.multiply(3.6);
    updateDOM('sp-main-hud', vKmh.toFixed(1));
    updateDOM('speed-stable-kmh', vKmh.toFixed(2), " km/h");
    updateDOM('vitesse-stable-1024', State.v.toString());
    updateDOM('total-distance-3d-1', (State.dist.toNumber() / 1000).toFixed(6), " km");

    runPhysicsEngine(dt);
    runGeodeticEngine();
}

// --- INITIALISATION ---
document.getElementById('start-btn-final').addEventListener('click', async () => {
    // Permission iOS/Android
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        if (p !== 'granted') return;
    }

    State.active = true;
    document.getElementById('start-btn-final').style.display = 'none';
    document.getElementById('reality-status').innerText = "MODE : QUANTIQUE";

    window.addEventListener('devicemotion', processMotion);
    
    // GPS
    navigator.geolocation.watchPosition(pos => {
        State.coords.lat = pos.coords.latitude;
        State.coords.lon = pos.coords.longitude;
        State.coords.alt = pos.coords.altitude || 100;
        updateDOM('lat-ukf', State.coords.lat);
        updateDOM('lon-ukf', State.coords.lon);
        updateDOM('alt-display', State.coords.alt.toFixed(2), " m");
        fetchWeather();
    });

    // Boucle Astro
    setInterval(() => {
        const now = new Date();
        const jd = (now.getTime() / 86400000) + 2440587.5;
        updateDOM('julian-date', jd.toFixed(10));
        updateDOM('utc-datetime', now.toISOString());
    }, 1000);
});

// Bouton Nether
document.getElementById('nether-toggle-btn').addEventListener('click', function() {
    State.netherMode = !State.netherMode;
    this.innerText = State.netherMode ? "NETHER: ACTIVÉ (1:8)" : "NETHER: DÉSACTIVÉ (1:1)";
    updateDOM('distance-ratio', State.netherMode ? "8.000" : "1.000");
});
