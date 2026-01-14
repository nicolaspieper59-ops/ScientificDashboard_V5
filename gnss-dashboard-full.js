/**
 * OMNISCIENCE V17 - MOTEUR DE MÉTROLOGIE SYNCHRONISÉ 4-COLONNES
 */
math.config({ number: 'BigNumber', precision: 64 });

const METROLOGY = {
    active: false,
    lastTick: performance.now(),
    
    state: {
        v: math.bignumber(0),
        lat: 0, lon: 0,
        h_ellip: 0,
        g_local: 9.80665,
        rho: 1.225, 
        gamma: math.bignumber(1)
    },

    const: {
        c: math.bignumber(299792458),
        a: 6378137.0,
        GM: 3.986004418e14
    }
};

// --- SYNCHRONISATION UI ---
function updateUI(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function logTerminal(msg) {
    const log = document.getElementById('anomaly-log');
    if (log) {
        const div = document.createElement('div');
        div.innerHTML = `<span style="color:#666">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
        log.prepend(div);
    }
}

// --- INITIALISATION (Lié au bouton HTML) ---
async function startAdventure() {
    if(METROLOGY.active) return;
    METROLOGY.active = true;
    
    const btn = document.getElementById('main-init-btn');
    if(btn) btn.style.display = 'none'; // Cache le bouton après activation

    logTerminal("INITIALISATION MOTEUR V17 PRO...");
    logTerminal("MODÈLE GÉODÉSIQUE WGS84 CHARGÉ.");
    
    initGeodesy();
    initPrecisionSensors();
    requestAnimationFrame(metrologyLoop);
}

// --- GÉODÉSIE ET GRAVITÉ ---
function initGeodesy() {
    navigator.geolocation.watchPosition((pos) => {
        METROLOGY.state.lat = pos.coords.latitude;
        METROLOGY.state.h_ellip = pos.coords.altitude || 0;

        // Modèle Somigliana (Pesanteur théorique selon latitude)
        const phi = (METROLOGY.state.lat * Math.PI) / 180;
        const sin2Phi = Math.pow(Math.sin(phi), 2);
        const g_e = 9.7803253359;
        const k = 0.00193185265241;
        const e2 = 0.00669437999014;
        
        let g_0 = g_e * (1 + k * sin2Phi) / Math.sqrt(1 - e2 * sin2Phi);
        // Correction d'altitude (Free-air correction)
        METROLOGY.state.g_local = g_0 - (3.086e-6 * METROLOGY.state.h_ellip);

        // Mise à jour ID HTML (Colonne 2)
        updateUI('ui-grav-dilation', METROLOGY.state.g_local.toFixed(6) + " m/s²");
    }, (err) => logTerminal("GPS SIGNAL PERDU"), { enableHighAccuracy: true });
}

// --- PHYSIQUE ET RELATIVITÉ ---
function initPrecisionSensors() {
    window.addEventListener('devicemotion', (e) => {
        if (!METROLOGY.active) return;
        
        const now = performance.now();
        const dt = math.bignumber((now - METROLOGY.lastTick) / 1000);
        METROLOGY.lastTick = now;

        let raw_accel = e.acceleration?.y || e.accelerationIncludingGravity?.y || 0;
        if(Math.abs(raw_accel) < 0.1) raw_accel = 0; // Seuil de bruit (Noise floor)
        
        const ax = math.bignumber(raw_accel);
        
        // Calcul Vitesse (Intégration numérique)
        METROLOGY.state.v = math.add(METROLOGY.state.v, math.multiply(ax, dt));
        if (METROLOGY.state.v.isNegative()) METROLOGY.state.v = math.bignumber(0);

        // Relativité de Lorentz
        const v = METROLOGY.state.v;
        const c = METROLOGY.const.c;
        const beta2 = math.square(math.divide(v, c));
        METROLOGY.state.gamma = math.divide(1, math.sqrt(math.subtract(1, beta2)));
        
        // Dérive temporelle (ns par seconde de temps propre)
        const dilation = math.multiply(math.subtract(METROLOGY.state.gamma, 1), 1e9);

        // MISE À JOUR UI (IDs du HTML 4-Colonnes)
        updateUI('ui-speed-ms', v.toFixed(2) + " m/s");
        updateUI('ui-speed-rel', math.multiply(math.divide(v, c), 100).toFixed(8) + " %c");
        updateUI('ui-lorentz-dilation', dilation.toFixed(4) + " ns/s");
    });
}

function metrologyLoop() {
    // Temps Julien
    const now = new Date();
    const JD = (now.getTime() / 86400000) + 2440587.5;
    updateUI('ast-jd', JD.toFixed(6));
    
    if(METROLOGY.active) requestAnimationFrame(metrologyLoop);
    }
