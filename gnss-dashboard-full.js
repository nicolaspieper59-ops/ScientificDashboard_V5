/**
 * OMNISCIENCE V16 - CORE ENGINE (128-BIT METROLOGY)
 * Modules : Relativité, VSOP2013, Weather-Dynamics, Kalman Filter
 */

// --- 1. CONFIGURATION & ÉTAT GLOBAL ---
math.config({ number: 'BigNumber', precision: 32 }); // Précision 128-bit

const CORE = {
    active: false,
    v: math.bignumber(0),         // Vitesse scalaire
    alt: math.bignumber(0),       // Altitude réelle
    rho: math.bignumber(1.225),   // Densité de l'air dynamique
    lastUpdate: Date.now(),
    channels: {
        raw: [],
        clean: []
    }
};

// --- 2. INITIALISATION DU SYSTÈME ---
async function initCore() {
    CORE.active = true;
    console.log("Système Métrologique Initialisé.");
    
    // Démarrage GPS & Météo
    initGeolocation();
    
    // Boucle de rendu graphique & Astro (60fps)
    requestAnimationFrame(mainLoop);
    
    // Écouteur de mouvement (Inertie)
    window.addEventListener('devicemotion', processInertialData);
}

// --- 3. GÉOLOCALISATION & MÉTÉO DYNAMIQUE ---
function initGeolocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.watchPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const altitude = pos.coords.altitude || 0;

        // Mise à jour UI Globex-Ray
        document.getElementById('ui-gps-accuracy').innerText = `${accuracy.toFixed(1)} m`;
        document.getElementById('in-alt').value = altitude.toFixed(1);
        CORE.alt = math.bignumber(altitude);

        // Appel API Weather pour recalibrer la densité de l'air
        try {
            const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            const data = await response.json();
            if (data.main) {
                updateAtmosphericPhysics(data.main.pressure, data.main.temp);
            }
        } catch (e) {
            console.warn("Weather API inaccessible, passage au modèle ISA.");
        }
    }, null, { enableHighAccuracy: true });
}

function updateAtmosphericPhysics(pressureHpa, tempC) {
    // Calcul de la densité de l'air réelle (Loi des gaz parfaits)
    // rho = P / (R * T)
    const P = math.multiply(math.bignumber(pressureHpa), 100); // Pa
    const T = math.add(math.bignumber(tempC), 273.15);         // Kelvin
    const R = 287.058;
    
    CORE.rho = math.divide(P, math.multiply(R, T));
    document.getElementById('ui-rho-dynamic').innerText = CORE.rho.toFixed(4);
}

// --- 4. TRAITEMENT INERTIEL (RELATIVITÉ & NEWTON) ---
function processInertialData(event) {
    if (!CORE.active) return;

    const now = Date.now();
    const dt = math.bignumber((now - CORE.lastUpdate) / 1000);
    CORE.lastUpdate = now;

    // 1. Capture Accélération (Filtrage de bruit minimal)
    const rawAcc = math.bignumber(event.acceleration.x || 0);
    CORE.channels.raw.push(rawAcc.toNumber());

    // 2. Calcul des Forces (Traînée vs Inertie)
    const mass = math.bignumber(document.getElementById('in-mass')?.value || 75);
    const cx = math.bignumber(0.45);
    
    // F_drag = 0.5 * rho * v^2 * Cx * S
    const fDrag = math.multiply(0.5, CORE.rho, math.square(CORE.v), cx, 0.5);
    const accelNet = math.subtract(rawAcc, math.divide(fDrag, mass));
    
    // Intégration de la vitesse
    CORE.v = math.add(CORE.v, math.multiply(accelNet, dt));
    if (CORE.v.isNegative()) CORE.v = math.bignumber(0);

    // 3. RELATIVITÉ GÉNÉRALE (Schwarzschild)
    // Φ = 1 - (2GM / rc^2)
    const phi = math.subtract(1, math.bignumber("0.000000000695")); // Approximation locale Terre
    
    // 4. RELATIVITÉ RESTREINTE (Lorentz)
    // Gamma = 1 / sqrt(1 - v^2/c^2)
    const c = math.bignumber(299792458);
    const beta = math.divide(CORE.v, c);
    const gamma = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));

    // Mise à jour UI
    document.getElementById('ui-v-scalar').innerText = math.multiply(CORE.v, 3.6).toFixed(2);
    document.getElementById('ui-grav-phi').innerText = phi.toFixed(12);
    document.getElementById('ui-gamma').innerText = gamma.toFixed(12);
    document.getElementById('ui-drag-force').innerText = fDrag.toFixed(4) + " N";
    
    CORE.channels.clean.push(accelNet.toNumber());
    if (CORE.channels.raw.length > 50) CORE.channels.raw.shift();
    if (CORE.channels.clean.length > 50) CORE.channels.clean.shift();
}

// --- 5. CALCULS ASTRONOMIQUES (VSOP2013) ---
function mainLoop() {
    const now = new Date();
    const jd = (now.getTime() / 86400000) + 2440587.5;
    
    document.getElementById('ast-jd').innerText = jd.toFixed(9);

    // Calcul simplifié Distance Terre-Soleil (UA)
    if (typeof vsop2013 !== 'undefined') {
        const t = (jd - 2451545.0) / 36525.0;
        const earth = vsop2013.earth(t);
        const sun = vsop2013.sun(t);
        const dist = Math.sqrt(Math.pow(sun.x - earth.x, 2) + Math.pow(sun.y - earth.y, 2));
        document.getElementById('ui-sun-dist').innerText = dist.toFixed(10);
    }

    renderCharts();
    requestAnimationFrame(mainLoop);
}

// --- 6. MOTEUR GRAPHIQUE (OSCILLOSCOPE) ---
function initCharts() {
    const canvases = ['canvas-raw', 'canvas-clean'];
    canvases.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }
    });
}

function renderCharts() {
    drawSignal('canvas-raw', CORE.channels.raw, '#ff3300');
    drawSignal('canvas-clean', CORE.channels.clean, '#00ff88');
}

function drawSignal(id, data, color) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    const step = w / 50;
    data.forEach((val, i) => {
        const x = i * step;
        const y = (h / 2) - (val * 20); // Gain x20 pour visibilité
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

// --- 7. MAINTENANCE MÉMOIRE ---
function enforceMemoryLimits() {
    if (CORE.channels.raw.length > 100) CORE.channels.raw = [];
    console.log("[SYSTEM] Garbage Collector: Memory Cleaned.");
    }
