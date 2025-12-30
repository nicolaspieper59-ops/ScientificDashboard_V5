const ukf = new ProfessionalUKF();
let gpsWatch = null;

// Liaison du bouton Marche/Arrêt GPS
document.getElementById('gps-pause-toggle').onclick = function() {
    if (gpsWatch) {
        navigator.geolocation.clearWatch(gpsWatch);
        gpsWatch = null;
        this.textContent = "▶️ MARCHE GPS";
        this.style.background = "var(--col-ast)";
    } else {
        gpsWatch = navigator.geolocation.watchPosition(
            (p) => { document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6); },
            null, { enableHighAccuracy: true }
        );
        this.textContent = "🛑 ARRÊT GPS";
        this.style.background = "#ff4444";
    }
};

// Liaison du bouton Initialiser
document.getElementById('start-btn').onclick = async function() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
    }
    
    let samples = [];
    this.textContent = "CALIBRATION...";
    
    const collector = (e) => samples.push({x:e.accelerationIncludingGravity.x, y:e.accelerationIncludingGravity.y, z:e.accelerationIncludingGravity.z});
    window.addEventListener('devicemotion', collector);

    setTimeout(() => {
        window.removeEventListener('devicemotion', collector);
        ukf.calibrate(samples);
        ukf.isRunning = true;
        this.textContent = "SYSTÈME ACTIF";
        this.style.background = "#004400";
        this.style.color = "#fff";
        
        // Boucle de mise à jour UI
        window.addEventListener('devicemotion', (e) => {
            ukf.update(e);
            syncEverything();
        });
    }, 3000);
};

function syncEverything() {
    // Vitesse et G-Force
    document.getElementById('sp-main').textContent = (ukf.vel.ms * 3.6).toFixed(4);
    document.getElementById('g-force').textContent = ukf.gForce.toFixed(3);
    document.getElementById('dist-3d').textContent = ukf.distance3D.toFixed(6);
    
    // Relativité
    const gamma = 1 / Math.sqrt(1 - Math.pow(ukf.vel.ms/299792458, 2));
    document.getElementById('lorentz-val').textContent = gamma.toFixed(12);
    
    // Temps
    document.getElementById('local-time').textContent = new Date().toLocaleTimeString();
    }
