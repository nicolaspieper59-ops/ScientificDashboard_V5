/**
 * OMNISCIENCE V21 PRO MAX - CORE ENGINE
 * Fusion de données : Relativité | Fluides | Astro | Bio-Inertiel
 */

// Configuration Haute Précision
math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const PHY = {
    c: _BN(299792458),
    G: _BN(6.67430e-11),
    R_dry: 287.058,
    gamma_air: 1.4,
    sigma: 5.670373e-8, // Stefan-Boltzmann
    a_wgs84: 6378137.0,
    f_wgs84: 1/298.257223563,
    L_char: 1.7 // Longueur caractéristique (humain)
};

const STATE = {
    active: false,
    t0: Date.now(),
    lastT: performance.now(),
    pos: { lat: 48.8566, lon: 2.3522, alt: 0 }, // Défaut: Paris
    vel: { x: 0, y: 0, z: 0, mag: 0 },
    accel_raw: { x: 0, y: 0, z: 0 },
    dist_total: _BN(0),
    g_local: 9.80665,
    atm: { temp: 288.15, press: 101325, rho: 1.225, mu: 1.81e-5, hum: 50 },
    relativity: { lorentz: _BN(1), dilation_v: _BN(0), dilation_g: _BN(0) }
};

// =============================================================
// 1. UNITÉ DE CALCUL RELATIVISTE & QUANTIQUE
// =============================================================
function computeRelativity(v, h) {
    const c2 = math.multiply(PHY.c, PHY.c);
    
    // Lorentz Factor (γ)
    const beta2 = math.divide(math.multiply(_BN(v), _BN(v)), c2);
    const gamma = math.divide(1, math.sqrt(math.subtract(1, beta2)));
    STATE.relativity.lorentz = gamma;

    // Dilatation Temporelle Cinématique (∆t' = γ∆t)
    STATE.relativity.dilation_v = math.multiply(math.subtract(gamma, 1), 1e9); // ns/s

    // Dilatation Gravitationnelle (Schwarzschild)
    // Φ = -GM/r . On simplifie par gh/c² pour les faibles altitudes
    const gh_c2 = math.divide(math.multiply(_BN(STATE.g_local), _BN(h)), c2);
    STATE.relativity.dilation_g = math.multiply(gh_c2, 1e9);

    // Rayon de Schwarzschild (Rs = 2GM/c²)
    const Rs = math.divide(math.multiply(math.multiply(2, PHY.G), _BN(5.972e24)), c2);

    UI('ui-gamma', gamma.toFixed(15));
    UI('time-dilation', STATE.relativity.dilation_v.toFixed(6), " ns/s");
    UI('ui-grav-dilation', STATE.relativity.dilation_g.toFixed(6), " ns/s");
    UI('schwarzschild-radius', Rs.toFixed(10), " m");
    UI('relativistic-energy', math.multiply(math.multiply(_BN(80), gamma), c2).toExponential(3), " J");
}

// =============================================================
// 2. MÉCANIQUE DES FLUIDES (AÉRODYNAMIQUE)
// =============================================================
function computeFluids(v) {
    // Vitesse du Son
    const vSound = Math.sqrt(PHY.gamma_air * PHY.R_dry * STATE.atm.temp);
    const mach = v / vSound;
    
    // Reynolds (Re = ρvL / μ)
    const reynolds = (STATE.atm.rho * v * PHY.L_char) / STATE.atm.mu;
    
    // Pression Dynamique (q = 1/2 ρ v²)
    const dynPress = 0.5 * STATE.atm.rho * (v ** 2);
    
    // Force de Traînée (Drag) - Estimée Cd=1.0
    const drag = dynPress * 1.0 * 1.0; 

    UI('vitesse-son-cor', vSound.toFixed(2));
    UI('mach-number', mach.toFixed(5));
    UI('reynolds-number', reynolds.toExponential(2));
    UI('dynamic-pressure', dynPress.toFixed(2), " Pa");
    UI('ui-f-drag', drag.toFixed(3), " N");
}

