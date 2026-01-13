/**
 * OMNISCIENCE V17 - MOTEUR DE MÉTROLOGIE CORRIGÉ
 */
math.config({ number: 'BigNumber', precision: 64 });

const METROLOGY = {
    active: false,
    lastTick: performance.now(),
    lastWeatherUpdate: 0,
    
    state: {
        v: math.bignumber(0),
        lat: 0, lon: 0,
        h_ellip: 0,
        g_local: 9.80665,
        rho: 1.225, // Valeur ISA par défaut
        c_sound: 340.29
    },

    const: {
        c: math.bignumber(299792458),
        a: 6378137.0,
        GM: 3.986004418e14,
        omega_e: 7.292115e-5
    }
};

// --- 1. INITIALISATION ---
async function startAdventure() { // Nom de fonction aligné sur le HTML
    if(METROLOGY.active) return;
    METROLOGY.active = true;
    logTerminal("SYSTÈME OMNISCIENCE ACTIVÉ : MODÈLES WGS84/CIPM");
    
    initGeodesy();
    initPrecisionSensors();
    requestAnimationFrame(metrologyLoop);
}

// --- 2. GÉODÉSIE (Correction Gravité) ---
function initGeodesy() {
    navigator.geolocation.watchPosition((pos) => {
        const coords = pos.coords;
        METROLOGY.state.lat = coords.latitude;
        METROLOGY.state.h_ellip = coords.altitude || 0;

        // Somigliana Gravity Model
        const phi = (METROLOGY.state.lat * Math.PI) / 180;
        const sin2Phi = Math.pow(Math.sin(phi), 2);
        const g_e = 9.7803253359;
        const k = 0.00193185265241;
        const e2 = 0.00669437999014;
        
        let g_0 = g_e * (1 + k * sin2Phi) / Math.sqrt(1 - e2 * sin2Phi);
        // Correction Free-Air
        METROLOGY.state.g_local = g_0 - (3.086e-6 * METROLOGY.state.h_ellip);

        updateUI('ui-grav-phi', METROLOGY.state.g_local.toFixed(6));
        
        // Mise à jour météo toutes les 10 min
        const now = Date.now();
        if (now - METROLOGY.lastWeatherUpdate > 600000) {
            updateThermodynamics(coords.latitude, coords.longitude);
            METROLOGY.lastWeatherUpdate = now;
        }
    }, (err) => logTerminal("GPS ERR: " + err.message), { enableHighAccuracy: true });
}

// --- 3. MÉCANIQUE ET RELATIVITÉ (Correction Intégration) ---
function initPrecisionSensors() {
    window.addEventListener('devicemotion', (e) => {
        if (!METROLOGY.active) return;
        
        const now = performance.now();
        const dt = math.bignumber((now - METROLOGY.lastTick) / 1000);
        METROLOGY.lastTick = now;

        // Accélération (Filtrage simple du bruit)
        let raw_accel = e.acceleration.y || e.acceleration.x || 0;
        if(Math.abs(raw_accel) < 0.05) raw_accel = 0; 
        const ax = math.bignumber(raw_accel);
        
        // Traînée Aéro
        const v_sq = math.square(METROLOGY.state.v);
        const drag = math.multiply(0.5, METROLOGY.state.rho, v_sq, 0.45, 0.55);
        
        // Force Nette et Vitesse
        const mass = math.bignumber(document.getElementById('in-mass')?.value || 75);
        const a_net = math.subtract(ax, math.divide(drag, mass));
        
        METROLOGY.state.v = math.add(METROLOGY.state.v, math.multiply(a_net, dt));
        if (METROLOGY.state.v.isNegative()) METROLOGY.state.v = math.bignumber(0);

        // Relativité
        const beta = math.divide(METROLOGY.state.v, METROLOGY.const.c);
        const beta2 = math.square(beta);
        const gamma = math.divide(1, math.sqrt(math.subtract(1, beta2)));
        
        // Dilatation Gravitationnelle
        const r = math.add(METROLOGY.const.a, METROLOGY.state.h_ellip);
        const phi_g = math.divide(math.multiply(-1, METROLOGY.const.GM), r);
        
        // UI Update
        updateUI('main-speed', math.multiply(METROLOGY.state.v, 3.6).toFixed(2));
        updateUI('ui-gamma', gamma.toFixed(15));
        updateUI('ui-drag-force', drag.toFixed(4) + " N");
        updateUI('ui-real-accel', a_net.toFixed(3) + " m/s²");
    });
}

// --- 4. TEMPS JULIEN ---
function metrologyLoop() {
    const now = new Date();
    const Y = now.getUTCFullYear();
    const M = now.getUTCMonth() + 1;
    const D = now.getUTCDate();
    const h = now.getUTCHours() + now.getUTCMinutes()/60 + now.getUTCSeconds()/3600;
    
    let JD = Math.floor(365.25*(Y+4716)) + Math.floor(30.6001*(M+1)) + D + h/24 - 1524.5;
    updateUI('ast-jd', JD.toFixed(6));
    
    if(METROLOGY.active) requestAnimationFrame(metrologyLoop);
            }
