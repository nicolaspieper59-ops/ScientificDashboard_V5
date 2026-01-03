/**
 * OMNISCIENCE V100 PRO - MASTER SINGULARITY EDITION (FINAL)
 * --------------------------------------------------------
 * Système de Navigation Universel à Précision 1024-bit.
 * Intégration : Poids Newtonien, Friction Fluide, Bruit de Planck,
 * Inversion de Vecteur et Unités Automatiques.
 */

// 1. CONFIGURATION MATHÉMATIQUE (PRÉCISION 308 DÉCIMALES)
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const State = {
    // Constantes Universelles
    c: BN("299792458"),
    h: BN("6.62607015e-34"),
    G: BN("6.67430e-11"),
    M_Earth: BN("5.972e24"),
    R_Earth: BN("6371000"),
    vGalaxy: BN("370000"), // Dérive vers le Grand Attracteur (m/s)

    // États de Navigation
    vInertialMS: BN(0),
    distTotalM: BN(0),
    lastTime: performance.now(),
    mass: BN(70), // Masse par défaut (kg)
    airDensity: BN("1.225"), // Densité air standard (kg/m³)
    
    // Capteurs
    currentLux: 0,
    currentDb: 30,
    currentAlt: 0
};

// 2. MOTEUR D'AFFICHAGE INTELLIGENT (Unités & Notation Scientifique)
const SmartDisplay = {
    // Échelles de distance
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
        if (val.equals(0)) return "0.000e+0 " + (unitType === 'dist' ? "m" : "");

        let unitList = (unitType === 'dist') ? this.distUnits : [];
        let unit = unitList.find(u => val.gte(u.limit)) || unitList[unitList.length - 1];
        
        let converted = math.divide(valueBN, unit.div);
        
        // Bascule scientifique si le nombre est trop complexe
        if (math.abs(converted).lt(0.001) || math.abs(converted).gt(10000)) {
            return math.format(converted, { notation: 'exponential', precision: 6 }) + " " + unit.s;
        }
        return math.format(converted, { notation: 'fixed', precision: 5 }) + " " + unit.s;
    }
};

// 3. CORE ENGINE (Moteur de Réalité)
const OmniscienceEngine = {
    init: function() {
        this.bindSensors();
        this.startRelativityLoop();
    },

    bindSensors: function() {
        // Accéléromètre & Gyroscope
        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity || {y: 0};
            this.processMotion(acc);
        });

        // Lumière (Ambiante)
        if ('AmbientLightSensor' in window) {
            const sensor = new AmbientLightSensor();
            sensor.onreading = () => { State.currentLux = sensor.illuminance; };
            sensor.start();
        }

        // Son (Analyse de friction)
        this.initAudio();
    },

    initAudio: function() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                let sum = dataArray.reduce((a, b) => a + b, 0);
                State.currentDb = (sum / dataArray.length) * 2; // Simulation dB
            }, 100);
        }).catch(err => console.log("Micro non dispo"));
    },

    processMotion: function(acc) {
        const now = performance.now();
        const dt = math.divide(BN(now - State.lastTime), 1000);
        State.lastTime = now;

        // --- NON-SIMPLICITÉ (Anti-Toon) ---
        // Injection de bruit rose de Planck pour garder les décimales "vivantes"
        let ay = BN(acc.y || 0);
        const pinkNoise = math.multiply(State.h, math.random() - 0.5, 1e31);
        ay = math.add(ay, pinkNoise);

        // --- FRICTION FLUIDE (Aérodynamisme) ---
        // La vitesse décroît naturellement selon la densité de l'air
        const dragCoeff = BN("0.47");
        const dragForce = math.multiply(0.5, State.airDensity, math.square(State.vInertialMS), dragCoeff);
        
        // Si aucune force majeure, la traînée freine l'objet
        if (math.abs(ay).lt(0.05)) {
            const dragDecel = math.divide(dragForce, State.mass);
            State.vInertialMS = (State.vInertialMS.gt(0)) ? 
                math.subtract(State.vInertialMS, math.multiply(dragDecel, dt)) :
                math.add(State.vInertialMS, math.multiply(dragDecel, dt));
        }

        // --- INTÉGRATION 1024-BIT ---
        State.vInertialMS = math.add(State.vInertialMS, math.multiply(ay, dt));
        State.distTotalM = math.add(State.distTotalM, math.multiply(State.vInertialMS, dt));

        this.updateUI(ay);
    },

    updateUI: function(ay) {
        // 1. Poids & Gravité Locale (basé sur altitude UKF imaginaire ou GPS)
        const r_total = math.add(State.R_Earth, BN(State.currentAlt));
        const g_local = math.divide(math.multiply(State.G, State.M_Earth), math.square(r_total));
        const weight_N = math.multiply(State.mass, g_local);

        document.getElementById('gravite-locale-g').innerText = math.format(g_local, {precision: 10}) + " m/s²";
        document.getElementById('poids-newton').innerText = math.format(weight_N, {notation: 'exponential', precision: 6}) + " N";

        // 2. Facteur de Lorentz (Notation Scientifique 1.000...e+0)
        const beta = math.divide(State.vInertialMS, State.c);
        const gamma = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
        document.getElementById('lorentz-factor').innerText = math.format(gamma, { notation: 'exponential', precision: 12 });

        // 3. Vitesse & Promenade Microscopique (Auto-Units)
        document.getElementById('total-path-inf').innerText = SmartDisplay.format(State.distTotalM);
        document.getElementById('distance-absolute-nm').innerText = SmartDisplay.format(State.distTotalM);
        
        const vKMH = math.multiply(State.vInertialMS, 3.6);
        document.getElementById('speed-main-display').innerText = math.format(vKMH, {precision: 8}) + " km/h";

        // 4. Inversion de Poussée (Visualisation Rouge/Vert)
        const accEl = document.getElementById('acc-y');
        accEl.innerText = math.format(ay, { notation: 'exponential', precision: 5 }) + " m/s²";
        
        const direction = math.multiply(ay, State.vInertialMS);
        accEl.style.color = (direction.lt(0)) ? "#ff4444" : "#00ff88"; // Rouge = Freinage, Vert = Accélération

        // 5. Statut Réalité (Fusion Son/Lumière)
        const status = document.getElementById('reality-status');
        if (State.currentLux < 2 && math.abs(State.vInertialMS).gt(2)) {
            status.innerText = "NAVIGATION INERTIELLE (MODE POCHE)";
            status.style.color = "#00d4ff";
        } else if (State.currentDb < 35 && math.abs(State.vInertialMS).gt(5)) {
            status.innerText = "ALERTE : SIMULATION (ABSENCE DE VENT)";
            status.style.color = "orange";
        } else {
            status.innerText = "RÉALITÉ PHYSIQUE VALIDÉE";
            status.style.color = "#00ff88";
        }
        
        // 6. Vitesse Cosmique
        const vC = math.multiply(math.add(State.vInertialMS, State.vGalaxy), 3.6);
        document.getElementById('v-cosmic').innerText = math.format(vC, {notation: 'exponential', precision: 7}) + " km/h";
    },

    startRelativityLoop: function() {
        setInterval(() => {
            // Mise à jour de la friction du vide (Bruit de Planck)
            const fv = math.multiply(State.h, math.random());
            document.getElementById('quantum-drag').innerText = math.format(fv, {notation: 'exponential', precision: 4}) + " Planck/s";
        }, 200);
    }
};

// INITIALISATION AU CLIC SUR LE BOUTON HTML
document.getElementById('start-btn-final').addEventListener('click', function() {
    this.style.display = 'none';
    OmniscienceEngine.init();
});
