const ukf = new SpaceTimeUKF();
let lastLocation = null;

async function init() {
    // 1. Bouton Start & Permissions
    document.getElementById('gps-pause-toggle').onclick = async () => {
        if (typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
        ukf.isRunning = !ukf.isRunning;
        document.getElementById('gps-pause-toggle').className = ukf.isRunning ? "btn btn-danger" : "btn btn-success";
    };

    // 2. Capteurs IMU (60Hz)
    window.addEventListener('devicemotion', (e) => {
        ukf.update(e);
        document.getElementById('acc-x').textContent = e.accelerationIncludingGravity.x.toFixed(2);
        document.getElementById('acc-y').textContent = e.accelerationIncludingGravity.y.toFixed(2);
        
        // Niveau à bulle (Pitch/Roll)
        const pitch = Math.atan2(-e.accelerationIncludingGravity.x, 10) * 180 / Math.PI;
        const roll = Math.atan2(e.accelerationIncludingGravity.y, e.accelerationIncludingGravity.z) * 180 / Math.PI;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
    });

    // 3. Capteurs Environnementaux
    if ('AmbientLightSensor' in window) {
        const sensor = new AmbientLightSensor();
        sensor.onreading = () => document.getElementById('env-lux').textContent = sensor.illuminance;
        sensor.start();
    }

    // 4. GPS & Météo & Polluants
    navigator.geolocation.watchPosition(async (p) => {
        const {latitude, longitude, speed} = p.coords;
        
        document.getElementById('lat-ukf').textContent = latitude.toFixed(6);
        document.getElementById('lon-ukf').textContent = longitude.toFixed(6);
        document.getElementById('speed-main-display').textContent = (speed * 3.6 || 0).toFixed(1);

        // Fetch API (Météo + Pollution)
        try {
            const res = await fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=VOTRE_CLE`);
            const poll = await res.json();
            const comp = poll.list[0].components;
            document.getElementById('no2-val').textContent = comp.no2.toFixed(1);
            document.getElementById('pm25-val').textContent = comp.pm2_5.toFixed(1);
        } catch(e) {}

        AstroEngine.update(latitude, longitude, {main: {temp: 15, pressure: 1013}}); // Météo simulée si API off
    }, null, {enableHighAccuracy: true});
}

document.addEventListener('DOMContentLoaded', init);
