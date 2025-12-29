/** * GNSS MASTER CONTROLLER
 */
const ukf = new SpaceTimeUKF();

async function initDashboard() {
    // 1. Bouton Marche/Arrêt
    document.getElementById('gps-pause-toggle').onclick = async () => {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }
        ukf.isRunning = !ukf.isRunning;
        document.getElementById('gps-pause-toggle').textContent = ukf.isRunning ? "🛑 ARRÊT D'URGENCE" : "▶️ MARCHE GPS";
    };

    // 2. Flux GPS (Recalage dérive)
    navigator.geolocation.watchPosition((p) => {
        const lat = p.coords.latitude, lon = p.coords.longitude;
        ukf.correct(p.coords.speed || 0);
        
        // Appel weather.js
        fetchWeather(lat, lon);
        
        // Mise à jour Astro (Montre Minecraft)
        if (window.AstroBridge) {
            const astro = AstroBridge.update(lat, lon);
            updateNightMode(astro.sunAltitude);
        }

        document.getElementById('lat-ukf').textContent = lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = lon.toFixed(6);
    }, null, { enableHighAccuracy: true });

    // 3. Flux IMU (Dynamique Salto)
    window.addEventListener('devicemotion', (e) => ukf.predict(e), true);
}

async function fetchWeather(lat, lon) {
    try {
        const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        const data = await res.json();
        if (data.main) {
            updateEnvironment(data.main);
        }
    } catch (e) { console.error("Weather proxy fail"); }
}

function updateEnvironment(m) {
    const tempK = m.temp + 273.15;
    const rho = (m.pressure * 100) / (287.05 * tempK);
    const vSon = 331.3 * Math.sqrt(1 + m.temp / 273.15);
    
    // Altitude Géopotentielle
    const Re = 6356766;
    const hBaro = (tempK / 0.0065) * (1 - Math.pow(m.pressure / 1013.25, 0.190263));
    const hGeo = (Re * hBaro) / (Re + hBaro);

    document.getElementById('air-density').textContent = rho.toFixed(3) + " kg/m³";
    document.getElementById('altitude-geopotentielle').textContent = hGeo.toFixed(2) + " m";
    document.getElementById('temp-air').textContent = m.temp + " °C";
    document.getElementById('mach-number').textContent = ( (math.norm(ukf.v)) / vSon ).toFixed(5);
}

function updateNightMode(sunAlt) {
    if (sunAlt < 0) {
        document.body.classList.add('night-ui');
        document.getElementById('night-mode-status').textContent = "Nuit (🌙)";
    } else {
        document.body.classList.remove('night-ui');
        document.getElementById('night-mode-status').textContent = "Jour (☀️)";
    }
}
const DataLogger = {
    records: [],
    start() { this.records = []; this.active = true; },
    stop() {
        this.active = false;
        let csv = "Timestamp,Vitesse_kmh,G_Force,Alt_Geo\n";
        this.records.forEach(r => { csv += `${r.t},${r.v},${r.g},${r.a}\n`; });
        const link = document.createElement("a");
        link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        link.download = "ukf_session.csv";
        link.click();
    },
    capture(v, g, a) {
        if(this.active) this.records.push({t: new Date().toLocaleTimeString(), v: v, g: g, a: a});
    }
};
document.addEventListener('DOMContentLoaded', initDashboard);
