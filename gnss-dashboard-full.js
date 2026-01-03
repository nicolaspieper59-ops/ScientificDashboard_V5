/**
 * OMNISCIENCE V100 PRO - SYSTÈME DE NAVIGATION SINGULARITY
 * --------------------------------------------------------
 * - Fusion Sensorielle 64-bit (Math.js)
 * - Correction Géopotentielle & Coriolis
 * - Astro-Navigation & Thermodynamique ISA
 */

// CONFIGURATION MATHÉMATIQUE 64-BIT
math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

// ÉTAT GLOBAL DU SYSTÈME
const State = {
    vInertialMS: BN(0),
    distTotalM: BN(0),
    lat: 43.296482, // Marseille par défaut
    lon: 5.36978,
    alt: 24.5,
    pitch: 0,
    roll: 0,
    history: { speed: [] },
    lastUpdate: performance.now()
};

// --- MODULE 1 : PHYSIQUE & DYNAMIQUE ---
const PhysicsEngine = {
    // Gravité locale via Somigliana (Précision GRS80)
    getGravity: function(lat) {
        const phi = (lat * Math.PI) / 180;
        const g_eq = 9.780325;
        const k = 0.00193185;
        const e2 = 0.00669438;
        return g_eq * (1 + k * Math.sin(phi)**2) / Math.sqrt(1 - e2 * Math.sin(phi)**2);
    },

    // Accélération de Coriolis (m/s²)
    getCoriolis: function(v, lat) {
        const omega = 7.292115e-5; // Vitesse rotation Terre
        return 2 * omega * v * Math.sin(lat * Math.PI / 180);
    }
};

// --- MODULE 2 : THERMODYNAMIQUE (ISA) ---
const ThermoEngine = {
    update: function(altitude) {
        // Constantes ISA
        const T0 = 288.15; // 15°C en Kelvin
        const P0 = 1013.25; // hPa
        const L = 0.0065; // Gradient thermique K/m
        const R = 287.05; // Constante air sec

        const tempK = T0 - (L * altitude);
        const pressure = P0 * Math.pow((1 - (L * altitude) / T0), 5.255);
        const density = (pressure * 100) / (R * tempK);
        const soundSpeed = Math.sqrt(1.4 * R * tempK);

        // Mise à jour HTML (Colonne 3)
        document.getElementById('air-temp-c').innerText = (tempK - 273.15).toFixed(2) + " °C";
        document.getElementById('pressure-hpa').innerText = pressure.toFixed(2) + " hPa";
        document.getElementById('air-density').innerText = density.toFixed(4) + " kg/m³";
        document.getElementById('vitesse-son-cor').innerText = soundSpeed.toFixed(2) + " m/s";
        
        return { density, soundSpeed };
    }
};

// --- MODULE 3 : ASTRO-NAVIGATION ---
const AstroEngine = {
    update: function() {
        const now = new Date();
        const jd = (now.getTime() / 86400000) + 2440587.5;
        const d = jd - 2451545.0;

        // Temps Sidéral Local (LST)
        const ut = (now.getTime() % 86400000) / 3600000;
        const gmst = (6.697374558 + 0.06570982441908 * d + 1.00273790935 * ut) % 24;
        const lst = (gmst + State.lon / 15 + 24) % 24;

        // Position Soleil (Approx)
        const sunAz = (280.460 + 0.9856474 * d) % 360;
        
        // Phase Lune
        const moonCycle = 29.530588853;
        const phase = ((jd - 2451550.1) % moonCycle) / moonCycle;

        // Mise à jour HTML (Colonne 4)
        document.getElementById('julian-date').innerText = jd.toFixed(6);
        document.getElementById('lst-vrai').innerText = lst.toFixed(4) + " h";
        document.getElementById('sun-azimuth').innerText = (sunAz < 0 ? sunAz + 360 : sunAz).toFixed(2) + "°";
        document.getElementById('moon-phase-name').innerText = phase < 0.5 ? "Croissante" : "Décroissante";
        document.getElementById('moon-illuminated').innerText = (Math.abs(Math.sin(phase * Math.PI)) * 100).toFixed(1) + " %";
    }
};

