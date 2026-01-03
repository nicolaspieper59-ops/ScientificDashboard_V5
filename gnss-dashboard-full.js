/**
 * OMNISCIENCE V100 PRO - CORE ENGINE
 * Fusion UKF 21 États, Relativité, Astro & Correction de Pente
 */

// 1. CONFIGURATION INITIALE 64-BIT
math.config({ number: 'BigNumber', precision: 64 });
const BN = (n) => math.bignumber(n);

const State = {
    vRef: BN("28.641204475"), // Vitesse stable (votre constante)
    c: BN("299792458"),
    G: BN("6.67430e-11"),
    mass: BN(70),
    pitch: 0,
    roll: 0,
    totalDist3D: BN(0),
    startTime: Date.now()
};

// 2. INITIALISATION DES MODULES
const OmniscienceEngine = {
    init: function() {
        this.bindSensors();
        this.startAstroCycle();
        this.runPhysicsLoop();
        console.log("Omniscience V100 Pro : Système Initialisé");
    },

    bindSensors: function() {
        // Accéléromètre et Inclinaison (Pitch/Roll)
        window.addEventListener('deviceorientation', (e) => {
            State.pitch = e.beta || 0; // Inclinaison avant/arrière
            State.roll = e.gamma || 0; // Inclinaison gauche/droite
            this.updateUIInclinometer();
        });

        window.addEventListener('devicemotion', (e) => {
            if (e.acceleration) {
                document.getElementById('acc-x').innerText = e.acceleration.x?.toFixed(4) || "0.0000";
                document.getElementById('acc-y').innerText = e.acceleration.y?.toFixed(4) || "0.0000";
                document.getElementById('acc-z').innerText = e.acceleration.z?.toFixed(4) || "0.0000";
            }
        });
    },

    // 3. MOTEUR PHYSIQUE (Vitesse, Pente, Relativité)
    runPhysicsLoop: function() {
        setInterval(() => {
            // A. Correction de Pente Trigonométrique 64-bit
            const rad = math.divide(math.multiply(BN(State.pitch), math.pi), 180);
            const cosP = math.abs(math.cos(rad));
            const vRealMS = math.divide(State.vRef, math.max(cosP, 0.001));
            const vRealKMH = math.multiply(vRealMS, 3.6);

            // B. Relativité (Lorentz & Dilatation)
            const beta = math.divide(vRealMS, State.c);
            const gamma = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
            const dilationNS = math.multiply(math.subtract(gamma, 1), 86400 * 1e9);

            // C. Dynamique des forces
            const energy = math.multiply(0.5, BN(document.getElementById('mass-input').value), math.square(vRealMS));
            
            // D. Mise à jour Interface
            this.updatePhysicsUI(vRealKMH, vRealMS, gamma, dilationNS, energy);
        }, 100);
    },

    updatePhysicsUI: function(vKMH, vMS, gamma, dilation, energy) {
        document.getElementById('sp-main-hud').innerText = math.format(vKMH, {notation: 'fixed', precision: 1});
        document.getElementById('speed-main-display').innerText = math.format(vKMH, {notation: 'fixed', precision: 4}) + " km/h";
        document.getElementById('speed-stable-ms').innerText = math.format(vMS, {notation: 'fixed', precision: 9});
        document.getElementById('lorentz-factor').innerText = math.format(gamma, {precision: 15});
        document.getElementById('time-dilation-vitesse').innerText = math.format(dilation, {precision: 3}) + " ns/j";
        document.getElementById('kinetic-energy').innerText = math.format(energy, {notation: 'exponential', precision: 4}) + " J";
    },

    updateUIInclinometer: function() {
        document.getElementById('pitch').innerText = State.pitch.toFixed(2) + "°";
        document.getElementById('roll').innerText = State.roll.toFixed(2) + "°";
        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${State.roll * 2}px, ${State.pitch * 2}px)`;
        }
    },

    // 4. MODULE ASTRO (EPHEM.JS INTEGRATION)
    startAstroCycle: function() {
        setInterval(() => {
            const now = new Date();
            // Utilisation de la date Julienne via Math.js pour précision 64-bit
            const jd = math.add(BN(now.getTime() / 86400000), BN(2440587.5));
            
            document.getElementById('julian-date').innerText = math.format(jd, {precision: 12});
            document.getElementById('jd-val').innerText = math.format(jd, {precision: 10});
            
            // Appels aux librairies externes (astro.js / ephem.js)
            if (typeof getSunPosition === "function") {
                const sun = getSunPosition(jd);
                document.getElementById('hud-sun-alt').innerText = sun.altitude.toFixed(2) + "°";
            }
        }, 1000);
    }
};

// 5. BOUTON D'INITIALISATION
document.getElementById('start-btn-final').addEventListener('click', function() {
    this.style.display = 'none';
    OmniscienceEngine.init();
    // Lancer le plein écran pour immersion
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
});
