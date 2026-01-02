const WeatherEngine = {
    lux: 0, db: 0,
    async init() {
        // Capteur de Pression (Baromètre) - Nécessite le Flag Chrome
        if ('PressureSensor' in window) {
            const press = new PressureSensor({ frequency: 10 });
            press.onreading = () => {
                const hpa = press.pressure;
                document.getElementById('pressure-hpa').innerText = hpa.toFixed(2);
            };
            press.start();
        }

        // Capteur de Lumière
        if ('AmbientLightSensor' in window) {
            const light = new AmbientLightSensor();
            light.onreading = () => { this.lux = light.illuminance; document.getElementById('env-lux').innerText = this.lux; };
            light.start();
        }

        // Microphone (Niveau sonore)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            setInterval(() => {
                analyser.getByteFrequencyData(data);
                this.db = data.reduce((a, b) => a + b) / data.length;
                document.getElementById('env-db').innerText = this.db.toFixed(1);
            }, 100);
        } catch(e) { console.log("Microphone non autorisé"); }
    },

    getTensors() {
        // Transforme lumière et son en vecteurs microscopiques pour l'UKF
        return {
            x: math.multiply(this.lux, 1e-12),
            y: math.multiply(this.db, 1e-12),
            z: math.bignumber(0)
        };
    }
};
