const ukf = new ProfessionalUKF();

async function startCalibration() {
    const btn = document.getElementById('start-btn');
    let samples = [];
    let countdown = 3;

    const timer = setInterval(() => {
        btn.textContent = `CALIBRATION : ${countdown}s (NE PAS BOUGER)`;
        countdown--;
        if (countdown < 0) clearInterval(timer);
    }, 1000);

    const collect = (e) => samples.push({
        x: e.accelerationIncludingGravity.x,
        y: e.accelerationIncludingGravity.y,
        z: e.accelerationIncludingGravity.z
    });

    window.addEventListener('devicemotion', collect);

    setTimeout(() => {
        window.removeEventListener('devicemotion', collect);
        ukf.calibrate(samples);
        ukf.isRunning = true;
        btn.textContent = "SYSTÈME ACTIF 🟢";
        btn.style.background = "#004400";
        startEngine();
    }, 3500);
}

function startEngine() {
    window.addEventListener('devicemotion', (e) => {
        ukf.update(e);
        syncUI();
    });
}

function syncUI() {
    // 1. Navigation & Vitesse
    const kmh = ukf.vel.ms * 3.6;
    document.getElementById('sp-main').textContent = kmh.toFixed(4);
    document.getElementById('speed-main-display').textContent = kmh.toFixed(2) + " km/h";
    document.getElementById('speed-stable-ms').textContent = ukf.vel.ms.toFixed(3);
    
    // 2. Relativité (Calcul Einsteinien)
    const beta = ukf.vel.ms / ukf.C;
    const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
    document.getElementById('lorentz-val').textContent = gamma.toFixed(12);
    document.getElementById('lorentz-factor').textContent = gamma.toFixed(10);
    
    // 3. G-Force & Dynamique
    document.getElementById('g-force').textContent = ukf.gForce.toFixed(3);
    document.getElementById('force-g-vertical').textContent = (ukf.accPrev.z / 9.81).toFixed(2);
    
    // 4. Distance 3D (Précision Sub-Micronique)
    document.getElementById('dist-3d').textContent = ukf.distance3D.toFixed(6);
    document.getElementById('total-distance-3d-2').textContent = (ukf.distance3D / 1000).toFixed(6);

    // 5. Physique des Fluides (Traînée)
    const rho = 1.225; // Densité air standard
    const drag = 0.5 * rho * Math.pow(ukf.vel.ms, 2) * 0.5 * 0.3; // Cd=0.3 A=0.5m2
    document.getElementById('drag-force').textContent = drag.toFixed(2) + " N";
}

document.getElementById('start-btn').addEventListener('click', () => {
    if (DeviceMotionEvent.requestPermission) {
        DeviceMotionEvent.requestPermission().then(startCalibration);
    } else {
        startCalibration();
    }
});
