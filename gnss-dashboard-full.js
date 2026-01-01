/**
 * OMNISCIENCE V100 PRO - MASTER CONTROLLER
 */
const MasterSystem = {
    async init() {
        document.getElementById('start-btn-final').addEventListener('click', async () => {
            this.setupSensors();
            this.setupGPS();
            this.setupWeather();
            document.getElementById('start-btn-final').style.display = 'none';
        });
    },

    async setupSensors() {
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({frequency: 60});
            acc.onreading = () => {
                // Envoi de l'axe Y au moteur Newton
                UKF_PRO.update(acc.y, window.currentPitch, 1/60, window.lastGpsSpeed);
                
                // Remplissage IMU
                document.getElementById('acc-x').innerText = acc.x.toFixed(2);
                document.getElementById('acc-y').innerText = acc.y.toFixed(2);
                document.getElementById('acc-z').innerText = acc.z.toFixed(2);
                
                const gTotal = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.81;
                document.getElementById('g-force-resultant').innerText = gTotal.toFixed(3) + " G";
            };
            acc.start();
        }
    },

    setupGPS() {
        navigator.geolocation.watchPosition(p => {
            const {latitude, longitude, altitude, speed} = p.coords;
            window.lastGpsSpeed = speed;
            window.gpsAcc = p.coords.accuracy;
            
            // Mise à jour 3D ECEF
            this.updateECEF(latitude, longitude, altitude || 0);
            
            document.getElementById('lat-ukf').innerText = latitude.toFixed(6);
            document.getElementById('lon-ukf').innerText = longitude.toFixed(6);
            document.getElementById('alt-ukf').innerText = (altitude || 0).toFixed(2) + " m";
        }, null, {enableHighAccuracy: true});
    },

    updateECEF(lat, lon, alt) {
        const R = 6371000;
        const radLat = lat * Math.PI / 180;
        const radLon = lon * Math.PI / 180;
        
        const x = (R + alt) * Math.cos(radLat) * Math.cos(radLon);
        const y = (R + alt) * Math.cos(radLat) * Math.sin(radLon);
        const z = (R + alt) * Math.sin(radLat);

        document.getElementById('coord-x').innerText = x.toFixed(1);
        document.getElementById('coord-y').innerText = y.toFixed(1);
        document.getElementById('coord-z').innerText = z.toFixed(1);
    },

    async setupWeather() {
        // API Simulation ou Fetch
        document.getElementById('air-temp-c').innerText = "21.5 °C";
        document.getElementById('pressure-hpa').innerText = "1013.2 hPa";
        document.getElementById('o2-saturation').innerText = "98.2 %";
    }
};

MasterSystem.init();
