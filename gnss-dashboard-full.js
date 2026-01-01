const MasterController = {
    async init() {
        document.getElementById('start-btn-final').addEventListener('click', async () => {
            this.setupSensors();
            await this.syncNTP();
        });
    },

    async syncNTP() {
        const t0 = performance.now();
        const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
        const data = await res.json();
        const offset = new Date(data.utc_datetime).getTime() - Date.now();
        
        setInterval(() => {
            const now = new Date(Date.now() + offset);
            document.getElementById('gmt-time-display-2').innerText = now.toISOString().split('T')[1].replace('Z','');
            // Date Julienne
            const jd = (now.getTime() / 86400000) + 2440587.5;
            document.getElementById('julian-date').innerText = jd.toFixed(6);
        }, 10);
    },

    setupSensors() {
        // Accéléromètre 60Hz
        const acc = new LinearAccelerationSensor({frequency: 60});
        acc.onreading = () => {
            UKF_PRO.update(acc.y, window.currentPitch || 0, 1/60, window.lastGpsSpeed);
            document.getElementById('acc-x').innerText = acc.x.toFixed(2);
            document.getElementById('acc-y').innerText = acc.y.toFixed(2);
            document.getElementById('acc-z').innerText = acc.z.toFixed(2);
        };
        acc.start();

        // GPS
        navigator.geolocation.watchPosition(p => {
            window.lastGpsSpeed = p.coords.speed;
            window.gpsAcc = p.coords.accuracy;
            WeatherBioEngine.update(p.coords.latitude, p.coords.longitude, p.coords.altitude || 0);
            
            document.getElementById('lat-ukf').innerText = p.coords.latitude.toFixed(6);
            document.getElementById('lon-ukf').innerText = p.coords.longitude.toFixed(6);
            document.getElementById('alt-ukf-z').innerText = (p.coords.altitude || 0).toFixed(2);
        }, null, {enableHighAccuracy: true});
    }
};

document.addEventListener('DOMContentLoaded', () => MasterController.init());
