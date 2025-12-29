/**
 * GNSS-DASHBOARD-FULL.JS - Liaison Capteurs & UI
 */
const ukf = new SpaceTimeUKF();
let lastPos = null;

async function startSystem() {
    // Bouton de démarrage (Permissions iOS/Android)
    document.getElementById('gps-pause-toggle').onclick = async () => {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }
        ukf.isRunning = !ukf.isRunning;
        document.getElementById('gps-pause-toggle').textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
    };

    // 1. Magnétomètre 3 axes
    if ('Magnetometer' in window) {
        const mag = new Magnetometer({frequency: 50});
        mag.onreading = () => {
            document.getElementById('mag-x').textContent = mag.x.toFixed(1) + " µT";
            document.getElementById('mag-y').textContent = mag.y.toFixed(1) + " µT";
            document.getElementById('mag-z').textContent = mag.z.toFixed(1) + " µT";
        };
        mag.start();
    }

    // 2. Capteurs de Lumière & Son
    if ('AmbientLightSensor' in window) {
        const light = new AmbientLightSensor();
        light.onreading = () => {
            document.getElementById('env-lux').textContent = light.illuminance + " lx";
            document.getElementById('ambient-light').textContent = light.illuminance + " lx";
        };
        light.start();
    }

    // 3. Boucle de Mouvement (UKF)
    window.addEventListener('devicemotion', (e) => {
        ukf.predict(e);
        // Mise à jour Niveau à Bulle
        const acc = e.accelerationIncludingGravity;
        const pitch = Math.atan2(-acc.x, 10) * 180 / Math.PI;
        const roll = Math.atan2(acc.y, acc.z) * 180 / Math.PI;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
        document.getElementById('bubble').style.transform = `translate(${roll}px, ${pitch}px)`;
    });

    // 4. Boucle GPS & Météo
    navigator.geolocation.watchPosition(async (p) => {
        const {latitude, longitude, speed, accuracy} = p.coords;
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        set('lat-ukf', latitude.toFixed(6));
        set('lon-ukf', longitude.toFixed(6));
        set('gps-accuracy-display', accuracy.toFixed(1) + " m");
        set('speed-main-display', ((speed || 0) * 3.6).toFixed(1) + " km/h");
        set('v-cosmic', (speed || 0).toFixed(2) + " m/s");

        // Sync Météo Pro
        try {
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=VOTRE_CLE_API&units=metric`);
            const data = await res.json();
            if(data.main) {
                set('air-temp-c', data.main.temp + " °C");
                set('pressure-hpa', data.main.pressure + " hPa");
                set('humidity-perc', data.main.humidity + " %");
                set('statut-meteo', "ACTIF ✅");
                
                // Calcul Mach & Densité
                const Tk = data.main.temp + 273.15;
                const vSon = Math.sqrt(1.4 * 287.05 * Tk);
                set('local-speed-of-sound', vSon.toFixed(2) + " m/s");
                set('mach-number', ((speed || 0) / vSon).toFixed(5));
                
                AstroBridge.update(latitude, longitude, data.main.pressure);
            }
        } catch(e) { console.error("Météo indisponible"); }

    }, null, {enableHighAccuracy: true});
}

document.addEventListener('DOMContentLoaded', startSystem);
