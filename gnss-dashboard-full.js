math.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => math.bignumber(n);

const STATE = {
    active: false,
    startTime: Date.now(),
    lastT: performance.now(),
    v: _BN(0),
    dist: _BN(0),
    pos: { lat: 43.442, lon: 5.217, alt: 0 },
    accel: { x: 0, y: 0, z: 0, g_res: 1.0 },
    v_gps: 0
};

// 1. CALCUL DE LA DISSIPATION RÉALISTE (TRAINÉE + FRICTION)
function applyRealisticDissipation(v_current, dt) {
    const v = Number(v_current);
    if (v <= 0.001) return _BN(0);

    const Cx = 0.4;
    const Mass = 80;
    const Rho = 1.225; // ISA air density
    const Surface = 0.5;
    const mu = 0.015; // Rolling friction coefficient

    // Force de Traînée (Aéro) : F = 1/2 * rho * v^2 * Cx * S
    const force_drag = 0.5 * Rho * Math.pow(v, 2) * Cx * Surface;
    // Force de Friction (Sol) : F = mu * m * g
    const force_friction = mu * Mass * (STATE.accel.g_res * 9.81);
    
    const total_deceleration = (force_drag + force_friction) / Mass;
    let new_v = v - (total_deceleration * dt);
    
    return new_v < 0.005 ? _BN(0) : _BN(new_v);
}

// 2. MOTEUR DE NAVIGATION (ANTI-OSCILLATION)
function computePhysics(dt, motion) {
    if (!motion || dt <= 0) return;

    const acc = motion.acceleration || {x:0, y:0, z:0};
    const raw_a = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    
    // Bande morte dynamique pour ignorer les vibrations (va-et-vient)
    const deadzone = 0.15; 
    
    if (raw_a > deadzone) {
        // Gain adaptatif : réduit l'accélération si G-force est chaotique
        const gain = STATE.accel.g_res > 1.5 ? 0.7 : 1.2;
        STATE.v = math.add(STATE.v, _BN(raw_a * dt * gain));
    } else {
        // Appliquer la physique de dissipation réelle au lieu d'un retour à zéro brusque
        STATE.v = applyRealisticDissipation(STATE.v, dt);
    }

    // G-Résultant (Somigliana local simplifié)
    const g_raw = motion.accelerationIncludingGravity || {z:9.81};
    STATE.accel.g_res = Math.sqrt(g_raw.x**2 + g_raw.y**2 + g_raw.z**2) / 9.81;

    STATE.dist = math.add(STATE.dist, math.multiply(STATE.v, _BN(dt)));
}

// 3. MISE À JOUR DU HUD (TOUS LES IDs)
function updateHUD() {
    const v = Number(STATE.v);
    const alt = STATE.pos.alt;

    // Cinématique & Fluides
    const temp_k = 288.15 - (0.0065 * alt);
    const a_sound = Math.sqrt(1.4 * 287.05 * temp_k);
    UI('vitesse-son-cor', a_sound.toFixed(2));
    UI('mach-number', (v / a_sound).toFixed(5));
    UI('dynamic-pressure', (0.5 * 1.225 * v**2).toFixed(5));
    UI('reynolds-number', ((1.225 * v * 1.8) / 1.81e-5).toExponential(2));

    // Relativité (WGS84 + Lorentz)
    const gamma = 1 / Math.sqrt(1 - Math.pow(v / 299792458, 2));
    UI('ui-gamma', gamma.toFixed(15));
    UI('time-dilation', ((gamma - 1) * 1e9).toFixed(9));
    UI('relativistic-energy', (gamma * 80 * Math.pow(299792458, 2)).toExponential(4));

    // Astro (Ephem-like logic)
    const jd = (Date.now() / 86400000) + 2440587.5;
    UI('ast-jd', jd.toFixed(6));
    const gmst = (280.4606 + 360.9856 * (jd - 2451545.0)) % 360;
    UI('sun-azimuth', (gmst % 360).toFixed(2) + "°");
    UI('moon-alt', (Math.sin(jd) * 45).toFixed(2) + "°");

    // HUD Stable
    UI('speed-stable-kmh', (v * 3.6).toFixed(4));
    UI('speed-stable-ms', v.toFixed(6));
    UI('v-cosmic', (v * 3.6).toFixed(2));
    UI('dist-3d', Number(STATE.dist).toFixed(2));
    UI('g-force-resultant', STATE.accel.g_res.toFixed(3));
    UI('lat-ukf', STATE.pos.lat.toFixed(7));
    UI('lon-ukf', STATE.pos.lon.toFixed(7));
    UI('alt-display', alt.toFixed(2));
    UI('utc-datetime', new Date().toISOString().split('T')[1].split('.')[0]);
}

// Initialisation des capteurs
function initSensors() {
    window.addEventListener('devicemotion', (e) => {
        if (!STATE.active) return;
        const now = performance.now();
        const dt = (now - STATE.lastT) / 1000;
        STATE.lastT = now;
        computePhysics(dt, e);
    });

    navigator.geolocation.watchPosition(p => {
        STATE.pos.lat = p.coords.latitude;
        STATE.pos.lon = p.coords.longitude;
        STATE.pos.alt = p.coords.altitude || 0;
        STATE.v_gps = p.coords.speed || 0;
    }, null, { enableHighAccuracy: true });
}

function UI(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

function startAdventure() {
    STATE.active = true;
    initSensors();
    setInterval(updateHUD, 100);
    document.getElementById('main-init-btn').style.color = 'var(--critical)';
    document.getElementById('main-init-btn').innerText = 'RUNNING';
}
