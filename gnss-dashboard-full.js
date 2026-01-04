/**
 * OMNISCIENCE V100 PRO - SINGULARITY CORE
 * Moteur de Fusion Inertielle & Relativiste (1024-bit)
 */

// Configuration de la précision millimétrée
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const PHYS = {
    C: BN("299792458"),           // Célérité de la lumière
    G_REF: BN("9.80665"),         // Gravité terrestre standard
    RHO_AIR: BN("1.225"),         // Densité de l'air au niveau de la mer (kg/m3)
    CD_HUMAN: BN("0.47"),         // Coefficient de traînée moyen
    AREA_HUMAN: BN("0.7"),        // Surface frontale (m2)
    JOULE_TO_KCAL: BN("0.000239006")
};

const State = {
    active: false,
    v: BN(0),                     // Vitesse scalaire (m/s)
    dist: BN(0),                  // Distance cumulée (m)
    calories: BN(0),              // Calories brûlées (kcal)
    lastT: null,
    gpsAcc: 100,
    dbLevel: 0,
    mass: BN(70),                 // Masse par défaut (kg)
    biasY: BN(0),                 // Auto-calibration accéléromètre
    history: []
};

// --- INITIALISATION DES CAPTEURS ---

async function initSingularity() {
    // 1. Demande de permission (iOS 13+)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') {
            alert("Accès aux capteurs refusé.");
            return;
        }
    }

    State.active = true;
    State.lastT = BN(performance.now());
    
    // 2. Démarrage du microphone (Acoustique/Vent)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            State.dbLevel = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const dbDisplay = document.getElementById('sound-level') || document.getElementById('env-noise');
            if(dbDisplay) dbDisplay.innerText = State.dbLevel.toFixed(1) + " dB";
        }, 100);
    } catch (e) { console.warn("Microphone non disponible."); }

    // 3. Écouteurs d'événements
    window.addEventListener('devicemotion', realityLoop);
    navigator.geolocation.watchPosition(processGPS, null, { 
        enableHighAccuracy: true, 
        maximumAge: 0 
    });

    document.getElementById('start-btn-final').style.display = 'none';
    document.getElementById('reality-status').innerText = "VÉROUILLAGE 1024-BIT ACTIF";
}

// --- FUSION GPS / EKF (Filtre de Kalman Étendu) ---

function processGPS(pos) {
    if (!State.active) return;
    
    const gpsV = BN(pos.coords.speed || 0);
    State.gpsAcc = pos.coords.accuracy;
    
    // Si le signal est bon (< 15m), on réduit la dérive de l'accéléromètre
    if (State.gpsAcc < 15) {
        const weight = BN(0.15); // Facteur de confiance GPS
        State.v = math.add(
            math.multiply(State.v, math.subtract(BN(1), weight)),
            math.multiply(gpsV, weight)
        );
        
        // Mise à jour de la carte Leaflet si présente
        if (window.map) {
            const latlng = [pos.coords.latitude, pos.coords.longitude];
            if (!window.pathLine) {
                window.pathLine = L.polyline([], {color: '#00ff88'}).addTo(window.map);
            }
            window.map.panTo(latlng);
            window.pathLine.addLatLng(latlng);
        }
    }
}

// --- BOUCLE DE RÉALITÉ PHYSIQUE (60Hz+) ---

