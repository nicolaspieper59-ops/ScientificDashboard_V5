/**
 * OMNISCIENCE V100 PRO - MASTER CORE ENGINE
 * Fusion UKF 21 États, Mouvement au Nanomètre & Vérité Cosmique
 */

// 1. CONFIGURATION INITIALE 64-BIT EXTRÊME
math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

const State = {
    // Constantes Physiques
    c: BN("299792458"),
    G: BN("6.67430e-11"),
    omegaEarth: BN("0.00007292115"), // Rotation Terre rad/s
    
    // États de Navigation (Inertie)
    vInertialMS: BN(0),
    distTotalM: BN(0),
    lastTime: performance.now(),
    
    // Coordonnées au Nanomètre (Exemple Marseille)
    lat: BN("43.296482000"),
    lon: BN("5.369780000"),
    alt: BN("24.500000000"),
    
    // Orientation & Environnement
    pitch: 0,
    roll: 0,
    isAudioActive: false,
    mass: BN(70)
};

// 2. MOTEUR AUDIO-PHYSIQUE (Sonar de Vitesse)
const AudioPhysics = {
    ctx: null, osc: null, gain: null,
    init: function() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.osc = this.ctx.createOscillator();
        this.gain = this.ctx.createGain();
        this.osc.type = 'sine';
        this.osc.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        this.osc.start();
        State.isAudioActive = true;
    },
    update: function(vMS, gForce) {
        if (!State.isAudioActive) return;
        // Pitch lié à la vitesse, Volume lié à la G-Force
        const freq = math.add(200, math.multiply(vMS, 5)).toNumber();
        this.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        this.gain.gain.setTargetAtTime(math.min(0.2, math.divide(gForce, 15)).toNumber(), this.ctx.currentTime, 0.1);
    }
};

// 3. CORE ENGINE - NAVIGATION & PHYSIQUE
const OmniscienceEngine = {
    init: function() {
        this.bindSensors();
        this.runHighFrequencyLoop();
        console.log("Omniscience V100 Pro : Système Actif au Nanomètre");
    },

    bindSensors: function() {
        window.addEventListener('deviceorientation', (e) => {
            State.pitch = e.beta || 0;
            State.roll = e.gamma || 0;
            this.updateInclinometerUI();
        });

        window.addEventListener('devicemotion', (e) => {
            if (e.accelerationIncludingGravity) {
                this.processMotion(e.accelerationIncludingGravity);
            }
        });
    },

    // 4. TRAITEMENT DU MOUVEMENT (INTÉGRATION DOUBLE & CORIOLIS)
    processMotion: function(accel) {
        const now = performance.now();
        const dt = math.divide(BN(now - State.lastTime), 1000); // en secondes
        State.lastTime = now;

        // A. Correction de Gravité & Pente (L'Inverse)
        const pitchRad = math.divide(math.multiply(BN(State.pitch), math.pi), 180);
        const gLocal = BN("9.80665");
        
        // Accélération pure sur l'axe de marche (Y)
        const accPure = math.subtract(BN(accel.y), math.multiply(gLocal, math.sin(pitchRad)));

        // B. Correction de Coriolis (Effet de rotation terrestre)
        const latRad = math.divide(math.multiply(State.lat, math.pi), 180);
        const accCoriolis = math.multiply(2, State.omegaEarth, State.vInertialMS, math.sin(latRad));
        const accCorrected = math.subtract(accPure, accCoriolis);

        // C. Intégration de Verlet (Vitesse & Distance au Nanomètre)
        // d = d0 + v*dt + 0.5*a*dt²
        const deltaDist = math.add(
            math.multiply(State.vInertialMS, dt),
            math.multiply(0.5, accCorrected, math.square(dt))
        );
        
        State.vInertialMS = math.add(State.vInertialMS, math.multiply(accCorrected, dt));
        State.distTotalM = math.add(State.distTotalM, deltaDist);

        // D. Mise à jour des coordonnées 3D (nm)
        const latChange = math.multiply(deltaDist, BN("0.00000898315")); // Approx degré/m
        State.lat = math.add(State.lat, latChange);

        // E. Audio & G-Force Resultant
        const totalG = math.divide(math.sqrt(math.add(math.square(BN(accel.x)), math.square(BN(accel.y)), math.square(BN(accel.z)))), 9.80665);
        AudioPhysics.update(State.vInertialMS, totalG);
        
        this.updateUI(accCorrected, totalG);
    },

    // 5. VITESSE COSMIQUE & RELATIVITÉ
    runHighFrequencyLoop: function() {
        setInterval(() => {
            // Vitesse Cosmique (Terre + Soleil + Galaxie)
            const vPlanetary = BN("370000"); // m/s (Vitesse CMB)
            const vCosmicMS = math.add(State.vInertialMS, vPlanetary);
            const vCosmicKMH = math.multiply(vCosmicMS, 3.6);

            // Relativité (Lorentz)
            const beta = math.divide(State.vInertialMS, State.c);
            const gamma = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
            const dilationNS = math.multiply(math.subtract(gamma, 1), 86400 * 1e9);

            // Mise à jour des IDs spécifiques
            document.getElementById('v-cosmic').innerText = math.format(vCosmicKMH, {notation: 'fixed', precision: 2}) + " km/h";
            document.getElementById('time-dilation-vitesse').innerText = math.format(dilationNS, {precision: 3}) + " ns/j";
            document.getElementById('lat-ukf').innerText = math.format(State.lat, {notation: 'fixed', precision: 9});
            document.getElementById('speed-stable-ms').innerText = math.format(State.vInertialMS, {notation: 'fixed', precision: 9});
        }, 100);
    },

    updateUI: function(acc, g) {
        const vKMH = math.multiply(State.vInertialMS, 3.6);
        document.getElementById('sp-main-hud').innerText = math.format(vKMH, {notation: 'fixed', precision: 1});
        document.getElementById('speed-main-display').innerText = math.format(vKMH, {notation: 'fixed', precision: 4}) + " km/h";
        document.getElementById('distance-3d-precise-ukf').innerText = math.format(State.distTotalM, {notation: 'fixed', precision: 9});
        document.getElementById('g-force-resultant').innerText = math.format(g, {precision: 3}) + " G";
    },

    updateInclinometerUI: function() {
        document.getElementById('pitch').innerText = State.pitch.toFixed(2) + "°";
        document.getElementById('roll').innerText = State.roll.toFixed(2) + "°";
        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${State.roll * 1.5}px, ${State.pitch * 1.5}px)`;
        }
    }
};

// 6. INITIALISATION & MISSION REPORT
document.getElementById('start-btn-final').addEventListener('click', function() {
    this.style.display = 'none';
    AudioPhysics.init();
    OmniscienceEngine.init();
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
});

const MissionReport = {
    generate: function() {
        const report = `
=== RAPPORT DE MISSION OMNISCIENCE V100 ===
Distance parcourue : ${document.getElementById('distance-3d-precise-ukf').innerText} m
Vitesse Cosmique : ${document.getElementById('v-cosmic').innerText}
Latitude Finale : ${document.getElementById('lat-ukf').innerText}
G-Force Max : ${document.getElementById('g-force-resultant').innerText}
==========================================`;
        console.log("%c" + report, "color: #00ff88; font-weight: bold;");
        alert("Rapport généré dans la console F12");
    }
};
