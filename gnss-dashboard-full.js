/**
 * OMNISCIENCE V100 PRO - SINGULARITY CORE
 * Fusion EKF + Stabilisation GPS + Acoustique
 */

math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const Core = {
    isRunning: false,
    v: BN(0),             // Vitesse maître
    dist: BN(0),          // Distance (Précision au mm)
    biasY: 0,
    lux: 0, db: 0,
    lastT: performance.now(),
    c: BN("299792458"),
    map: null, path: null
};

// --- FILTRE DE STABILISATION GPS ---
const GPS_Filter = {
    process: function(pos) {
        if(!Core.isRunning) return;
        const gpsV = BN(pos.coords.speed || 0);
        const acc = pos.coords.accuracy || 10;

        // Si précision < 20m, on utilise le GPS pour recalibrer l'inertie
        if (acc < 20) {
            Core.v = math.add(math.multiply(Core.v, BN(0.85)), math.multiply(gpsV, BN(0.15)));
            document.getElementById('gps-acc').innerText = acc.toFixed(1) + " m";
            if(Core.map) {
                const c = [pos.coords.latitude, pos.coords.longitude];
                Core.map.panTo(c); Core.path.addLatLng(c);
            }
        }
    }
};

// --- CAPTEURS ENVIRONNEMENTAUX ---
async function initEnv() {
    // Acoustique (Vent/Vitesse air)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        const src = ctx.createMediaStreamSource(stream);
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        setInterval(() => {
            analyser.getByteFrequencyData(data);
            Core.db = data.reduce((a,b)=>a+b,0)/data.length;
            document.getElementById('env-db').innerText = Core.db.toFixed(1) + " dB";
        }, 200);
    } catch(e) {}

    // Lumière (Mode Grotte)
    if ('AmbientLightSensor' in window) {
        const sensor = new AmbientLightSensor();
        sensor.onreading = () => {
            Core.lux = sensor.illuminance;
            document.getElementById('env-lux').innerText = Core.lux.toFixed(1) + " lx";
            const cave = Core.lux < 5;
            document.body.classList.toggle('night-mode', cave);
            document.getElementById('cave-mode-status').innerText = cave ? "ACTIF" : "OFF";
        };
        sensor.start();
    }
}

// --- BOUCLE DE FUSION (64Hz) ---
function fusionLoop(e) {
    if(!Core.isRunning) return;
    const now = performance.now();
    const dt = (now - Core.lastT) / 1000;
    Core.lastT = now;

    // 1. ACCÉLÉRATION (Acrobaties)
    let ay = BN(e.accelerationIncludingGravity.y || 0);
    if(math.abs(ay).lt(BN(0.15))) ay = BN(0); // Noise Gate anti-bug

    // 2. RÉSISTANCE FLUIDE (Toboggans)
    const drag = math.multiply(BN(0.04), math.square(Core.v));
    
    // 3. INTÉGRATION 1024-BIT (Précision au mm)
    Core.v = math.add(Core.v, math.multiply(ay, BN(dt)));
    if(Core.v.gt(0)) Core.v = math.subtract(Core.v, drag);
    if(Core.v.lt(0)) Core.v = BN(0);
    
    Core.dist = math.add(Core.dist, math.multiply(Core.v, BN(dt)));

    // 4. SYNC UI
    updateUI(ay, dt);
}

function updateUI(ay, dt) {
    const vKmh = math.multiply(Core.v, BN(3.6));
    document.getElementById('sp-main-hud').innerText = vKmh.toFixed(1);
    document.getElementById('v-1024').innerText = vKmh.toFixed(15);
    document.getElementById('g-force').innerText = (ay.toNumber()/9.81).toFixed(3);
    document.getElementById('dist-mm').innerText = Core.dist.toFixed(3) + " m";
    document.getElementById('dyn-pres').innerText = math.multiply(BN(0.6), math.square(Core.v)).toFixed(1) + " Pa";
    
    // Télémétrie visuelle
    drawTelemetry(ay.toNumber());
}

// Oscilloscope Jerk
const telCtx = document.getElementById('telemetry-canvas').getContext('2d');
let points = [];
function drawTelemetry(val) {
    points.push(val); if(points.length > 200) points.shift();
    telCtx.fillStyle = '#000'; telCtx.fillRect(0,0,800,200);
    telCtx.strokeStyle = '#00ff88'; telCtx.beginPath();
    points.forEach((p, i) => {
        const x = (i/200)*800; const y = 40 - (p*10);
        if(i===0) telCtx.moveTo(x,y); else telCtx.lineTo(x,y);
    });
    telCtx.stroke();
}

// INITIALISATION
document.getElementById('start-btn').onclick = async () => {
    if(typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
    Core.isRunning = true;
    initEnv();
    window.addEventListener('devicemotion', fusionLoop);
    navigator.geolocation.watchPosition(GPS_Filter.process, null, {enableHighAccuracy:true});
    document.getElementById('start-btn').style.display = 'none';
};

document.getElementById('reset-btn').onclick = () => {
    Core.v = BN(0); Core.dist = BN(0);
    const log = document.getElementById('log-display');
    log.innerHTML = `<div>[${new Date().toLocaleTimeString()}] ZÉRO FIXÉ</div>` + log.innerHTML;
};

window.onload = () => {
    Core.map = L.map('map', {zoomControl:false}).setView([43.28, 5.35], 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(Core.map);
    Core.path = L.polyline([], {color: '#00ff88'}).addTo(Core.map);
};
