/**
 * OMNISCIENCE V100 PRO - MASTER CORE ENGINE
 */

math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

const State = {
    vInertialMS: BN(0),
    distTotalM: BN(0),
    lat: 43.296482, lon: 5.36978, alt: 24.5, // Marseille
    pitch: 0, roll: 0,
    history: { speed: [], acc: [] },
    lastTime: performance.now()
};

const Physics = {
    // 1. Correction Géopotentielle (Somigliana)
    getG: function(lat) {
        const phi = (lat * Math.PI) / 180;
        return 9.780325 * (1 + 0.00193185 * Math.sin(phi)**2) / Math.sqrt(1 - 0.00669438 * Math.sin(phi)**2);
    },
    // 2. Force de Coriolis (Accélération radiale)
    getCoriolis: function(v, lat) {
        return 2 * 0.00007292115 * v * Math.sin(lat * Math.PI / 180);
    }
};

const Engine = {
    init: function() {
        this.canvas = document.getElementById('telemetry-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.bindSensors();
        this.loop();
    },

    bindSensors: function() {
        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = (now - State.lastTime) / 1000;
            State.lastTime = now;

            const gLocal = Physics.getG(State.lat);
            const pitchRad = State.pitch * (Math.PI / 180);
            
            // FILTRE DE RÉALITÉ : Séparer Accélération vs Pesanteur
            let ay_raw = e.accelerationIncludingGravity.y || 0;
            let ay_pure = ay_raw - (gLocal * Math.sin(pitchRad));
            
            // GESTION DÉCÉLÉRATION VS ACCÉLÉRATION
            if (Math.abs(ay_pure) < 0.06) ay_pure = 0; // Deadband (Anti-vitesse fantôme)

            // Intégration
            State.vInertialMS = math.add(State.vInertialMS, math.multiply(BN(ay_pure), dt));
            State.distTotalM = math.add(State.distTotalM, math.multiply(State.vInertialMS, dt));

            this.updateUI(ay_pure, gLocal);
        });

        window.addEventListener('deviceorientation', (e) => {
            State.pitch = e.beta;
            State.roll = e.gamma;
        });
    },

    updateUI: function(ay, g) {
        const v = math.number(State.vInertialMS);
        const vkmh = v * 3.6;
        
        // Affichage Principal
        document.getElementById('speed-main-display').innerText = vkmh.toFixed(2) + " km/h";
        const accEl = document.getElementById('acc-y');
        accEl.innerText = ay.toFixed(4) + " m/s²";
        
        // Logique Couleur Accel/Décélération
        accEl.style.color = (ay * v < 0) ? "#ff4444" : "#00ff88"; 

        // Coriolis & Poids
        const aC = Physics.getCoriolis(v, State.lat);
        document.getElementById('coriolis-force').innerText = aC.toExponential(4) + " N/kg";
        document.getElementById('poids-newton').innerText = (70 * (g + ay)).toFixed(2) + " N";
        
        // Lorentz & Mach
        const gamma = 1 / Math.sqrt(1 - (Math.abs(v)/299792458)**2);
        document.getElementById('lorentz-factor').innerText = gamma.toExponential(14);
        
        // Thermo
        const temp = 15; // Valeur simulée ou via API
        const vsound = Math.sqrt(1.4 * 287 * (temp + 273.15));
        document.getElementById('vitesse-son-cor').innerText = vsound.toFixed(2) + " m/s";
        document.getElementById('mach-number').innerText = (Math.abs(v)/vsound).toFixed(5);

        // Historique
        State.history.speed.push(v);
        if(State.history.speed.length > 200) State.history.speed.shift();
    },

    loop: function() {
        this.drawGraph();
        this.updateAstro();
        requestAnimationFrame(() => this.loop());
    },

    updateAstro: function() {
        const jd = (Date.now() / 86400000) + 2440587.5;
        document.getElementById('julian-date').innerText = jd.toFixed(5);
        
        const phase = ((jd - 2451550.1) % 29.53) / 29.53;
        document.getElementById('moon-phase-name').innerText = phase < 0.5 ? "Croissante" : "Décroissante";
        document.getElementById('moon-illuminated').innerText = (Math.abs(Math.sin(phase * Math.PI)) * 100).toFixed(1) + " %";
    },

    drawGraph: function() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.strokeStyle = "#00ff88";
        ctx.beginPath();
        State.history.speed.forEach((v, i) => {
            const x = (i / 200) * this.canvas.width;
            const y = 75 - (v * 2);
            if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
};

document.getElementById('start-btn-final').addEventListener('click', function() {
    this.style.display = 'none';
    Engine.init();
});
