/**
 * OMNISCIENCE V100 PRO - SYSTÈME DE FUSION INTÉGRAL
 * Adapté spécifiquement pour le fichier HTML "GNSS SpaceTime Dashboard"
 */

// 1. Initialisation Haute Précision 64-bit
math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

const State = {
    vInertialMS: BN(0),
    distTotalM: BN(0),
    lat: 43.284559, // Valeur par défaut issue de votre HTML
    lon: 5.345678,
    alt: 100.00,
    pitch: 0,
    roll: 0,
    history: { speed: [] },
    lastUpdate: performance.now(),
    isRunning: false
};

// 2. Moteur Physique et Astro
const Engine = {
    // Calcul de la gravité selon Somigliana (Marseille)
    getGravity: function(lat) {
        const phi = (lat * Math.PI) / 180;
        return 9.780325 * (1 + 0.00193185 * Math.sin(phi)**2) / Math.sqrt(1 - 0.00669438 * Math.sin(phi)**2);
    },

    // Force de Coriolis
    getCoriolis: function(v, lat) {
        return 2 * 7.292115e-5 * v * Math.sin(lat * Math.PI / 180);
    },

    // Mise à jour de l'interface (IDs synchronisés avec votre HTML)
    updateUI: function(ay, v, g, dt) {
        const vkmh = v * 3.6;

        // --- COLONNE 1 : SYSTÈME ---
        const now = new Date();
        document.getElementById('utc-datetime').innerText = now.toUTCString();
        document.getElementById('gmt-time-display-1').innerText = now.toISOString().substr(11, 8);
        document.getElementById('julian-date').innerText = ((now.getTime() / 86400000) + 2440587.5).toFixed(6);

        // --- COLONNE 2 : DYNAMIQUE & HUD ---
        document.getElementById('sp-main-hud').innerText = vkmh.toFixed(1);
        document.getElementById('speed-main-display').innerText = vkmh.toFixed(2) + " km/h";
        document.getElementById('speed-stable-kmh').innerText = vkmh.toFixed(2) + " km/h";
        
        const accEl = document.getElementById('acc-y');
        accEl.innerText = ay.toFixed(4);
        
        // Logique Accélération vs Décélération
        if (v * ay < -0.05) {
            accEl.style.color = "#ff4444"; // Rouge pour freinage
            document.getElementById('reality-status').innerText = "DÉCÉLÉRATION (DISSIPATION)";
            const power = Math.abs(ay * 70 * v) / 1000;
            document.getElementById('drag-power-kw').innerText = power.toFixed(2) + " kW";
        } else {
            accEl.style.color = "#00ff88"; 
            document.getElementById('reality-status').innerText = ay > 0.05 ? "PROPULSION ACTIVE" : "STABLE";
        }

        // Relativité
        const beta = Math.abs(v) / 299792458;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        document.getElementById('lorentz-factor').innerText = gamma.toExponential(14);
        document.getElementById('total-path-inf').innerText = (math.number(State.distTotalM) * 1e9).toFixed(0) + " nm";

        // --- COLONNE 3 : FORCES ---
        document.getElementById('local-gravity').innerText = g.toFixed(6) + " m/s²";
        const coriolis = this.getCoriolis(v, State.lat);
        document.getElementById('coriolis-force').innerText = coriolis.toExponential(4) + " N";
        const gRes = Math.sqrt(ay**2 + g**2) / 9.80665;
        document.getElementById('g-force-resultant').innerText = gRes.toFixed(3) + " G";

        // --- NIVEAU À BULLE ---
        const bubble = document.getElementById('bubble');
        if (bubble) {
            const bX = Math.max(-25, Math.min(25, State.roll / 2));
            const bY = Math.max(-25, Math.min(25, State.pitch / 2));
            bubble.style.transform = `translate(${bX}px, ${bY}px)`;
            document.getElementById('pitch').innerText = State.pitch.toFixed(1) + "°";
            document.getElementById('roll').innerText = State.roll.toFixed(1) + "°";
        }
    }
};

// 3. Gestion des Capteurs
function startOmniscience() {
    if (State.isRunning) return;
    State.isRunning = true;
    
    // Demander l'autorisation sur iOS si nécessaire
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission();
    }

    window.addEventListener('deviceorientation', (e) => {
        State.pitch = e.beta || 0;
        State.roll = e.gamma || 0;
    });

    window.addEventListener('devicemotion', (e) => {
        const now = performance.now();
        const dt = (now - State.lastUpdate) / 1000;
        State.lastUpdate = now;

        const gLocal = Engine.getGravity(State.lat);
        const pitchRad = (State.pitch * Math.PI) / 180;

        // Extraction de l'accélération pure (sans gravité)
        let ay_raw = e.accelerationIncludingGravity?.y || 0;
        let ay_pure = ay_raw - (gLocal * Math.sin(pitchRad));

        // Filtre anti-bruit
        if (Math.abs(ay_pure) < 0.08) ay_pure = 0;

        // Calcul Vitesse et Distance 64-bit
        State.vInertialMS = math.add(State.vInertialMS, math.multiply(BN(ay_pure), dt));
        State.distTotalM = math.add(State.distTotalM, math.multiply(State.vInertialMS, dt));

        Engine.updateUI(ay_pure, math.number(State.vInertialMS), gLocal, dt);
    });

    // Graphique de télémétrie
    const canvas = document.getElementById('telemetry-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        setInterval(() => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "#00ff88";
            ctx.beginPath();
            State.history.speed.push(math.number(State.vInertialMS));
            if (State.history.speed.length > 200) State.history.speed.shift();
            State.history.speed.forEach((v, i) => {
                ctx.lineTo((i/200)*canvas.width, 100 - (v*5));
            });
            ctx.stroke();
        }, 50);
    }
}

// 4. Branchement du bouton principal
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('start-btn-final');
    if (btn) {
        btn.addEventListener('click', () => {
            btn.innerText = "SYSTÈME ACTIF";
            btn.style.background = "#555";
            startOmniscience();
        });
    }
});
