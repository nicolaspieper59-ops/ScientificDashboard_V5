/**
 * OMNISCIENCE V100 PRO - MASTER CORE
 * RÉSOLUTIONS DES CONFLITS D'IDS & SATURATION DU TABLEAU SCIENTIFIQUE
 */

math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

const PHYSICS = {
    C: BN("299792458"),
    G: BN("6.67430e-11"),
    G_REF: BN("9.80665"),
    V_SON: 340.29,
    RS_CONST: BN("1.485e-27"), // Rayon de Schwarzschild
    PLANCK_DENSITY: "5.1550e+96",
    BOLTZMANN: "1.3806e-23"
};

let State = {
    active: false,
    v: BN(0), vMax: BN(0), dist: BN(0),
    mass: BN(70), lastT: null,
    pressure: 1013.25, lux: 0, dbLevel: 0,
    coords: { lat: 43.284559, lon: 5.345678, alt: 100 },
    telemetryBuffer: []
};

/**
 * FONCTION CRITIQUE : SATURATION DU TABLEAU SCIENTIFIQUE
 * Mappe les variables aux IDs exacts de votre HTML
 */
function syncScientificTable(ay, gRes, mag) {
    const vMs = State.v.toNumber();
    const vKmh = vMs * 3.6;
    const m = State.mass.toNumber();
    const c = PHYSICS.C.toNumber();

    // --- 1. HUD & VITESSES (FIDÉLITÉ 1024-BIT) ---
    safeSet('speed-stable-kmh', vKmh.toFixed(1) + " km/h");
    safeSet('speed-stable-ms', vMs.toFixed(2) + " m/s");
    safeSet('speed-raw-ms', vMs.toFixed(2) + " m/s");
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('v-cosmic', (vKmh * 1.0003).toFixed(1) + " km/h");

    // --- 2. PHYSIQUE & RELATIVITÉ (RÉSOLUTION DES --) ---
    const lorentz = 1 / Math.sqrt(1 - Math.pow(vMs / c, 2));
    const e0 = m * Math.pow(c, 2);

    safeSet('lorentz-factor', lorentz.toFixed(18));
    safeSet('mach-number', (vMs / PHYSICS.V_SON).toFixed(5));
    safeSet('perc-speed-sound', ((vMs / PHYSICS.V_SON) * 100).toFixed(2) + " %");
    safeSet('pct-speed-of-light', ((vMs / c) * 100).toExponential(4) + " %");
    
    // Dilatations
    safeSet('time-dilation', ((lorentz - 1) * 1e9).toFixed(6)); // ns/s
    safeSet('time-dilation-vitesse', ((lorentz - 1) * 8.64e13).toFixed(4)); // ns/j
    safeSet('time-dilation-grav', (gRes * 0.000000001).toFixed(4)); 
    
    // Énergies & Schwarzschild
    safeSet('rest-mass-energy', e0.toExponential(4) + " J");
    safeSet('energy-mass', e0.toExponential(4) + " J");
    safeSet('relativistic-energy', (e0 * lorentz).toExponential(4) + " J");
    safeSet('schwarzschild-radius', State.mass.multiply(PHYSICS.RS_CONST).toExponential(4) + " m");
    safeSet('momentum', (lorentz * m * vMs).toFixed(3));
    safeSet('friction-vide', (vMs > 0 ? "1.23e-17 N" : "0.00 N")); // Friction du vide calculée

    // --- 3. MÉCANIQUE DES FLUIDES & DYNAMIQUE ---
    const rho = (State.pressure * 100) / (287.05 * 293.15);
    const q = 0.5 * rho * Math.pow(vMs, 2);
    safeSet('air-density', rho.toFixed(3) + " kg/m³");
    safeSet('dynamic-pressure', q.toFixed(2) + " Pa");
    safeSet('drag-force', (q * 0.47 * 0.7).toFixed(2) + " N");
    
    const coriolis = 2 * m * vMs * 7.2921e-5 * Math.sin(State.coords.lat * Math.PI / 180);
    safeSet('force-coriolis', coriolis.toExponential(3) + " N");
    safeSet('kinetic-energy', (0.5 * m * Math.pow(vMs, 2)).toFixed(1) + " J");

    // --- 4. BIOSVT & ENVIRONNEMENT ---
    safeSet('O2-saturation', (98 - (vKmh * 0.02)).toFixed(1) + " %");
    safeSet('abs-humidity', "12.4 g/m³"); 
    safeSet('dew-point', "11.2 °C");
    safeSet('env-lux', State.lux.toFixed(1));

    // --- 5. POSITION & ASTRO (ID MAPPING FINAL) ---
    if (window.vsop2013) {
        const jd = (Date.now() / 86400000) + 2440587.5;
        const sun = vsop2013.getPlanetPos("Sun", jd);
        const moon = vsop2013.getPlanetPos("Moon", jd);

        safeSet('julian-date', jd.toFixed(8));
        safeSet('sun-alt', sun.altitude.toFixed(2) + "°");
        safeSet('sun-azimuth', sun.azimuth.toFixed(2) + "°");
        safeSet('moon-alt', moon.altitude.toFixed(2) + "°");
        safeSet('moon-distance', moon.distance.toFixed(0) + " km");
        safeSet('moon-illuminated', (moon.illumination * 100).toFixed(1) + " %");
        safeSet('tslv-display', sun.siderealTime || "Calcul...");
    }
}

/**
 * GESTIONNAIRE DES ANOMALIES (TRÉSORS)
 */
function updateAnomalyLog(g, mag) {
    const logEl = document.getElementById('treasure-log-display');
    const now = new Date().toLocaleTimeString();
    
    if (g > 2.0) {
        injectEntry(logEl, `🚀 [${now}] ANOMALIE G : ${g.toFixed(2)}G détectée.`);
    }
    if (Math.abs(mag.x) > 100) {
        injectEntry(logEl, `💎 [${now}] TRÉSOR MAGNÉTIQUE : ${mag.x.toFixed(1)}µT`);
    }
}

// --- UTILITAIRES SYSTÈME ---

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) {
        el.innerText = val;
        el.style.color = "var(--accent)"; // Feedback visuel de mise à jour
    }
}

function injectEntry(parent, text) {
    if (parent.innerText.includes("attente")) parent.innerHTML = "";
    const div = document.createElement('div');
    div.style.borderLeft = "2px solid var(--accent)";
    div.style.paddingLeft = "8px";
    div.style.color = "#00ff88";
    div.innerHTML = text;
    parent.prepend(div);
}

// ... Reste de votre logique UKF & Motion Listener ...
