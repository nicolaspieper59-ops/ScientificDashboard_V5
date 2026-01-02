const WeatherEngine = {
    init() {
        // Luminosité réelle
        if ('AmbientLightSensor' in window) {
            const light = new AmbientLightSensor();
            light.onreading = () => document.getElementById('light-lux').innerText = light.illuminance.toFixed(0);
            light.start();
        }

        // Pression et Densité de l'air
        window.addEventListener('devicepressure', (e) => {
            const p = e.pressure;
            document.getElementById('baro-pressure').innerText = p.toFixed(2) + " hPa";
            const rho = (p * 100) / (287.05 * 293.15);
            document.getElementById('air-density').innerText = rho.toFixed(3) + " kg/m³";
        });
        
        // BioSVT - Simulation Cardio par l'effort
        setInterval(() => {
            document.getElementById('adrenaline-index').innerText = (1 + (UKF.v / 5)).toFixed(1);
            document.getElementById('oxygen-sat').innerText = "98%";
        }, 2000);
    }
};
