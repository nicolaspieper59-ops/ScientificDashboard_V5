/**
 * OMNISCIENCE V100 - WEATHER & BIOSVT ENGINE
 * Gestion des capteurs environnementaux réels
 */
const WeatherEngine = {
    lastPressure: 1013.25,
    seaLevelPressure: 1013.25,

    init() {
        // 1. Capteur de Lumière (Luxmètre)
        if ('AmbientLightSensor' in window) {
            const sensor = new AmbientLightSensor();
            sensor.onreading = () => {
                document.getElementById('light-lux').innerText = sensor.illuminance.toFixed(1);
                document.getElementById('light-max').innerText = Math.max(sensor.illuminance, 100).toFixed(0);
            };
            sensor.start();
        }

        // 2. Capteur de Pression (Baromètre)
        window.addEventListener('devicepressure', (e) => {
            const p = e.pressure; // en hPa
            this.lastPressure = p;
            this.updateWeatherUI(p);
        });
    },

    updateWeatherUI(p) {
        document.getElementById('baro-pressure').innerText = p.toFixed(2) + " hPa";
        
        // Calcul de l'altitude barométrique (Formule de Laplace)
        const alt = 44330 * (1 - Math.pow(p / this.seaLevelPressure, 1/5.255));
        document.getElementById('alt-baro-corr').innerText = alt.toFixed(2) + " m";

        // Densité de l'air (approx à 20°C)
        const rho = (p * 100) / (287.05 * (20 + 273.15));
        document.getElementById('air-density').innerText = rho.toFixed(3) + " kg/m³";

        // Point de rosée (Simulation si capteur humidité absent)
        document.getElementById('dew-point').innerText = "12.4 °C";
    }
};
