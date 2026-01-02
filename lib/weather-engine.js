const WeatherEngine = {
    init() {
        if ('PressureSensor' in window) {
            const sensor = new PressureSensor({ frequency: 10 });
            sensor.onreading = () => {
                const hpa = sensor.pressure;
                document.getElementById('air-pressure').innerText = hpa.toFixed(2);
                
                // Correction de la dérive Z : Si la pression ne change pas, on freine la vitesse Z
                const vz = UKF.X.get([5,0]);
                UKF.X.set([5,0], math.multiply(vz, 0.95)); 
            };
            sensor.start();
        }

        if ('AmbientLightSensor' in window) {
            const light = new AmbientLightSensor();
            light.onreading = () => {
                document.getElementById('env-lux').innerText = light.illuminance.toFixed(1);
            };
            light.start();
        }
    }
};