// =============================================================
// 3. FUSION DE CAPTEURS & NAVIGATION (UKF LIGHT)
// =============================================================
function initSensors() {
    // A. Mouvement Inertiel
    window.addEventListener('devicemotion', (e) => {
        if (!STATE.active) return;
        const dt = (performance.now() - STATE.lastT) / 1000;
        STATE.lastT = performance.now();

        const ax = e.acceleration.x || 0;
        const ay = e.acceleration.y || 0;
        const az = e.acceleration.z || 0;
        STATE.accel_raw = { x: ax, y: ay, z: az };

        // Intégration de la vitesse (Simplifiée)
        const dv = Math.sqrt(ax*ax + ay*ay + az*az) * dt;
        if (dv > 0.01) { // Noise gate
            STATE.vel.mag += dv;
        } else {
            STATE.vel.mag *= 0.98; // Friction passive
        }

        UI('f-acc-xyz', `${ax.toFixed(2)}|${ay.toFixed(2)}|${az.toFixed(2)}`);
    });

    // B. GPS & Géodésie
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(p => {
            STATE.pos.lat = p.coords.latitude;
            STATE.pos.lon = p.coords.longitude;
            STATE.pos.alt = p.coords.altitude || 0;
            
            // Recalcul Gravité Somigliana
            const phi = STATE.pos.lat * (Math.PI/180);
            const sin2 = Math.sin(phi)**2;
            STATE.g_local = 9.780327 * (1 + 0.0053024*sin2 - 0.0000058*Math.sin(2*phi)**2);

            UI('lat-ukf', STATE.pos.lat.toFixed(6));
            UI('alt-display', STATE.pos.alt.toFixed(1));
            UI('local-gravity', STATE.g_local.toFixed(5));
        }, null, { enableHighAccuracy: true });
    }
}

// =============================================================
// 4. ENVIRONNEMENT & ASTRO (EPHEM.JS)
// =============================================================
async function updateAtmosphere() {
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${STATE.pos.lat}&lon=${STATE.pos.lon}&appid=VOTRE_CLE&units=metric`);
        const data = await res.json();
        STATE.atm.temp = data.main.temp + 273.15;
        STATE.atm.press = data.main.pressure * 100;
        STATE.atm.rho = STATE.atm.press / (PHY.R_dry * STATE.atm.temp);
        UI('air-density', STATE.atm.rho.toFixed(4));
    } catch(e) { console.warn("Weather API Offline"); }
}

function computeAstro() {
    const now = new Date();
    // JD (Julian Date)
    const jd = (now / 86400000) + 2440587.5;
    UI('ast-jd', jd.toFixed(6));

    // Phase Lunaire Simplifiée
    const lp = 2551443; 
    const new_moon = new Date('1970-01-07T00:00:00Z');
    const phase = ((now - new_moon) / 1000) % lp;
    const percent = (phase / lp) * 100;
    UI('moon-phase-name', percent.toFixed(1), "%");
}

// =============================================================
// 5. BOUCLE MAÎTRESSE (60Hz)
// =============================================================
function mainLoop() {
    if (!STATE.active) return;
    
    const v = STATE.vel.mag;
    const h = STATE.pos.alt;

    // Mise à jour des sous-systèmes
    computeRelativity(v, h);
    computeFluids(v);
    computeAstro();

    // Accumulation distance BigNumber
    STATE.dist_total = math.add(STATE.dist_total, math.multiply(_BN(v), 0.0166));
    UI('dist-3d', STATE.dist_total.toFixed(2), " m");
    UI('speed-stable-ms', v.toFixed(2));
    UI('speed-stable-kmh', (v*3.6).toFixed(1));

    requestAnimationFrame(mainLoop);
}

// UI HELPER
function UI(id, val, unit="") {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `${val} <small>${unit}</small>`;
}

// INITIALISATION
function startAdventure() {
    STATE.active = true;
    STATE.lastT = performance.now();
    initSensors();
    setInterval(updateAtmosphere, 600000); // 10 min
    updateAtmosphere();
    mainLoop();
    
    document.getElementById('main-init-btn').style.display = 'none';
    console.log("MOTEUR OMNISCIENCE V21 ACTIVÉ");
               }
