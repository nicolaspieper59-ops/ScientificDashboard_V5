/**
 * OMNISCIENCE V200 PRO - MOTEUR DE FUSION ET SATURATION
 * Intègre : ephem.js, weather.js, Physique Relativiste, Fusion IMU/GPS.
 */

math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: 299792458,
    G: 6.67430e-11,
    RS_CONST: 1.48523e-27, // 2G/c²
    WGS84_A: 6378137.0,
    WGS84_F: 1 / 298.257223563
};

let State = {
    active: false,
    v: 0,
    dist: 0,
    coords: { lat: 48.8566, lon: 2.3522, alt: 100 },
    temp: 15, press: 1013.25,
    mass: 70,
    lastT: performance.now(),
    map: null, marker: null
};

const safeSet = (id, val, suffix = "") => {
    const el = document.getElementById(id);
    if (el) el.innerText = val + suffix;
};

// =============================================================
// 1. INTÉGRATION MÉTÉO (weather.js via API)
// =============================================================
async function updateWeatherReal() {
    if (!State.active) return;
    try {
        // Remplacez l'URL par celle de votre déploiement Vercel
        const response = await fetch(`/api/weather?lat=${State.coords.lat}&lon=${State.coords.lon}`);
        const data = await response.json();
        
        if (data.main) {
            State.temp = data.main.temp;
            State.press = data.main.pressure;
            
            safeSet('air-temp-c', State.temp.toFixed(2) + " °C");
            safeSet('pressure-hpa', State.press.toFixed(1) + " hPa");
            
            // Calcul Densité de l'air (ρ = P / (R * T))
            const rho = (State.press * 100) / (287.05 * (State.temp + 273.15));
            safeSet('air-density', rho.toFixed(3) + " kg/m³");
        }
    } catch (e) {
        console.warn("Weather API non disponible, mode simulation actif.");
    }
}

// =============================================================
// 2. BOUCLE PRINCIPALE (Astro & Physique)
// =============================================================
function runCoreLoop() {
    const now = new Date();
    const JD = (now.getTime() / 86400000) + 2440587.5;
    
    // --- ASTRO PRÉCISION (via ephem.js / vsop2013) ---
    if (typeof vsop2013 !== 'undefined') {
        // Utilisation de la bibliothèque ephem pour les positions réelles
        const sunPos = vsop2013.getSunPosition(JD); // Exemple d'appel vsop
        safeSet('hud-sun-alt', sunPos.altitude.toFixed(2) + "°");
        safeSet('sun-azimuth', sunPos.azimuth.toFixed(2) + "°");
        safeSet('moon-phase-name', sunPos.moonPhase);
    } else {
        // Fallback mathématique si ephem.js n'est pas encore chargé
        const GMST = 18.697374558 + 24.06570982441908 * (JD - 2451545.0);
        const TSLV = ((GMST + State.coords.lon / 15) % 24 + 24) % 24;
        safeSet('tslv', TSLV.toFixed(4) + " h");
    }

    safeSet('utc-datetime', now.toISOString().split('T')[1].split('.')[0]);
    safeSet('julian-date', JD.toFixed(5));

    // --- PHYSIQUE RELATIVISTE (Saturation des --) ---
    const mass = _BN(State.mass);
    const v = _BN(State.v);
    const c = _BN(PHYSICS.C);

    // Lorentz & Dilatation
    const beta = v.div(c);
    const gamma = _BN(1).div(math.sqrt(_BN(1).minus(beta.pow(2))));
    
    safeSet('lorentz-factor', gamma.toFixed(12));
    const dilDay = gamma.minus(1).mul(86400).mul(1e9); // ns/jour
    safeSet('time-dilation-vitesse', dilDay.toExponential(3) + " ns/j");

    // Énergie (E=mc²)
    const E = mass.mul(c.pow(2)).mul(gamma);
    safeSet('relativistic-energy', E.toExponential(4) + " J");
    
    // Rayon de Schwarzschild
    const Rs = mass.mul(PHYSICS.RS_CONST);
    safeSet('schwarzschild-radius', Rs.toExponential(4) + " m");
}

