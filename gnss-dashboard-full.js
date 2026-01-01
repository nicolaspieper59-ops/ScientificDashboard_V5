/**
 * OMNISCIENCE V100 PRO - MASTER CONTROLLER
 */
const MasterSystem = {
    init() {
        const btn = document.getElementById('start-btn-final');
        btn.addEventListener('click', async () => {
            btn.style.display = 'none';
            await this.startSensors();
            this.startGPS();
            
            // Boucle de calcul à fréquence maximale (indépendante du rendu)
            // Utilise requestAnimationFrame pour le rendu, mais setInterval(0) pour le calcul
            setInterval(() => UKF_PRO.compute(), 1); // Cycle 1ms
        });
    },

    async startSensors() {
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({ frequency: 60 });
            acc.onreading = () => {
                window.currentAccY = acc.y;
                document.getElementById('acc-x').innerText = acc.x.toFixed(2);
                document.getElementById('acc-y').innerText = acc.y.toFixed(2);
                document.getElementById('acc-z').innerText = acc.z.toFixed(2);
                
                const g = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.81;
                document.getElementById('g-force-resultant').innerText = g.toFixed(3) + " G";
            };
            acc.start();
        }
    },

    startGPS() {
        navigator.geolocation.watchPosition(p => {
            const {latitude, longitude, altitude} = p.coords;
            document.getElementById('coord-x').innerText = latitude.toFixed(6);
            document.getElementById('coord-y').innerText = longitude.toFixed(6);
            document.getElementById('coord-z').innerText = (altitude || 0).toFixed(2);
            
            // Date Julienne
            const jd = (Date.now() / 86400000) + 2440587.5;
            document.getElementById('julian-date').innerText = jd.toFixed(6);
        }, null, {enableHighAccuracy: true});
    }
};

MasterSystem.init();