// --- MOTEUR PRINCIPAL (CORE) ---
const MainEngine = {
    init: function() {
        this.canvas = document.getElementById('telemetry-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupSensors();
        this.run();
    },

    setupSensors: function() {
        // Gyroscope / Inclinaison
        window.addEventListener('deviceorientation', (e) => {
            State.pitch = e.beta || 0;
            State.roll = e.gamma || 0;
        });

        // Accéléromètre
        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = (now - State.lastUpdate) / 1000;
            State.lastUpdate = now;

            const gLocal = PhysicsEngine.getGravity(State.lat);
            const pitchRad = (State.pitch * Math.PI) / 180;

            // Correction de pente : Accel_Pure = Accel_Brute - (g * sin(pitch))
            let ay_raw = e.accelerationIncludingGravity.y || 0;
            let ay_pure = ay_raw - (gLocal * Math.sin(pitchRad));

            // Filtre Anti-Vibration (Deadband)
            if (Math.abs(ay_pure) < 0.05) ay_pure = 0;

            // Intégration 64-bit
            const accBN = BN(ay_pure);
            State.vInertialMS = math.add(State.vInertialMS, math.multiply(accBN, dt));
            
            // Friction naturelle (Amortissement)
            if (ay_pure === 0) State.vInertialMS = math.multiply(State.vInertialMS, 0.99);

            const vNum = math.number(State.vInertialMS);
            State.distTotalM = math.add(State.distTotalM, math.multiply(State.vInertialMS, dt));

            this.processLogic(ay_pure, vNum, gLocal);
        });
    },

    processLogic: function(ay, v, g) {
        // 1. Détection Accélération vs Décélération (Non-opposés)
        const accEl = document.getElementById('acc-y');
        accEl.innerText = ay.toFixed(4) + " m/s²";
        
        // Si v et ay sont de signes opposés = Freinage (Dissipation d'énergie)
        if (v * ay < -0.01) {
            accEl.style.color = "#ff4444"; // Rouge Décélération
            document.getElementById('reality-status').innerText = "DÉCÉLÉRATION (DISSIPATION)";
            const drag = Math.abs(ay * 70 * v) / 1000; // P = F * v
            document.getElementById('drag-power').innerText = drag.toFixed(2) + " kW";
        } else if (Math.abs(ay) > 0.01) {
            accEl.style.color = "#00ff88"; // Vert Accélération
            document.getElementById('reality-status').innerText = "PROPULSION ACTIVE";
            document.getElementById('drag-power').innerText = "0.00 kW";
        } else {
            accEl.style.color = "var(--cyan)";
            document.getElementById('reality-status').innerText = "VITESSE STABLE";
        }

        // 2. Mise à jour Colonne 1 (Dynamique)
        document.getElementById('speed-main-display').innerText = (v * 3.6).toFixed(2) + " km/h";
        const aCor = PhysicsEngine.getCoriolis(v, State.lat);
        document.getElementById('coriolis-force').innerText = aCor.toExponential(4) + " N/kg";
        document.getElementById('poids-newton').innerText = (70 * (g + ay)).toFixed(2) + " N";
        const gRes = Math.sqrt(ay**2 + g**2) / 9.80665;
        document.getElementById('g-force-resultant').innerText = gRes.toFixed(3) + " G";

        // 3. Mise à jour Colonne 2 (Relativité)
        const beta = Math.abs(v) / 299792458;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        document.getElementById('lorentz-factor').innerText = gamma.toExponential(14);
        document.getElementById('total-path-inf').innerText = (math.number(State.distTotalM) * 1e9).toFixed(0) + " nm";
        document.getElementById('local-gravity').innerText = g.toFixed(6);

        // 4. Historique Graphique
        State.history.speed.push(v);
        if (State.history.speed.length > 200) State.history.speed.shift();
    },

    run: function() {
        // Boucle graphique 60fps
        const draw = () => {
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;
            ctx.clearRect(0, 0, w, h);
            
            // Grille
            ctx.strokeStyle = "#111";
            for(let i=0; i<w; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }

            // Courbe de vitesse
            ctx.strokeStyle = "#00ff88";
            ctx.lineWidth = 2;
            ctx.beginPath();
            State.history.speed.forEach((v, i) => {
                const x = (i / 200) * w;
                const y = (h/2) - (v * 2);
                if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            requestAnimationFrame(draw);
        };
        draw();

        // Boucles lentes (Thermo et Astro)
        setInterval(() => {
            ThermoEngine.update(State.alt);
            AstroEngine.update();
            
            // Calcul Mach Number
            const soundV = parseFloat(document.getElementById('vitesse-son-cor').innerText);
            const v = Math.abs(math.number(State.vInertialMS));
            document.getElementById('mach-number').innerText = "Mach " + (v / soundV).toFixed(5);
        }, 1000);
    }
};

// DÉMARRAGE
document.getElementById('start-btn-final').addEventListener('click', function() {
    this.style.display = 'none';
    MainEngine.init();
});
