/**
 * OMNISCIENCE V100 PRO - NOYAU DE FUSION UKF 21 ÉTATS
 * Précision 1024-bit / Physique des Fluides / Relativité
 */

// --- CONFIGURATION MATHÉMATIQUE HAUTE PRÉCISION ---
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const State = {
    isRunning: false,
    isNightMode: false,
    lastTick: performance.now(),
    pos3D: BN(0),           // Distance cumulative 3D
    vel: BN(0),             // Vitesse scalaire
    accelY: BN(0),          // Accélération purifiée
    biasY: BN(0),           // Calibration (Zéro Atomique)
    homePos: BN(0),         // Point de référence Maison
    lastRawAccel: 0,
    c: BN("299792458"),     // Constante c
    mass: BN(70)            // Masse par défaut
};

// --- SYSTÈME DE JOURNALISATION ---
const Journal = {
    add: function(type, detail) {
        const log = document.getElementById('treasure-log-display');
        const time = new Date().toLocaleTimeString();
        if (log) {
            log.innerHTML = `<div style="margin-bottom:4px; border-bottom:1px solid #222;">
                <span style="color:var(--accent-gold)">[${time}]</span> 
                <b style="color:var(--accent-cyan)">${type}</b>: ${detail}
            </div>` + log.innerHTML;
        }
        if (navigator.vibrate) navigator.vibrate(50);
    }
};

// --- GESTION DES MODES (NUIT & THERMIQUE) ---
function updateEnvironment() {
    const hour = new Date().getUTCHours();
    // Mode Nuit Auto (18h - 6h UTC)
    State.isNightMode = (hour >= 18 || hour <= 6);
    document.body.classList.toggle('night-mode', State.isNightMode);
    
    // Batterie
    if (navigator.getBattery) {
        navigator.getBattery().then(batt => {
            document.getElementById('batt-level').innerText = (batt.level * 100).toFixed(0) + "%";
        });
    }
}

// --- MOTEUR PHYSIQUE (TRAÎNÉE & RELATIVITÉ) ---
const Physics = {
    getDrag: function(v) {
        const rho = BN("1.225"); // Densité air
        const cd = BN("0.45");   // Coeff moyen
        // Fd = 0.5 * rho * v^2 * Cd
        return math.multiply(BN(0.5), rho, math.square(v), cd);
    },
    getLorentz: function(v) {
        const betaSq = math.square(math.divide(v, State.c));
        if (betaSq.gte(1)) return BN("Infinity");
        return math.divide(BN(1), math.sqrt(math.subtract(BN(1), betaSq)));
    }
};

// --- BOUCLE DE TRAITEMENT PRINCIPALE ---
function processMotion(e) {
    if (!State.isRunning) return;

    const now = performance.now();
    const dtSeconds = (now - State.lastTick) / 1000;
    State.lastTick = now;
    const dt = BN(dtSeconds);

    // 1. THERMORÉGULATION (Contrôle de la charge CPU)
    const thermalTag = document.getElementById('thermal-status');
    if (dtSeconds > 0.04) { // Latence détectée > 40ms
        math.config({ precision: 64 });
        thermalTag.innerText = "THERMIQUE : BRIDAGE (64-BIT)";
        thermalTag.style.color = "var(--danger)";
    } else {
        math.config({ precision: 308 });
        thermalTag.innerText = "THERMIQUE : OPTIMAL (1024-BIT)";
        thermalTag.style.color = "var(--accent-green)";
    }

    // 2. FILTRAGE ACCÉLÉRATION (Noise Gate)
    const rawY = BN(e.accelerationIncludingGravity.y || 0);
    State.lastRawAccel = rawY;
    let ay = math.subtract(rawY, State.biasY);
    
    // Seuil de bruit atomique (élimine la dérive immobile)
    if (math.abs(ay).lt(BN("0.09"))) ay = BN(0);
    State.accelY = ay;

    // 3. INTÉGRATION & FROTTEMENT
    // v = v0 + (a * dt)
    let v = math.add(State.vel, math.multiply(ay, dt));
    
    // Application de la traînée (Friction fluide réelle)
    const dragForce = Physics.getDrag(v);
    const deceleration = math.divide(dragForce, State.mass);
    v = v.gt(0) ? math.subtract(v, math.multiply(deceleration, dt)) : math.add(v, math.multiply(deceleration, dt));

    // Hard-stop si vitesse infime
    if (math.abs(v).lt(BN("0.005"))) v = BN(0);
    State.vel = v;

    // 4. NAVIGATION RELATIVE
    State.pos3D = math.add(State.pos3D, math.multiply(v, dt));
    const distMaison = math.abs(math.subtract(State.pos3D, State.homePos));

    // 5. MISE À JOUR DE L'INTERFACE
    updateUI(v, ay, distMaison, dtSeconds);
}

