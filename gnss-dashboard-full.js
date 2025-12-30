// Initialisation du bouton
document.getElementById('start-btn').onclick = async function() {
    // 1. Demande de permission (Crucial pour iOS/Android)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const resp = await DeviceMotionEvent.requestPermission();
        if (resp !== 'granted') return alert("Accès capteurs refusé");
    }

    let samples = [];
    this.textContent = "CALIBRATION EN COURS...";
    
    // 2. Phase de calibration (3 secondes d'immobilité)
    const collect = (e) => samples.push({x:e.accelerationIncludingGravity.x, y:e.accelerationIncludingGravity.y, z:e.accelerationIncludingGravity.z});
    window.addEventListener('devicemotion', collect);

    setTimeout(() => {
        window.removeEventListener('devicemotion', collect);
        engine.calibrate(samples);
        engine.isRunning = true;
        this.style.display = "none"; // On cache le bouton après succès
        
        // 3. Lancement de la boucle temps réel
        window.addEventListener('devicemotion', (e) => {
            engine.update(e);
            updateDashboard();
        });
    }, 3000);
};

function updateDashboard() {
    // Mapping des IDs HTML
    const vKmh = engine.vel.ms * 3.6;
    
    // Section Navigation
    document.getElementById('sp-main').textContent = vKmh.toFixed(4);
    document.getElementById('speed-main-display').textContent = vKmh.toFixed(2) + " km/h";
    document.getElementById('dist-3d').textContent = engine.distance3D.toFixed(6) + " m";
    document.getElementById('total-distance-3d-2').textContent = (engine.distance3D/1000).toFixed(6);

    // Section Relativité
    const c = 299792458;
    const gamma = 1 / Math.sqrt(1 - (engine.vel.ms/c)**2 || 1);
    document.getElementById('lorentz-val').textContent = gamma.toFixed(12);
    document.getElementById('lorentz-factor').textContent = gamma.toFixed(8);

    // Section Dynamique
    document.getElementById('accel-long-2').textContent = engine.vel.x.toFixed(3) + " m/s²";
    
    // Temps
    document.getElementById('local-time').textContent = new Date().toLocaleTimeString();
    document.getElementById('utc-datetime').textContent = new Date().toUTCString();
}

// Gestion du bouton GPS
document.getElementById('gps-pause-toggle').onclick = function() {
    this.classList.toggle('active');
    if(this.classList.contains('active')) {
        this.textContent = "🛑 ARRÊT GPS";
        this.style.background = "#f00";
        navigator.geolocation.watchPosition(p => {
            document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6);
        });
    } else {
        this.textContent = "▶️ MARCHE GPS";
        this.style.background = "#0f0";
    }
};
