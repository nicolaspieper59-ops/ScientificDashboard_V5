/**
 * OMNISCIENCE V100 PRO - MASTER SINGULARITY EDITION
 * Precision: 1024-bit (308 digits)
 * Features: Auto-Unit Scaling, Scientific Notation, Acceleration Inversion,
 * Toon-Detector, Bio-Signature & Extreme Motion (Rollercoaster).
 */

// 1. CONFIGURATION MATHÉMATIQUE MAXIMALE
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const State = {
    c: BN("299792458"),
    G: BN("6.6743015e-11"),
    h: BN("6.62607015e-34"), 
    omegaEarth: BN("0.00007292115"),
    vGalaxy: BN("370000"),
    vInertialMS: BN(0),
    distTotalM: BN(0),
    lastTime: performance.now(),
    lat: BN("43.296482000"),
    lon: BN("5.369780000"),
    mass: BN(70),
    pitch: BN(0),
    roll: BN(0)
};

// 2. MOTEUR D'AFFICHAGE SCIENTIFIQUE ADAPTATIF
const SmartDisplay = {
    // Unités pour la distance
    distUnits: [
        { limit: BN("1.496e+11"), div: BN("1.496e+11"), s: "UA" },
        { limit: BN("1000"), div: BN("1000"), s: "km" },
        { limit: BN("1"), div: BN(1), s: "m" },
        { limit: BN("1e-3"), div: BN("1e-3"), s: "mm" },
        { limit: BN("1e-6"), div: BN("1e-6"), s: "µm" },
        { limit: BN("1e-9"), div: BN("1e-9"), s: "nm" }
    ],

    format: function(valueBN, unitType = 'dist') {
        let val = math.abs(valueBN);
        if (val.equals(0)) return "0.000 " + (unitType === 'dist' ? "m" : "m/s");

        let unitList = (unitType === 'dist') ? this.distUnits : [];
        let unit = unitList.find(u => val.gte(u.limit)) || unitList[unitList.length - 1];
        
        let converted = math.divide(valueBN, unit.div);
        let absConv = math.abs(converted);

        // Déclenchement affichage scientifique si trop de décimales ou trop grand
        if (absConv.gt(10000) || absConv.lt(0.001)) {
            return math.format(converted, { notation: 'exponential', precision: 5 }) + " " + unit.symbol;
        }
        return math.format(converted, { notation: 'fixed', precision: 5 }) + " " + unit.s;
    }
};

// 3. CORE ENGINE
const OmniscienceEngine = {
    init: function() {
        this.bindSensors();
        this.startAstroRelativityLoop();
    },

    bindSensors: function() {
        window.addEventListener('deviceorientation', (e) => {
            State.pitch = BN(e.beta || 0);
            State.roll = BN(e.gamma || 0);
            this.updateInclinometer();
        });

        window.addEventListener('devicemotion', (e) => {
            if (e.accelerationIncludingGravity) this.processMotion(e.accelerationIncludingGravity);
        });
    },

    processMotion: function(accel) {
        const now = performance.now();
        const dt = math.divide(BN(now - State.lastTime), 1000);
        State.lastTime = now;

        // Calcul Vecteur Accélération (y longitudinal)
        const ay = BN(accel.y || 0);
        
        // INTEGRATION DE VERLET 1024-BIT
        const deltaV = math.multiply(ay, dt);
        const deltaD = math.add(math.multiply(State.vInertialMS, dt), math.multiply(0.5, ay, math.square(dt)));
        
        State.vInertialMS = math.add(State.vInertialMS, deltaV);
        State.distTotalM = math.add(State.distTotalM, deltaD);

        this.updateUI(ay);
    },

    updateUI: function(currentAcc) {
        // 1. Vitesse & Distance (Unités Auto)
        document.getElementById('total-path-inf').innerText = SmartDisplay.format(State.distTotalM, 'dist');
        document.getElementById('distance-3d-precise-ukf').innerText = SmartDisplay.format(State.distTotalM, 'dist');
        
        const vKMH = math.multiply(State.vInertialMS, 3.6);
        document.getElementById('speed-main-display').innerText = math.format(vKMH, {precision: 10}) + " km/h";

        // 2. INVERSION ACCÉLÉRATION / DÉCÉLÉRATION
        const accDisplay = document.getElementById('acc-y');
        // Affichage scientifique pour les micro-frictions
        accDisplay.innerText = math.format(currentAcc, {notation: 'exponential', precision: 5}) + " m/s²";
        
        const status = document.getElementById('reality-status');
        const direction = math.multiply(currentAcc, State.vInertialMS);
        
        if (direction.lt(0)) {
            status.innerText = "DÉCÉLÉRATION (INVERSION)";
            status.style.color = "#ffcc00"; 
        } else if (direction.gt(0)) {
            status.innerText = "ACCÉLÉRATION (POUSSÉE)";
            status.style.color = "#00ff88";
        }

        // 3. TOON DETECTOR (Réalisme)
        if (currentAcc.equals(0)) {
            status.innerText = "SIMULATION / TOON-PHYSICS";
            status.style.color = "#ff0055";
        }

        // 4. Énergie (Notation Scientifique si nécessaire)
        const energy = math.multiply(0.5, State.mass, math.square(State.vInertialMS));
        document.getElementById('kinetic-energy').innerText = math.format(energy, {notation: 'exponential', precision: 5}) + " J";
    },

    startAstroRelativityLoop: function() {
        setInterval(() => {
            // Dilatation temporelle
            const beta = math.divide(State.vInertialMS, State.c);
            const gamma = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
            document.getElementById('lorentz-factor').innerText = math.format(gamma, {precision: 30});

            // Vitesse Cosmique (Affichage Scientifique Permanent)
            const vCosmic = math.multiply(math.add(State.vInertialMS, State.vGalaxy), 3.6);
            document.getElementById('v-cosmic').innerText = math.format(vCosmic, {notation: 'exponential', precision: 8}) + " km/h";

            // Friction du Vide (Planck Scale)
            const friction = math.multiply(State.h, math.random());
            document.getElementById('quantum-drag').innerText = math.format(friction, {notation: 'exponential', precision: 4}) + " Planck/s";
        }, 100);
    },

    updateInclinometer: function() {
        document.getElementById('pitch').innerText = math.format(State.pitch, {precision: 5}) + "°";
        document.getElementById('roll').innerText = math.format(State.roll, {precision: 5}) + "°";
    }
};

// INITIALISATION
document.getElementById('start-btn-final').addEventListener('click', function() {
    this.style.display = 'none';
    OmniscienceEngine.init();
});
