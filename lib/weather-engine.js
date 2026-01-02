const WeatherEngine = {
    init() {
        // Pression Barométrique
        window.addEventListener('devicepressure', (e) => {
            const p = e.pressure;
            document.getElementById('baro-pressure').innerText = p.toFixed(2) + " hPa";
            document.getElementById('air-density').innerText = (p / (287 * 293)).toFixed(3) + " kg/m³";
        });

        // Luminosité
        if ('AmbientLightSensor' in window) {
            const sensor = new AmbientLightSensor();
            sensor.onreading = () => document.getElementById('light-lux').innerText = sensor.illuminance.toFixed(0);
            sensor.start();
        }

        // BioSVT Simulation (Effort/Vitesse)
        setInterval(() => {
            document.getElementById('adrenaline-index').innerText = (1 + (UKF.v / 10)).toFixed(1);
            document.getElementById('oxygen-sat').innerText = "98%";
        }, 1000);
    }
};
