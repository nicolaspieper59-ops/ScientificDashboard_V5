/**
 * OMNISCIENCE V100 - MASTER CONTROLLER
 */
const MasterSystem = {
    async init() {
        document.getElementById('start-btn-final').addEventListener('click', async () => {
            // 1. TEMPS ATOMIQUE
            const t0 = performance.now();
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            const offset = new Date(data.utc_datetime).getTime() - Date.now();
            
            // 2. BOUCLE DE RENDU (10ms)
            setInterval(() => {
                const now = new Date(Date.now() + offset);
                document.getElementById('gmt-time-display-2').innerText = now.toISOString().split('T')[1].replace('Z','');
                const jd = (now.getTime() / 86400000) + 2440587.5;
                document.getElementById('julian-date').innerText = jd.toFixed(6);
            }, 10);

            // 3. CAPTEURS HAUTE FRÉQUENCE
            const acc = new LinearAccelerationSensor({frequency: 60});
            const gyro = new Gyroscope({frequency: 60});
            
            acc.onreading = () => {
                UKF_PRO.update(acc, gyro, 1/60, window.lastGpsSpeed);
                Nav3DEngine.calculate(acc.x, acc.y, acc.z, window.lat, window.lon, window.alt);
                
                document.getElementById('acc-x').innerText = acc.x.toFixed(2);
                document.getElementById('acc-y').innerText = acc.y.toFixed(2);
                document.getElementById('acc-z').innerText = acc.z.toFixed(2);
            };
            
            acc.start();
            gyro.start();

            // 4. GÉOLOCALISATION
            navigator.geolocation.watchPosition(p => {
                window.lat = p.coords.latitude;
                window.lon = p.coords.longitude;
                window.alt = p.coords.altitude || 0;
                window.lastGpsSpeed = p.coords.speed;
                window.gpsAcc = p.coords.accuracy;
                
                WeatherBioEngine.update(window.alt, window.lat, window.lon);
            }, null, {enableHighAccuracy: true});
        });
    }
};

document.addEventListener('DOMContentLoaded', () => MasterSystem.init());