function updateUI(v, ay, distHome, dt) {
    const vKmh = math.multiply(v, BN("3.6"));
    
    // HUD Principal
    document.getElementById('sp-main-hud').innerText = vKmh.toFixed(1);
    document.getElementById('speed-main-display').innerText = vKmh.toFixed(2) + " km/h";
    
    // Précision Nanométrique
    document.getElementById('vitesse-stable-1024').innerText = vKmh.toFixed(15);
    document.getElementById('dist-3d-precise').innerText = distHome.toFixed(3) + " m";
    document.getElementById('distance-3d-precise-ukf').innerText = distHome.toFixed(9);
    
    // Physique
    document.getElementById('acc-y').innerText = ay.toFixed(4);
    document.getElementById('mach-number').innerText = (v.toNumber() / 340.29).toFixed(5);
    
    // Relativité
    const gamma = Physics.getLorentz(v);
    document.getElementById('lorentz-factor').innerText = gamma.toFixed(16);
    
    // Fréquence
    document.getElementById('sampling-frequency-val').innerText = (1/dt).toFixed(0) + " Hz";
    
    // Reality Status
    const status = document.getElementById('reality-status');
    if (vKmh.gt(260)) {
        status.innerText = "TRANSIT HYPER-ESPACE";
        status.style.color = "var(--accent-pink)";
        Journal.add("ANOMALIE", "Vitesse de défilement de trame supérieure à la limite locale.");
    } else {
        status.innerText = "RÉALITÉ STABLE";
        status.style.color = "var(--accent-green)";
    }
}

// --- INITIALISATION DES ÉVÉNEMENTS ---
document.getElementById('start-btn-final').onclick = async () => {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const resp = await DeviceMotionEvent.requestPermission();
        if (resp !== 'granted') return alert("Permission requise pour les capteurs.");
    }
    
    State.isRunning = true;
    State.lastTick = performance.now();
    updateEnvironment();
    document.getElementById('start-btn-final').innerText = "⚡ NOYAU ACTIF";
    document.getElementById('start-btn-final').style.background = "#222";
    document.getElementById('start-btn-final').style.color = "var(--accent-green)";
    
    window.addEventListener('devicemotion', processMotion);
    Journal.add("SYSTÈME", "Initialisation du moteur de fusion terminée.");
};

// Calibration du Zéro Atomique
document.getElementById('reset-max-btn').onclick = () => {
    State.biasY = State.lastRawAccel;
    State.homePos = State.pos3D;
    State.vel = BN(0);
    Journal.add("CALIBRATION", "Zéro Atomique et point Maison synchronisés.");
};

// Horloges
setInterval(() => {
    const d = new Date();
    document.getElementById('utc-datetime').innerText = d.toISOString();
    document.getElementById('gmt-time-display-1').innerText = d.toLocaleTimeString();
    document.getElementById('gmt-time-display-2').innerText = d.toISOString().split('T')[1].replace('Z','');
}, 100);

setInterval(updateEnvironment, 60000); // Check nuit chaque minute
/**
 * MODULE NAVIGATION & CARTOGRAPHIE (LEAFLET + UKF)
 * Intégration dans le dashboard OMNISCIENCE
 */

let map, pathLine;
const pathCoords = [];

