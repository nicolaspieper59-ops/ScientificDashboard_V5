/**
 * MASTER CONTROLLER
 */
const ukf = new ProfessionalUKF();

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('gps-pause-toggle');
    
    // 1. GESTION DU BOUTON (MARCHE / ARRÊT)
    btn.onclick = async () => {
        // Déblocage des capteurs (iOS/Android)
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }

        ukf.isRunning = !ukf.isRunning;
        btn.textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
        btn.style.background = ukf.isRunning ? "var(--danger)" : "var(--success)";
        
        document.getElementById('statut-ekf').textContent = ukf.isRunning ? "ACTIF (FUSION)" : "VEILLE";
    };

    // 2. ÉCOUTEUR GPS
    navigator.geolocation.watchPosition((p) => {
        const { latitude, longitude } = p.coords;
        document.getElementById('lat-ukf').textContent = latitude.toFixed(6);
        document.getElementById('lon-ukf').textContent = longitude.toFixed(6);
        
        // Mise à jour Astro & Météo
        AstroEngine.update(latitude, longitude, {main: {temp: 15, pressure: 1013.25}});
    }, null, { enableHighAccuracy: true });

    // 3. BOUCLE DE RENDU (60 FPS)
    function step() {
        ukf.update();
        
        // Mise à jour Niveau à Bulle
        const pitch = Math.atan2(-ukf.accel.x, 10) * 180 / Math.PI;
        const roll = Math.atan2(ukf.accel.y, ukf.accel.z) * 180 / Math.PI;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
        
        requestAnimationFrame(step);
    }
    step();
});
