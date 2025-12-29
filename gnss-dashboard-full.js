/**
 * GNSS-DASHBOARD-FULL.JS - Liaison Master
 */
const ukf = new SpaceTimeUKF();

async function initSystem() {
    // 1. Bouton de démarrage (Autorisations iOS/Android)
    document.getElementById('gps-pause-toggle').onclick = async () => {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }
        ukf.isRunning = !ukf.isRunning;
        document.getElementById('gps-pause-toggle').textContent = ukf.isRunning ? "🛑 ARRÊT D'URGENCE" : "▶️ MARCHE GPS";
    };

    // 2. Gestion du Magnétisme 3 Axes
    if ('Magnetometer' in window) {
        const mag = new Magnetometer({frequency: 50});
        mag.addEventListener('reading', () => {
            document.getElementById('mag-x').textContent = mag.x.toFixed(1) + " µT";
            document.getElementById('mag-y').textContent = mag.y.toFixed(1) + " µT";
            document.getElementById('mag-z').textContent = mag.z.toFixed(1) + " µT";
        });
        mag.start();
    }

    // 3. Liaison Haute Fréquence (Mouvement/Salto)
    window.addEventListener('devicemotion', (e) => ukf.predict(e), true);

    // 4. Liaison GPS & Weather.js (Recalage & Environnement)
    navigator.geolocation.watchPosition(async (p) => {
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        const speed = p.coords.speed || 0;

        // Recalage de la vitesse UKF par le GPS
        ukf.correctFromGPS(speed);

        // Mise à jour Astro
        AstroBridge.update(lat, lon);

        // Sync Weather.js pour supprimer les N/A
        try {
            const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            const weather = await res.json();
            if (weather.main) {
                updateWeatherUI(weather.main, speed);
            }
        } catch (err) { console.warn("Weather API inaccessible"); }

        document.getElementById('lat-ukf').textContent = lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = lon.toFixed(6);
    }, null, { enableHighAccuracy: true });
}

function updateWeatherUI(m, vMs) {
    const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
    
    // Altitude Géopotentielle
    const hBaro = 44330 * (1 - Math.pow(m.pressure / 1013.25, 0.1903));
    const hGeo = (6356766 * hBaro) / (6356766 + hBaro);

    set('altitude-geopotentielle', hGeo.toFixed(2) + " m");
    set('temp-air', m.temp.toFixed(1) + " °C");
    set('press-hpa', m.pressure + " hPa");
    
    // Physique des fluides
    const vSon = 331.3 * Math.sqrt(1 + m.temp / 273.15);
    set('mach-number', (vMs / vSon).toFixed(5));
    const rho = (m.pressure * 100) / (287.05 * (m.temp + 273.15));
    set('air-density', rho.toFixed(3) + " kg/m³");
}

document.addEventListener('DOMContentLoaded', initSystem);
