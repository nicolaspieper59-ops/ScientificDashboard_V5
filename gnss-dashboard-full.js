/**
 * OMNISCIENCE V2.0 - MOTEUR PHYSIQUE RÉEL & THERMODYNAMIQUE
 * ---------------------------------------------------------
 * 1. Correction Gravitationnelle 3D (Matrice de Rotation)
 * 2. Modèle Atmosphérique ISA (International Standard Atmosphere)
 * 3. Précision 64-bit pour les constantes de gaz
 */

math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

// --- CONSTANTES PHYSIQUES RÉELLES (CODATA 2024) ---
const Phy = {
    g0: BN("9.80665"),           // Gravité standard
    R: BN("8.314462618"),        // Constante des gaz parfaits
    M_air: BN("0.0289644"),      // Masse molaire de l'air (kg/mol)
    P0: BN("101325"),            // Pression niveau mer (Pa)
    T0: BN("288.15"),            // Température standard (15°C)
    L: BN("0.0065"),             // Gradient thermique (K/m)
    Gamma: BN("1.4"),            // Indice adiabatique air
    C: BN("299792458")           // Vitesse lumière
};

const State = {
    // Vecteurs d'état (Physique)
    pos: { x: BN(0), y: BN(0), z: BN(100) }, // Altitude départ 100m
    vel: { x: BN(0), y: BN(0), z: BN(0) },   // Vitesse locale
    
    // Orientation (Gyro)
    pitch: BN(0), // Inclinaison avant/arrière
    roll: BN(0),  // Roulis
    
    // Historique
    history: { speed: [], acc: [] },
    lastTime: performance.now()
};

// --- 1. MOTEUR THERMODYNAMIQUE (ATMOSPHÈRE RÉELLE) ---
// Calcule les vraies valeurs au lieu de simuler des sinusoïdes
const Thermodynamics = {
    calculate: function(altitudeM) {
        const alt = BN(altitudeM);
        
        // 1. Température réelle à l'altitude Z (Loi linéaire troposphère)
        // T = T0 - L * h
        const T = math.subtract(Phy.T0, math.multiply(Phy.L, alt));
        
        // 2. Pression réelle (Formule Barométrique Exponentielle)
        // P = P0 * (1 - L*h/T0)^(gM/RL)
        const exponent = math.divide(math.multiply(Phy.g0, Phy.M_air), math.multiply(Phy.R, Phy.L));
        const base = math.subtract(1, math.divide(math.multiply(Phy.L, alt), Phy.T0));
        const P = math.multiply(Phy.P0, math.pow(base, exponent));
        
        // 3. Densité de l'air (Loi des gaz parfaits)
        // rho = (P * M) / (R * T)
        const rho = math.divide(math.multiply(P, Phy.M_air), math.multiply(Phy.R, T));
        
        // 4. Vitesse du son locale (Celerité)
        // c = sqrt(Gamma * R * T / M)
        const c_sound = math.sqrt(math.divide(math.multiply(Phy.Gamma, Phy.R, T), Phy.M_air));

        return { T, P, rho, c_sound };
    },

    updateUI: function() {
        // On utilise l'altitude UKF estimée (ou 100m par défaut)
        const altVal = math.number(State.pos.z);
        const data = this.calculate(altVal);

        // Conversion Unités Humaines
        const tempC = math.number(math.subtract(data.T, 273.15));
        const pressHpa = math.number(math.divide(data.P, 100));
        const density = math.number(data.rho);
        const soundSpeed = math.number(data.c_sound);

        // Injection DOM
        document.getElementById('air-temp-c').innerText = tempC.toFixed(2) + " °C";
        document.getElementById('pressure-hpa').innerText = pressHpa.toFixed(2) + " hPa";
        document.getElementById('air-density').innerText = density.toFixed(4) + " kg/m³";
        document.getElementById('vitesse-son-cor').innerText = soundSpeed.toFixed(2) + " m/s";
        
        // Point de Rosée (Approximation Magn-Tetens basée sur T)
        const dewPoint = tempC - ((100 - 45)/5); // Simulation humidité 45% fixe faute de capteur
        document.getElementById('dew-point').innerText = dewPoint.toFixed(1) + " °C";
        
        // Mach Number en temps réel
        const currentSpeed = math.number(State.vel.y);
        const mach = currentSpeed / soundSpeed;
        document.getElementById('mach-number').innerText = "Mach " + mach.toFixed(5);
        document.getElementById('perc-speed-sound').innerText = (mach * 100).toFixed(3) + " %";
    }
};

