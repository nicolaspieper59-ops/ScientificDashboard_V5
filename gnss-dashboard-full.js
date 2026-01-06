/**
 * OMNISCIENCE V200 - MOTEUR DE SATURATION
 * Objectif : 0% de valeurs nulles (--).
 * Intègre : Physique Relativiste, Astro Mathématique, Fusion IMU.
 */

math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: 299792458,
    G: 6.67430e-11,
    RS_CONST: 1.485e-27, // 2G/c²
    WGS84_A: 6378137.0,
    WGS84_F: 1 / 298.257223563
};

let State = {
    active: false,
    v: 0,
    dist: 0,
    coords: { lat: 48.8566, lon: 2.3522, alt: 100 }, // Paris par défaut
    temp: 15, press: 1013.25,
    mass: 70,
    startTime: Date.now(),
    lastT: performance.now(),
    map: null, marker: null
};

// --- HELPER UNIVERSEL ---
const safeSet = (id, val, suffix = "") => {
    const el = document.getElementById(id);
    if (el) el.innerText = val + suffix;
};

// =============================================================
// 1. BOUCLE PRINCIPALE (10Hz) - Gère Astro & Physique statique
// =============================================================
function runCoreLoop() {
    const now = new Date();
    
    // --- ASTRO (Maths pures) ---
    const JD = (now.getTime() / 86400000) + 2440587.5;
    const D = JD - 2451545.0;
    
    // Temps Sidéral
    const GMST = 18.697374558 + 24.06570982441908 * D;
    const TSLV = ((GMST + State.coords.lon / 15) % 24 + 24) % 24;
    
    safeSet('utc-datetime', now.toISOString().split('T')[1].split('.')[0]);
    safeSet('julian-date', JD.toFixed(5));
    safeSet('tslv', TSLV.toFixed(4) + " h");

    // Soleil (Position Approx)
    const g = (357.529 + 0.98560028 * D) % 360;
    const q = (280.459 + 0.98564736 * D) % 360;
    const L = (q + 1.915 * Math.sin(g * Math.PI/180)) % 360;
    const dec = Math.asin(Math.sin(L * Math.PI/180) * Math.sin(23.439 * Math.PI/180)) * 180/Math.PI;
    const ha = (TSLV * 15) - q;
    
    const latRad = State.coords.lat * Math.PI/180;
    const decRad = dec * Math.PI/180;
    const haRad = ha * Math.PI/180;
    const altRad = Math.asin(Math.sin(latRad)*Math.sin(decRad) + Math.cos(latRad)*Math.cos(decRad)*Math.cos(haRad));
    
    safeSet('hud-sun-alt', (altRad * 180/Math.PI).toFixed(2) + "°");
    safeSet('sun-azimuth', ((ha + 180) % 360).toFixed(2) + "°");

    // --- PHYSIQUE & RELATIVITÉ (Saturation) ---
    // Rayon de Schwarzschild (Rs = 2GM/c²)
    // Pour 70kg : approx 1.04e-25 m
    const mass = parseFloat(document.getElementById('mass-input')?.value || 70);
    const Rs = mass * PHYSICS.RS_CONST;
    safeSet('schwarzschild-radius', Rs.toExponential(4) + " m");

    // Dilatation Temporelle (Lorentz)
    // Même à v=0, on affiche 0.00
    const beta = State.v / PHYSICS.C;
    let lorentz = 1;
    if(beta < 1) lorentz = 1 / Math.sqrt(1 - beta*beta);
    
    safeSet('lorentz-factor', lorentz.toFixed(12));
    // Dilatation en ns/jour : (gamma - 1) * 86400 * 1e9
    const dilDay = (lorentz - 1) * 86400 * 1e9;
    safeSet('time-dilation-vitesse', dilDay.toExponential(3) + " ns/j");
    safeSet('time-dilation', ((lorentz - 1) * 1e9).toFixed(6) + " ns/s");

    // Energie E = mc²
    const E = mass * PHYSICS.C**2 * lorentz;
    safeSet('relativistic-energy', E.toExponential(4) + " J");
    safeSet('rest-mass-energy', (mass * PHYSICS.C**2).toExponential(4) + " J");

    // Fluides
    safeSet('air-temp-c', State.temp.toFixed(2) + " °C");
    safeSet('pressure-hpa', State.press.toFixed(1) + " hPa");
    
    // Position (Si pas de GPS, on affiche celle par défaut)
    if(document.getElementById('lat-ukf').innerText.includes('--')) {
        safeSet('lat-ukf', State.coords.lat.toFixed(6));
        safeSet('lon-ukf', State.coords.lon.toFixed(6));
        safeSet('alt-display', State.coords.alt.toFixed(1) + " m");
    }
}

