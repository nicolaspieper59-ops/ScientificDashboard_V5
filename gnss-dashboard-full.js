const ukf = new ProfessionalUKF();

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('gps-pause-toggle');

    // DÉBLOCAGE CAPTEURS ET GPS
    btn.addEventListener('click', async () => {
        try {
            // Permission pour capteurs de mouvement (iOS/Chrome)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') return alert("Capteurs refusés.");
            }

            ukf.isRunning = !ukf.isRunning;
            btn.textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
            btn.style.background = ukf.isRunning ? "#ff4444" : "#00ff66";
            
            if (ukf.isRunning) {
                // Activer le GPS
                navigator.geolocation.watchPosition((p) => {
                    document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6);
                    document.getElementById('lon-ukf').textContent = p.coords.longitude.toFixed(6);
                    // Liaison Météo simplifiée
                    document.getElementById('air-density').textContent = "1.225 kg/m³";
                }, null, { enableHighAccuracy: true });
            }
        } catch (e) { console.error(e); }
    });

    // Capture des mouvements IMU
    window.addEventListener('devicemotion', (e) => {
        ukf.accelRaw = {
            x: e.accelerationIncludingGravity.x || 0,
            y: e.accelerationIncludingGravity.y || 0,
            z: e.accelerationIncludingGravity.z || 9.81
        };
        ukf.gyroRaw = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
        
        // Mise à jour visuelle du niveau à bulle
        const pitch = Math.atan2(-ukf.accelRaw.x, 10) * 180 / Math.PI;
        const roll = Math.atan2(ukf.accelRaw.y, ukf.accelRaw.z) * 180 / Math.PI;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
    });

    // Boucle de calcul 60Hz
    function animate() {
        ukf.update();
        requestAnimationFrame(animate);
    }
    animate();
});
