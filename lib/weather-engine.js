const WeatherEngine = {
    pressure: null, light: null,
    async init() {
        // Baromètre (Generic Sensor API)
        if ('PressureSensor' in window) {
            this.pressure = new PressureSensor({ frequency: 10 });
            this.pressure.onreading = () => {
                const hpa = this.pressure.pressure;
                document.getElementById('pressure-hpa').innerText = hpa.toFixed(2);
                // Si la pression est stable, on réduit l'erreur sur l'axe Z
                UKF.X.set([5,0], math.multiply(UKF.X.get([5,0]), 0.9));
            };
            this.pressure.start();
        }

        // Lumière 3 axes (Simulée par inclinaison)
        if ('AmbientLightSensor' in window) {
            this.light = new AmbientLightSensor();
            this.light.onreading = () => {
                const lux = this.light.illuminance;
                document.getElementById('env-lux').innerText = lux.toFixed(1);
            };
            this.light.start();
        }
    },
    getTensors() { return { x: 1e-12, y: 1e-12, z: 1e-12 }; }
};