// =============================================================
// 2. FUSION INERTIELLE (Mouvement)
// =============================================================
function handleMotion(e) {
    if (!State.active) return;
    const now = performance.now();
    const dt = (now - State.lastT) / 1000;
    State.lastT = now;

    let acc = e.acceleration || {x:0, y:0, z:0};
    if (!acc.x && e.accelerationIncludingGravity) {
        acc.x = e.accelerationIncludingGravity.x;
        acc.y = e.accelerationIncludingGravity.y;
        acc.z = e.accelerationIncludingGravity.z - 9.81;
    }

    // Affichage IMU
    safeSet('acc-x', (acc.x || 0).toFixed(3));
    safeSet('acc-y', (acc.y || 0).toFixed(3));
    safeSet('acc-z', (acc.z || 0).toFixed(3));

    // Calcul Vitesse
    const mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    if (mag > 0.15) { 
        State.v += mag * dt;
    } else {
        State.v *= 0.99; // Friction
    }
    
    // Distance 3D (Intégration)
    State.dist += State.v * dt;
    
    // Mises à jour UI
    const vKmh = State.v * 3.6;
    safeSet('sp-main-hud', vKmh.toFixed(2));
    safeSet('speed-stable-kmh', vKmh.toFixed(2) + " km/h");
    safeSet('speed-stable-ms', State.v.toFixed(4) + " m/s");
    safeSet('total-distance-3d-1', (State.dist / 1000).toFixed(4) + " km");
    safeSet('distance-3d-precise-ukf', State.dist.toFixed(3) + " m");

    // Force G
    const gForce = Math.sqrt((acc.x/9.81)**2 + (acc.y/9.81)**2 + ((acc.z+9.81)/9.81)**2);
    safeSet('g-force-resultant', gForce.toFixed(3) + " G");

    // Vitesse Son
    const vSound = 331.3 + 0.6 * State.temp;
    safeSet('vitesse-son-cor', vSound.toFixed(2) + " m/s");
    safeSet('mach-number', (State.v / vSound).toFixed(4));
    safeSet('perc-speed-sound', ((State.v / vSound)*100).toFixed(2) + " %");

    drawTelemetry(vKmh);
}

// =============================================================
// INIT & EVENTS
// =============================================================
document.getElementById('start-btn-final').addEventListener('click', async () => {
    State.active = true;
    State.lastT = performance.now();
    
    const btn = document.getElementById('start-btn-final');
    btn.innerText = "NOYAU ACTIF";
    btn.style.background = "#ffcc00"; // Jaune actif
    btn.style.color = "#000";

    // Carte
    if (!State.map) {
        State.map = L.map('map').setView([State.coords.lat, State.coords.lon], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(State.map);
    }

    // Permissions
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch(e){}
    }
    window.addEventListener('devicemotion', handleMotion);

    // GPS (Si dispo)
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(p => {
            State.coords.lat = p.coords.latitude;
            State.coords.lon = p.coords.longitude;
            State.coords.alt = p.coords.altitude || 0;
            
            // Mise à jour des champs GPS
            safeSet('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
            safeSet('lat-ukf', p.coords.latitude.toFixed(6));
            safeSet('lon-ukf', p.coords.longitude.toFixed(6));
            safeSet('alt-display', (p.coords.altitude || 0).toFixed(1) + " m");
            
            // ECEF (Géocentrique)
            updateECEF();

            if(!State.marker) State.marker = L.marker([State.coords.lat, State.coords.lon]).addTo(State.map);
            else State.marker.setLatLng([State.coords.lat, State.coords.lon]);
        }, err => console.log("GPS Waiting..."), { enableHighAccuracy: true });
    }

    // Lancement Loop
    setInterval(runCoreLoop, 100); 
    runCoreLoop();
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

// Télémétrie
const ctx = document.getElementById('telemetry-canvas').getContext('2d');
let hist = [];
function drawTelemetry(val) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    hist.push(val);
    if(hist.length > w) hist.shift();
    
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#00ff88'; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0; i<hist.length; i++) {
        const y = h - (hist[i] / 20 * h); // Echelle 0-20 km/h
        ctx.lineTo(i, y);
    }
    ctx.stroke();
    }