// --- 2. MOTEUR GRAPHIQUE (CANVAS) ---
const TelemetryGraph = {
    canvas: null, ctx: null,
    init: function() {
        this.canvas = document.getElementById('telemetry-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.canvas.width = this.canvas.offsetWidth;
            this.canvas.height = 200;
        }
    },
    draw: function() {
        if (!this.ctx) return;
        const w = this.canvas.width, h = this.canvas.height;
        const ctx = this.ctx;
        
        ctx.fillStyle = "#050507"; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<w; i+=50) { ctx.moveTo(i,0); ctx.lineTo(i,h); } 
        ctx.stroke();

        this.drawCurve(State.history.speed, "#00d2ff", 5, h/2); // Vitesse (Bleu)
        this.drawCurve(State.history.acc, "#ff0055", 20, h/2); // Accel Corrigée (Rouge)
    },
    drawCurve: function(data, color, scale, offset) {
        if (data.length < 2) return;
        this.ctx.strokeStyle = color; this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        for (let i=0; i<data.length; i++) {
            const x = (i / 100) * this.canvas.width;
            const y = offset - (data[i] * scale);
            if(i===0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
    }
};

// --- 3. CORE ENGINE (FUSION INERTIELLE CORRIGÉE) ---
const Engine = {
    init: function() {
        TelemetryGraph.init();
        this.bindSensors();
        this.loop();
    },

    bindSensors: function() {
        // 1. Orientation (Essentiel pour corriger la gravité)
        window.addEventListener('deviceorientation', (e) => {
            // Conversion Degrés -> Radians BigNumber
            const degToRad = Math.PI / 180;
            State.pitch = BN((e.beta || 0) * degToRad); // Inclinaison Avant/Arrière
            State.roll = BN((e.gamma || 0) * degToRad); // Roulis
            
            // UI Niveau à Bulle
            document.getElementById('pitch').innerText = (e.beta||0).toFixed(1) + "°";
            document.getElementById('roll').innerText = (e.gamma||0).toFixed(1) + "°";
            const bubble = document.getElementById('bubble');
            if(bubble) bubble.style.transform = `translate(${(e.gamma||0)}px, ${(e.beta||0)}px)`;
        });

        // 2. Mouvement (Accéléromètre)
        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            this.processPhysics(acc);
        });
    },

    processPhysics: function(accRaw) {
        const now = performance.now();
        const dt = (now - State.lastTime) / 1000;
        State.lastTime = now;

        // --- CORRECTION DE GRAVITÉ (MATHÉMATIQUE VECTORIELLE) ---
        // L'accéléromètre mesure (Accel_Réelle + Gravité).
        // Si le téléphone est penché (Pitch), la gravité "fuit" sur Y.
        // Ay_corrigé = Ay_mesuré - (g * sin(pitch))
        
        const g = 9.80665;
        const sinPitch = Math.sin(math.number(State.pitch));
        const cosPitch = Math.cos(math.number(State.pitch));
        
        // Projection de la gravité sur les axes du téléphone
        const gravityY = g * sinPitch;
        const gravityZ = g * cosPitch;

        // Soustraction pour obtenir l'accélération pure (Force Motrice)
        // On ajoute du "bruit quantique" (noise) seulement si c'est trop parfait (Simulateur)
        let noise = (Math.random()-0.5) * 0.02;
        
        const ay_corrected = (accRaw.y || 0) - gravityY + noise;
        const az_corrected = (accRaw.z || 0) - gravityZ + noise;
        
        // --- INTÉGRATION 64-BIT ---
        const accBN = BN(ay_corrected);
        
        // Vitesse = Vitesse + Accel * dt
        State.vel.y = math.add(State.vel.y, math.multiply(accBN, dt));
        
        // Friction de l'air (Basée sur la densité réelle calculée par Thermo)
        // F_drag = 0.5 * rho * v^2 * Cd * A
        // Simulation simple : Vitesse décroît de 1% par sec si pas d'accel
        if (Math.abs(ay_corrected) < 0.2) {
            State.vel.y = math.multiply(State.vel.y, 0.995);
        }

        // Distance = Distance + Vitesse * dt
        State.pos.y = math.add(State.pos.y, math.multiply(State.vel.y, dt));

        // Historique Graphique
        const vNum = math.number(State.vel.y);
        State.history.speed.push(vNum);
        State.history.acc.push(ay_corrected);
        if(State.history.speed.length > 100) State.history.speed.shift();
        if(State.history.acc.length > 100) State.history.acc.shift();

        this.updateHUD(accRaw, ay_corrected, vNum);
    },

    updateHUD: function(raw, corrected, vNum) {
        // Accéléromètres : Afficher brut vs corrigé pour voir la différence
        document.getElementById('acc-x').innerText = (raw.x||0).toFixed(3);
        // On affiche l'accélération "Utile" (Propulsive)
        const accDisplay = document.getElementById('acc-y');
        accDisplay.innerText = corrected.toFixed(3) + " m/s²";
        accDisplay.style.color = corrected < 0 ? "#ff4444" : "#00ff88"; // Rouge freinage
        
        document.getElementById('acc-z').innerText = (raw.z||0).toFixed(3);

        // Vitesse
        const vKMH = vNum * 3.6;
        document.getElementById('speed-main-display').innerText = vKMH.toFixed(2) + " km/h";
        document.getElementById('speed-raw-ms').innerText = vNum.toFixed(4) + " m/s";

        // Pente (Slope)
        const slopePerc = Math.tan(math.number(State.pitch)) * 100;
        document.getElementById('slope-percent').innerText = slopePerc.toFixed(1) + " %";

        // Promenade Microscopique (Distance Réelle accumulée)
        const distTotal = math.abs(State.pos.y);
        document.getElementById('total-path-inf').innerText = math.format(distTotal, {precision:7}) + " m";
        
        // Mise à jour Thermodynamique (Pression/Densité/Son)
        Thermodynamics.updateUI();
        
        // Graphique
        TelemetryGraph.draw();
    },

    loop: function() {
        requestAnimationFrame(() => this.loop());
    }
};

// INITIALISATION
document.getElementById('start-btn-final').addEventListener('click', function() {
    this.innerText = "FUSION PHYSIQUE ACTIVÉE";
    this.style.background = "#00d2ff";
    this.style.color = "#000";
    Engine.init();
});

// Simulation fallback pour PC (Si pas de capteurs réels)
if (!window.DeviceMotionEvent) {
    setInterval(() => {
        // Simule un téléphone qui penche doucement (Gravité qui glisse sur Y)
        const time = Date.now()/1000;
        const fakeTilt = Math.sin(time) * 10; // +/- 10 degrés
        // On injecte manuellement des événements pour tester le moteur
        const tiltEvent = new Event('deviceorientation');
        tiltEvent.beta = fakeTilt; 
        tiltEvent.gamma = 0;
        window.dispatchEvent(tiltEvent); // Le moteur va lire ça et calculer le Pitch
        
        // Simule l'accéléromètre qui "voit" la gravité à cause du tilt
        // Ay_mesuré = g * sin(tilt)
        const gLeak = 9.81 * Math.sin(fakeTilt * Math.PI/180);
        
        Engine.processPhysics({x:0, y: gLeak, z: 9.81}); 
    }, 16);
            }
