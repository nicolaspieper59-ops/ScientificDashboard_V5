/**
 * MASTER SYNC - LIAISON HTML/JS
 */
const ukf = new SpaceTimeUKF();
let lastPos = null;

async function initDashboard() {
    const btn = document.getElementById('gps-pause-toggle');
    
    // GESTION BOUTON MARCHE/ARRÊT
    btn.onclick = async () => {
        // Demande de permission pour les capteurs (iOS/Chrome)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }
        
        ukf.isRunning = !ukf.isRunning;
        btn.textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
        btn.style.background = ukf.isRunning ? "var(--danger)" : "var(--success)";
        
        document.getElementById('statut-ekf').textContent = ukf.isRunning ? "ACTIF (FUSION)" : "VEILLE";
    };

    // CAPTEURS INERTIELS (60Hz)
    window.addEventListener('devicemotion', (e) => {
        ukf.update(e);
        
        // Mise à jour IMU Brute dans le tableau
        document.getElementById('acc-x').textContent = e.accelerationIncludingGravity.x.toFixed(2);
        document.getElementById('acc-y').textContent = e.accelerationIncludingGravity.y.toFixed(2);
        
        // Niveau à bulle
        const pitch = Math.atan2(-e.accelerationIncludingGravity.x, 10) * 180 / Math.PI;
        const roll = Math.atan2(e.accelerationIncludingGravity.y, e.accelerationIncludingGravity.z) * 180 / Math.PI;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
    });

    // NAVIGATION & MÉLOG (GPS 1Hz)
    navigator.geolocation.watchPosition(async (p) => {
        const {latitude, longitude, speed} = p.coords;
        
        document.getElementById('lat-ukf').textContent = latitude.toFixed(6);
        document.getElementById('lon-ukf').textContent = longitude.toFixed(6);
        document.getElementById('speed-main-display').textContent = (speed * 3.6 || 0).toFixed(1);

        // Distance Ellipsoïdale (Turf.js)
        if (lastPos) {
            const from = turf.point([lastPos.lon, lastPos.lat]);
            const to = turf.point([longitude, latitude]);
            const dist = turf.distance(from, to, {units: 'kilometers'});
            document.getElementById('total-distance-3d-2').textContent = dist.toFixed(6) + " km";
        }
        lastPos = {lat: latitude, lon: longitude};

        // Polluants & Météo
        fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=VOTRE_CLE`)
            .then(r => r.json())
            .then(d => {
                document.getElementById('no2-val').textContent = d.list[0].components.no2.toFixed(1);
                document.getElementById('pm25-val').textContent = d.list[0].components.pm2_5.toFixed(1);
            });

        AstroEngine.update(latitude, longitude, {main: {temp: 15, pressure: 1013.25}});
    }, null, {enableHighAccuracy: true});
}

document.addEventListener('DOMContentLoaded', initDashboard);