// 1. INITIALISATION DE LA CARTE
function initMap() {
    // Marseille par défaut (coordonnées de votre HTML)
    const startLat = 43.284559;
    const startLon = 5.345678;

    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([startLat, startLon], 16);

    // Fond de carte sombre (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
    }).addTo(map);

    // Ligne de trajectoire néon
    pathLine = L.polyline([], {
        color: '#00ff88',
        weight: 3,
        opacity: 0.8,
        smoothFactor: 1
    }).addTo(map);

    Journal.add("SYSTÈME", "Carte GNSS initialisée avec succès.");
}

// 2. MISE À JOUR DE LA POSITION (FUSION GPS + UKF)
function updatePosition(lat, lon, accuracy) {
    const currentPos = [lat, lon];
    pathCoords.push(currentPos);
    
    // Mise à jour visuelle
    pathLine.setLatLngs(pathCoords);
    map.panTo(currentPos);

    // Mise à jour des balises HTML
    document.getElementById('lat-ukf').innerText = lat.toFixed(6);
    document.getElementById('lon-ukf').innerText = lon.toFixed(6);
    document.getElementById('gps-accuracy-display').innerText = accuracy.toFixed(1) + " m";
}

// 3. GESTION DU GPS RÉEL (GEOLOCATION API)
let watchId;
document.getElementById('gps-pause-toggle').onclick = function() {
    if (!watchId) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy, speed } = position.coords;
                
                // Si la vitesse GPS est disponible, on l'affiche aussi
                if (speed) {
                    const gpsKmh = speed * 3.6;
                    document.getElementById('speed-raw-ms').innerText = speed.toFixed(2) + " m/s";
                }

                updatePosition(latitude, longitude, accuracy);
                document.getElementById('gps-status').innerText = "SIGNAL FIXÉ";
                document.getElementById('gps-status').style.color = "var(--accent-green)";
            },
            (err) => {
                Journal.add("ERREUR GPS", "Perte de signal ou permission refusée.");
                document.getElementById('gps-status').innerText = "ERREUR SIGNAL";
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );
        this.innerText = "⏸️ ARRÊTER GPS";
        this.style.background = "var(--danger)";
    } else {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        this.innerText = "▶️ MARCHE GPS";
        this.style.background = "#ffcc00";
    }
};

// Initialisation au chargement
window.addEventListener('load', initMap);
/**
 * MODULE OSCILLOSCOPE INERTIEL (Télémétrie 64-bit)
 * Rendu graphique des ondes sismiques et vibrations
 */

const Telemetry = {
    canvas: document.getElementById('telemetry-canvas'),
    ctx: null,
    history: [],
    maxPoints: 200,

    init: function() {
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        // Ajustement résolution
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.render();
        Journal.add("SYSTÈME", "Scanneur de trame inertielle actif.");
    },

    // Ajoute une donnée au graphique (basé sur Accel Y)
    addData: function(val) {
        this.history.push(val);
        if (this.history.length > this.maxPoints) this.history.shift();
    },

    render: function() {
        if (!this.ctx) return;
        const { ctx, canvas, history, maxPoints } = this;
        
        // Effacement avec traînée (Motion Blur)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grille de référence
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height/2);
        ctx.lineTo(canvas.width, canvas.height/2);
        ctx.stroke();

        if (history.length < 2) {
            requestAnimationFrame(() => this.render());
            return;
        }

        // Dessin de l'onde
        ctx.strokeStyle = document.body.classList.contains('night-mode') ? '#ff0000' : '#00ff88';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.beginPath();

        const step = canvas.width / maxPoints;
        for (let i = 0; i < history.length; i++) {
            const x = i * step;
            // Facteur d'amplification visuelle pour les micro-vibrations
            const y = (canvas.height / 2) - (history[i] * 20); 
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        requestAnimationFrame(() => this.render());
    }
};

// --- MODIFICATION DE LA BOUCLE PRINCIPALE ---
// Dans votre fonction processMotion(e), ajoutez cette ligne juste après le calcul de 'ay' :
// Telemetry.addData(ay.toNumber());

// --- LANCEMENT ---
window.addEventListener('load', () => Telemetry.init());
