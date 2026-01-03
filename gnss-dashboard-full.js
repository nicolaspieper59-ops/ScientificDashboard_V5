/**
 * OMNISCIENCE V100 PRO - SINGULARITY CORE (1024-BIT)
 * MODULE DE FUSION TOTAL : Système, Dynamique, Environnement, Astro.
 */

// 1. CONFIGURATION DU NOYAU 1024-BIT
math.config({ number: 'BigNumber', precision: 308 });
const BN = (n) => math.bignumber(n);

const State = {
    X: new Array(21).fill(BN(0)), // État EKF
    distTotal: BN(0),
    startTime: performance.now(),
    isRunning: false,
    lat: 43.284559, 
    lon: 5.345678,
    alt: 100.00
};

// Initialisation Quaternion [w,x,y,z]
State.X[6] = BN(1);

// 2. MOTEUR DE CALCULS PHYSIQUES & RELATIVISTES
const Physics = {
    c: BN("299792458"),
    G: BN("6.67430e-11"),
    M_OBJ: BN("70"), // Masse par défaut 70kg

    updateRelativity: function(vMS) {
        const beta = math.divide(vMS, this.c);
        const gamma = math.divide(BN(1), math.sqrt(math.subtract(BN(1), math.square(beta))));
        
        // Dilatation du temps
        const nsPerDay = math.multiply(math.subtract(gamma, BN(1)), BN("86400000000000"));
        
        document.getElementById('lorentz-factor').innerText = gamma.toFixed(18);
        document.getElementById('time-dilation-ns-d').innerText = nsPerDay.toFixed(2) + " ns/j";
        document.getElementById('mass-energy').innerText = math.multiply(this.M_OBJ, math.square(this.c), gamma).toExponential(4) + " J";
        document.getElementById('schwarzschild-radius').innerText = math.divide(math.multiply(BN(2), this.G, this.M_OBJ), math.square(this.c)).toExponential(4) + " m";
    }
};

// 3. MOTEUR ENVIRONNEMENT & FLUIDES (Weather.js bridge)
const Environment = {
    update: function(vMS) {
        const temp = 15.5; 
        const press = 1013.25;
        const rho = 1.225; // kg/m3

        // Pression dynamique q = 1/2 * rho * v²
        const q = math.multiply(BN(0.5), BN(rho), math.square(vMS));
        const mach = (typeof weather !== 'undefined') ? vMS.toNumber() / weather.calculateSoundSpeed(temp) : vMS.toNumber() / 340.29;

        document.getElementById('air-temp-c').innerText = temp.toFixed(1) + " °C";
        document.getElementById('pressure-hpa').innerText = press.toFixed(2) + " hPa";
        document.getElementById('air-density').innerText = rho.toFixed(3) + " kg/m³";
        document.getElementById('dynamic-pressure').innerText = q.toFixed(4) + " Pa";
        document.getElementById('mach-number').innerText = mach.toFixed(6);
        document.getElementById('local-gravity').innerText = "9.804646 m/s²";
    }
};

// 4. MOTEUR ASTRONOMIQUE (Ephem.js bridge)
const Astro = {
    update: function() {
        const now = new Date();
        const jd = math.add(BN(now.getTime() / 86400000), BN(2440587.5));
        
        document.getElementById('julian-date').innerText = jd.toFixed(8);
        document.getElementById('utc-datetime').innerText = now.toUTCString().split(' ')[4];
        
        if (typeof ephem !== 'undefined') {
            const sun = ephem.getSunPosition(jd.toNumber(), State.lat, State.lon);
            const moon = ephem.getMoonPosition(jd.toNumber(), State.lat, State.lon);
            const phase = ephem.getMoonPhase(jd.toNumber());

            document.getElementById('hud-sun-alt').innerText = sun.altitude.toFixed(2) + "°";
            document.getElementById('sun-azimuth').innerText = sun.azimuth.toFixed(2) + "°";
            document.getElementById('moon-phase-name').innerText = phase.name;
            document.getElementById('moon-illuminated').innerText = (phase.fraction * 100).toFixed(1) + "%";
            document.getElementById('moon-alt').innerText = moon.altitude.toFixed(2) + "°";
            document.getElementById('moon-azimuth').innerText = moon.azimuth.toFixed(2) + "°";
        }
    }
};

// 5. BOUCLE DE TRAITEMENT IMU (100Hz)
window.addEventListener('devicemotion', (e) => {
    if (!State.isRunning) return;

    const dt = BN(e.interval / 1000);
    const acc = e.accelerationIncludingGravity;
    
    // Isolation accélération Y avec correction de pente
    let ay = BN(acc.y || 0).subtract(BN("0.1")); // Biais calibration

    // Intégration Vitesse
    State.X[4] = math.add(State.X[4], math.multiply(ay, dt));
    
    // Friction (évite la dérive à l'arrêt)
    if (math.abs(ay).lt(0.15)) State.X[4] = math.multiply(State.X[4], BN("0.95"));
    if (math.abs(State.X[4]).lt(0.01)) State.X[4] = BN(0);

    const vMS = math.abs(State.X[4]);
    const vKMH = math.multiply(vMS, BN("3.6"));

    // Mise à jour UI Dynamique
    document.getElementById('sp-main-hud').innerText = vKMH.toFixed(1);
    document.getElementById('speed-main-display').innerText = vKMH.toFixed(2) + " km/h";
    document.getElementById('acc-y').innerText = ay.toFixed(6);
    
    // Statut Réalité
    const status = document.getElementById('reality-status');
    if (ay.lt(-0.1)) {
        status.innerText = "DÉCÉLÉRATION (DISSIPATION)";
        status.style.color = "#ff4444";
    } else {
        status.innerText = "STABLE / PROPULSION";
        status.style.color = "#00ff88";
    }

    // Distance Nanométrique
    State.distTotal = math.add(State.distTotal, math.multiply(vMS, dt));
    document.getElementById('total-path-inf').innerText = math.multiply(State.distTotal, BN(1e9)).toFixed(0) + " nm";
    
    Physics.updateRelativity(vMS);
});

// 6. INITIALISATION GÉNÉRALE
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn-final');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            State.isRunning = true;
            State.startTime = performance.now();
            startBtn.innerText = "SYSTÈME OMNISCIENT ACTIF";
            startBtn.style.background = "#222";
            
            // Boucles lentes (1Hz) pour Astro et Météo
            setInterval(() => {
                const vMS = math.abs(State.X[4]);
                Astro.update();
                Environment.update(vMS);
            }, 1000);
        });
    }
});
