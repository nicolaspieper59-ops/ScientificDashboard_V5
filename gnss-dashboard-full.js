/**
 * MASTER CONTROL - REAL-TIME SENSORS
 */
const MasterSystem = {
    async init() {
        const startBtn = document.getElementById('start-btn-final');
        startBtn.addEventListener('click', async () => {
            startBtn.style.display = 'none';
            
            // 1. Démarrage des capteurs à 100Hz minimum
            const sensor = new LinearAccelerationSensor({ frequency: 100 });
            sensor.onreading = () => {
                const dt = 0.01; // Cycle de 10ms
                Omniscience.compute(sensor, null, dt);
            };
            sensor.start();

            // 2. Coordonnées 3D GPS (Référence sol)
            navigator.geolocation.watchPosition(pos => {
                document.getElementById('coord-x').innerText = pos.coords.latitude.toFixed(8);
                document.getElementById('coord-y').innerText = pos.coords.longitude.toFixed(8);
                document.getElementById('coord-z').innerText = (pos.coords.altitude || 0).toFixed(3) + " m";
            }, null, { enableHighAccuracy: true });
        });
    }
};

MasterSystem.init();