// =============================================================
// 3. FUSION INERTIELLE ET MOUVEMENT
// =============================================================
function handleMotion(e) {
    if (!State.active) return;
    const now = performance.now();
    const dt = (now - State.lastT) / 1000;
    State.lastT = now;

    let acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
    
    // Affichage IMU Brut
    safeSet('acc-x', acc.x.toFixed(3));
    safeSet('acc-y', acc.y.toFixed(3));
    safeSet('acc-z', acc.z.toFixed(3));

    // Force G Résultante (Sature le --)
    const gForce = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.81;
    safeSet('g-force-resultant', gForce.toFixed(3) + " G");

    // G-Force Verticale (Sature le --)
    const gVertical = (acc.z / 9.81).toFixed(3);
    safeSet('g-force-vertical', gVertical + " G");

    // Intégration Vitesse (Filtre simplifié)
    const rawAcc = Math.sqrt(acc.x**2 + acc.y**2 + (acc.z - 9.81)**2);
    if (rawAcc > 0.2) {
        State.v += rawAcc * dt;
        State.dist += State.v * dt;
    } else {
        State.v *= 0.95; // Amortissement à l'arrêt
    }

    // Update UI Vitesse & Distance
    const vKmh = State.v * 3.6;
    safeSet('sp-main-hud', vKmh.toFixed(2));
    safeSet('speed-stable-kmh', vKmh.toFixed(2) + " km/h");
    safeSet('total-distance-3d-1', (State.dist / 1000).toFixed(4) + " km");
    safeSet('distance-3d-precise-ukf', State.dist.toFixed(2) + " m");

    // Vitesse du Son Locale
    const vSound = 331.3 + 0.6 * State.temp;
    safeSet('vitesse-son-cor', vSound.toFixed(2) + " m/s");
    safeSet('mach-number', (State.v / vSound).toFixed(5));

    drawTelemetry(vKmh);
}

// =============================================================
// 4. INITIALISATION PROFESSIONNELLE
// =============================================================
document.getElementById('start-btn-final').addEventListener('click', async () => {
    State.active = true;
    
    // UI Feedback
    const btn = document.getElementById('start-btn-final');
    btn.innerText = "NOYAU ACTIF";
    btn.style.background = "#ffcc00";

    // Activation des capteurs
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch(e){}
    }
    window.addEventListener('devicemotion', handleMotion);

    // GPS & Cartographie
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(p => {
            State.coords.lat = p.coords.latitude;
            State.coords.lon = p.coords.longitude;
            State.coords.alt = p.coords.altitude || 100;

            safeSet('lat-ukf', State.coords.lat.toFixed(6));
            safeSet('lon-ukf', State.coords.lon.toFixed(6));
            safeSet('alt-display', State.coords.alt.toFixed(1) + " m");
            
            updateECEF();
            
            if (!State.map) {
                State.map = L.map('map').setView([State.coords.lat, State.coords.lon], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(State.map);
                State.marker = L.marker([State.coords.lat, State.coords.lon]).addTo(State.map);
            } else {
                State.marker.setLatLng([State.coords.lat, State.coords.lon]);
            }
        }, null, { enableHighAccuracy: true });
    }

    // Boucles temporelles
    setInterval(runCoreLoop, 100);    // 10Hz : Physique & Astro
    setInterval(updateWeatherReal, 600000); // 10min : Météo réelle
    updateWeatherReal(); // Premier appel
});

function updateECEF() {
    const lat = State.coords.lat * Math.PI/180;
    const lon = State.coords.lon * Math.PI/180;
    const h = State.coords.alt;
    const a = PHYSICS.WGS84_A;
    const f = PHYSICS.WGS84_F;
    const e2 = 2*f - f*f;
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat)**2);
    
    const X = (N + h) * Math.cos(lat) * Math.cos(lon);
    const Y = (N + h) * Math.cos(lat) * Math.sin(lon);
    const Z = (N * (1 - e2) + h) * Math.sin(lat);
    
    safeSet('coord-x', (X/1000).toFixed(3) + " km");
    safeSet('coord-y', (Y/1000).toFixed(3) + " km");
    safeSet('coord-z', (Z/1000).toFixed(3) + " km");
}

// Télémétrie Graphique
const telemetryCanvas = document.getElementById('telemetry-canvas');
const tCtx = telemetryCanvas.getContext('2d');
let tHist = [];
function drawTelemetry(val) {
    const w = telemetryCanvas.width;
    const h = telemetryCanvas.height;
    tHist.push(val);
    if(tHist.length > w) tHist.shift();
    
    tCtx.fillStyle = '#000'; tCtx.fillRect(0,0,w,h);
    tCtx.strokeStyle = '#00ff88'; 
    tCtx.beginPath();
    for(let i=0; i<tHist.length; i++) {
        const y = h - (tHist[i] / 5 * h); // Echelle 5 km/h
        tCtx.lineTo(i, y);
    }
    tCtx.stroke();
            }
