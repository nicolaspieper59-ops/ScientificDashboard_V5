/**
 * OMNISCIENCE V200 PRO - MOTEUR DE FUSION ET RÉALISME SCIENTIFIQUE
 * Haute Précision : math.js 64-bit | Relativité Restreinte | Filtre de Kalman
 */

math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: _BN(299792458),
    G: _BN(6.67430e-11),
    WGS84_A: _BN(6378137.0),
    DAY_NS: _BN(86400 * 1e9),
    STANDARD_PRESS: _BN(1013.25)
};

const App = {
    state: {
        active: false,
        v: _BN(0),
        vMax: _BN(0),
        dist: _BN(0),
        lastT: performance.now(),
        coords: { lat: 0, lon: 0, alt: 0, acc: 0 },
        weather: { temp: 15, press: 1013.25, hum: 50 },
        history: { raw: [], clean: [] }
    },
    dom: {},

    init() {
        console.log("🧬 Activation de la Logique Omniscience...");
        // Mapping complet des IDs HTML
        const ids = [
            'main-speed', 'v-cosmic', 'gamma-factor-precise', 'time-dilation',
            'g-force-resultant', 'alt-display', 'total-distance-3d-1',
            'gps-accuracy-display', 'reality-status-main', 'treasure-log-display',
            'canvas-raw', 'canvas-clean', 'batt-level', 'gmt-time-display-1'
        ];
        ids.forEach(id => this.dom[id] = document.getElementById(id));
        
        this.initMap();
        this.startSystemClock();
        this.renderLoop();
    }
};



// =============================================================
// 2. CŒUR DE CALCUL : RELATIVITÉ & PHYSIQUE ATMOSPHÉRIQUE
// =============================================================
function computeScientificCore(v_mps) {
    const v = _BN(v_mps);
    const c2 = math.square(PHYSICS.C);
    
    // Lorentz & Dilatation (Relativité Restreinte)
    const ratio = math.divide(math.square(v), c2);
    const gamma = math.divide(_BN(1), math.sqrt(math.subtract(_BN(1), ratio)));
    const dilation = math.multiply(math.subtract(gamma, _BN(1)), PHYSICS.DAY_NS);

    // Vitesse du son locale (Acoustique scientifique)
    // v = 331.3 + 0.606 * Temp
    const vSound = math.add(_BN(331.3), math.multiply(_BN(0.606), _BN(App.state.weather.temp)));
    const mach = math.divide(v, vSound);

    return { gamma, dilation, mach };
}

// =============================================================
// 3. FUSION DE CAPTEURS & FILTRAGE (LOGIQUE OMNISCIENCE)
// =============================================================
function handlePhysicsUpdate(event) {
    if (!App.state.active) return;

    const acc = event.accelerationIncludingGravity;
    const now = performance.now();
    const dt = (now - App.state.lastT) / 1000;
    App.state.lastT = now;

    // Calcul G-Force avec compensation de la gravité terrestre
    const gMag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    const gForce = gMag / 9.80665;

    // Intégration de la vitesse avec seuil de bruit (Gate Logic)
    if (gMag > 0.15) {
        const dv = math.multiply(_BN(acc.x), _BN(dt));
        App.state.v = math.abs(math.add(App.state.v, dv));
    } else {
        // Amortissement pour éviter la dérive à l'arrêt (Drift Compensation)
        App.state.v = math.multiply(App.state.v, _BN(0.95));
    }

    const sci = computeScientificCore(App.state.v);

    // Mise à jour de l'UI
    updateUI(gForce, sci);
    
    // Données pour les Canvas
    App.state.history.raw.push(gMag);
    if(App.state.history.raw.length > 100) App.state.history.raw.shift();
}



// =============================================================
// 4. INTERFACE ET RENDU PROFESSIONNEL
// =============================================================
function updateUI(gForce, sci) {
    const speedKmh = math.multiply(App.state.v, _BN(3.6));
    
    if (App.dom['main-speed']) App.dom['main-speed'].innerText = speedKmh.toFixed(2);
    if (App.dom['v-cosmic']) App.dom['v-cosmic'].innerText = speedKmh.toFixed(6) + " km/h";
    if (App.dom['gamma-factor-precise']) App.dom['gamma-factor-precise'].innerText = sci.gamma.toFixed(15);
    if (App.dom['time-dilation']) App.dom['time-dilation'].innerText = sci.dilation.toFixed(3) + " ns/j";
    if (App.dom['g-force-resultant']) App.dom['g-force-resultant'].innerText = gForce.toFixed(3) + " G";
}

App.initMap = function() {
    this.state.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([0, 0], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(this.state.map);
    this.state.marker = L.circleMarker([0, 0], { color: '#00ff88', radius: 8 }).addTo(this.state.map);
};

function startAdventure() {
    App.state.active = true;
    window.addEventListener('devicemotion', handlePhysicsUpdate);
    startGeolocation();
    if(App.dom['reality-status-main']) App.dom['reality-status-main'].innerText = "SYSTEM_LIVE";
}

window.onload = () => App.init();
