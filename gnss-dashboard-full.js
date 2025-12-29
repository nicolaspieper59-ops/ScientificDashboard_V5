/**
 * MASTER CONTROLLER
 */
const ukf = new ProfessionalUKF();

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('gps-pause-toggle');
    if (!btn) return;

    // FONCTION DE DÉMARRAGE (Gère les permissions iOS/Android)
    btn.onclick = async () => {
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') return alert("Capteurs refusés.");
            }

            ukf.isRunning = !ukf.isRunning;
            
            // Mise à jour visuelle du bouton
            btn.textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
            btn.style.background = ukf.isRunning ? "#ff4444" : "#00ff66";
            document.getElementById('statut-ekf').textContent = ukf.isRunning ? "ACTIF (FUSION)" : "VEILLE";
            
            if (ukf.isRunning) {
                ukf.lastTime = performance.now();
                initGPS();
            }
        } catch (e) { console.error(e); }
    };

    // CAPTEURS DE MOUVEMENT
    window.addEventListener('devicemotion', (e) => {
        if (!ukf.isRunning) return;
        ukf.update(e);
        
        // Niveau à bulle visuel
        const acc = e.accelerationIncludingGravity;
        if (acc) {
            const p = Math.atan2(-acc.x, 10) * 180 / Math.PI;
            const r = Math.atan2(acc.y, acc.z) * 180 / Math.PI;
            document.getElementById('pitch').textContent = p.toFixed(1) + "°";
            document.getElementById('roll').textContent = r.toFixed(1) + "°";
            document.getElementById('acc-x').textContent = acc.x.toFixed(2);
            document.getElementById('acc-y').textContent = acc.y.toFixed(2);
        }
    });

    function initGPS() {
        navigator.geolocation.watchPosition((p) => {
            document.getElementById('lat-ukf').textContent = p.coords.latitude.toFixed(6);
            document.getElementById('lon-ukf').textContent = p.coords.longitude.toFixed(6);
            AstroEngine.update(p.coords.latitude, p.coords.longitude);
        }, null, { enableHighAccuracy: true });
    }
});
