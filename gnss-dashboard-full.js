const ukf = new ProfessionalUKF();

async function initializeSystem() {
    const btn = document.getElementById('gps-pause-toggle');
    
    // GESTION DU BOUTON (MARCHE / ARRÊT)
    btn.onclick = async () => {
        try {
            // Demande d'accès (Obligatoire sur iOS/Chrome moderne)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') return alert("Capteurs refusés.");
            }

            ukf.isRunning = !ukf.isRunning;
            btn.textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
            btn.style.background = ukf.isRunning ? "var(--danger)" : "var(--success)";
            
            if(ukf.isRunning) {
                ukf.lastTime = performance.now();
                startGPS();
            }
        } catch (e) { console.error("Permission Error:", e); }
    };

    // CAPTEURS (DeviceMotion)
    window.addEventListener('devicemotion', (e) => {
        ukf.accelRaw = {
            x: e.accelerationIncludingGravity.x || 0,
            y: e.accelerationIncludingGravity.y || 0,
            z: e.accelerationIncludingGravity.z || 9.80665
        };
        ukf.gyroRaw = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
        
        // Mise à jour immédiate du Niveau à Bulle
        const pitch = Math.atan2(-ukf.accelRaw.x, 10) * 180 / Math.PI;
        const roll = Math.atan2(ukf.accelRaw.y, ukf.accelRaw.z) * 180 / Math.PI;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
    });

    function startGPS() {
        navigator.geolocation.watchPosition((p) => {
            document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6);
            document.getElementById('lon-ukf').textContent = p.coords.longitude.toFixed(6);
            // Simuler l'altitude pour débloquer les IDs SVT
            document.getElementById('air-density').textContent = "1.225 kg/m³";
        }, null, { enableHighAccuracy: true });
    }

    // BOUCLE DE RENDU HAUTE FRÉQUENCE
    function step() {
        ukf.update();
        requestAnimationFrame(step);
    }
    step();
}

document.addEventListener('DOMContentLoaded', initializeSystem);
