/**
 * MASTER CONTROLLER : Mapping complet des ID HTML
 */
const ukf = new SpaceTimeUKF();
let lastPos = null;

async function initSystem() {
    // Permission & Start
    document.getElementById('gps-pause-toggle').onclick = async () => {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }
        ukf.isRunning = !ukf.isRunning;
        document.getElementById('gps-pause-toggle').textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
    };

    // Magnétomètre & Capteurs
    if ('Magnetometer' in window) {
        const mag = new Magnetometer({frequency: 60});
        mag.onreading = () => {
            document.getElementById('mag-x').textContent = mag.x.toFixed(1) + " µT";
            document.getElementById('mag-y').textContent = mag.y.toFixed(1) + " µT";
            document.getElementById('mag-z').textContent = mag.z.toFixed(1) + " µT";
        };
        mag.start();
    }

    // Boucle Inertielle (Haute Fréquence 60Hz)
    window.addEventListener('devicemotion', (e) => {
        ukf.predict(e);
        
        // Niveau à bulle & Debug
        const acc = e.accelerationIncludingGravity;
        const pitch = Math.atan2(-acc.x, 10) * 180 / Math.PI;
        const roll = Math.atan2(acc.y, acc.z) * 180 / Math.PI;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
        document.getElementById('acc-x').textContent = acc.x.toFixed(2);
        document.getElementById('acc-y').textContent = acc.y.toFixed(2);
    });

    // Boucle GPS & Météo (Basse Fréquence 1Hz)
    navigator.geolocation.watchPosition(async (p) => {
        const {latitude, longitude, speed, accuracy} = p.coords;
        
        document.getElementById('lat-ukf').textContent = latitude.toFixed(6);
        document.getElementById('lon-ukf').textContent = longitude.toFixed(6);
        document.getElementById('speed-main-display').textContent = ((speed || 0) * 3.6).toFixed(1) + " km/h";
        document.getElementById('gps-accuracy-display').textContent = accuracy.toFixed(1) + " m";

        // Distance Ellipsoïdale (Turf.js)
        if (lastPos) {
            const from = turf.point([lastPos.lon, lastPos.lat]);
            const to = turf.point([longitude, latitude]);
            const dist = turf.distance(from, to, {units: 'kilometers'});
            document.getElementById('total-distance-3d-2').textContent = dist.toFixed(6) + " km";
        }
        lastPos = {lat: latitude, lon: longitude};

        // Météo & Astro
        try {
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=VOTRE_CLE&units=metric`);
            const data = await res.json();
            AstroEngine.sync(latitude, longitude, data);
            document.getElementById('statut-meteo').textContent = "ACTIF ✅";
        } catch(e) { AstroEngine.sync(latitude, longitude, null); }

    }, null, {enableHighAccuracy: true});
}

document.addEventListener('DOMContentLoaded', initSystem);