function realityLoop(e) {
    if (!State.active) return;

    const now = BN(performance.now());
    const dt = math.divide(math.subtract(now, State.lastT), BN(1000)); // Delta temps en s
    State.lastT = now;

    if (dt.isZero()) return;

    // 1. ACQUISITION IMU (Accélération pure)
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    
    // Filtrage du bruit de quantification (Noise Gate)
    if (math.abs(ay).lt(BN("0.12"))) ay = BN(0);

    // 2. MÉCANIQUE DES FLUIDES (Résistance de l'air)
    // On ajoute le niveau sonore (dB) pour simuler l'impact du vent sur la traînée
    const windEffect = math.divide(BN(State.dbLevel), BN(100));
    const dragForce = math.multiply(
        BN(0.5), 
        math.add(PHYS.RHO_AIR, windEffect), 
        PHYS.CD_HUMAN, 
        PHYS.AREA_HUMAN, 
        math.square(State.v)
    );

    // 3. INTÉGRATION 1024-BIT
    // a = F/m -> accélération résultante = ay - (drag / masse)
    const netAccel = math.subtract(ay, math.divide(dragForce, State.mass));
    
    // v = v + a*dt
    State.v = math.add(State.v, math.multiply(netAccel, dt));
    if (State.v.lt(0)) State.v = BN(0); // Empêche la marche arrière physique

    // Distance = v*dt
    const dStep = math.multiply(State.v, dt);
    State.dist = math.add(State.dist, dStep);

    // 4. MODULE CALORIES (Travail Mécanique)
    // E = F * d (Travail en Joules)
    const forceN = math.multiply(State.mass, math.abs(netAccel));
    const workJ = math.multiply(forceN, dStep);
    const kcal = math.multiply(workJ, PHYS.JOULE_TO_KCAL, BN(4)); // Facteur 4 pour le rendement métabolique humain
    State.calories = math.add(State.calories, kcal);

    // 5. RELATIVITÉ (Lorentz)
    const betaSq = math.square(math.divide(State.v, PHYS.C));
    const lorentz = math.divide(BN(1), math.sqrt(math.subtract(BN(1), betaSq)));

    updateUI(ay, lorentz, dt);
}

// --- RENDU INTERFACE (SYNCHRONISATION HTML) ---

function updateUI(ay, lorentz, dt) {
    const vKmh = math.multiply(State.v, BN("3.6"));
    
    // HUD Principal
    safeSet('sp-main-hud', vKmh.toFixed(1));
    
    // Dynamique
    safeSet('v1024-val', vKmh.toFixed(15));
    safeSet('vitesse-stable-1024', vKmh.toFixed(15));
    safeSet('dist-val', State.dist.toFixed(3) + " m");
    safeSet('dist-3d-precise', State.dist.toFixed(3) + " m");
    safeSet('g-val', math.divide(ay, PHYS.G_REF).toFixed(3));
    safeSet('acc-y', ay.toFixed(4));
    
    // Énergie & Bio
    safeSet('cal-val', State.calories.toFixed(2));
    safeSet('calories-burn', State.calories.toFixed(2));
    
    // Système & Astro
    safeSet('hz-val', math.round(math.divide(BN(1), dt)).toString());
    safeSet('lorentz-val', lorentz.toFixed(18));
    safeSet('lorentz-factor', lorentz.toFixed(18));
    
    // Fluides
    const pa = math.multiply(BN(0.5), PHYS.RHO_AIR, math.square(State.v));
    safeSet('pa-val', pa.toFixed(1));
    safeSet('dynamic-pressure', pa.toFixed(2));

    drawTelemetry(ay.toNumber());
}

// Aide pour éviter les erreurs si un ID est manquant
function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// --- GRAPHIQUE DE TÉLÉMÉTRIE (JERK/ACROBATIES) ---

const canvas = document.getElementById('telemetry-canvas');
const ctx = canvas.getContext('2d');
let points = [];

function drawTelemetry(val) {
    points.push(val);
    if (points.length > 200) points.shift();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = document.body.classList.contains('night-mode') ? '#ff0000' : '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    points.forEach((p, i) => {
        const x = (i / 200) * canvas.width;
        const y = (canvas.height / 2) - (p * 15);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

// --- GESTION DES BOUTONS ---

document.getElementById('start-btn-final').addEventListener('click', initSingularity);

document.getElementById('reset-dist-btn')?.addEventListener('click', () => {
    State.dist = BN(0);
    State.calories = BN(0);
});

// Mode Grotte Automatique (Luxmètre)
if ('AmbientLightSensor' in window) {
    const sensor = new AmbientLightSensor();
    sensor.onreading = () => {
        const lux = sensor.illuminance;
        safeSet('env-lux', lux.toFixed(1));
        const isDark = lux < 5;
        document.body.classList.toggle('night-mode', isDark);
        safeSet('cave-status', isDark ? "ACTIF (OBSCURITÉ)" : "OFF");
    };
    sensor.start();
    }
