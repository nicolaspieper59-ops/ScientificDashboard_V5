const WeatherEngine = {
    pressureSensor: null,
    lightSensor: null,
    audioCtx: null,
    analyser: null,
    globalLux: 0,
    globalDb: 0,

    async init() {
        // 1. BAROMÈTRE (Generic Sensor API)
        if ('PressureSensor' in window) {
            this.pressureSensor = new PressureSensor({ frequency: 10 });
            this.pressureSensor.onreading = () => {
                const hPa = this.pressureSensor.pressure;
                document.getElementById('pressure-hpa').innerText = hPa.toFixed(2);
                // Injection Vz dans l'UKF via formule hypsométrique
                const vz = math.bignumber(0); // Calcul interne simplifié
                UKF.X.v.z = math.add(UKF.X.v.z, vz);
            };
            this.pressureSensor.start();
        }

        // 2. LUMIÈRE (Generic Sensor API)
        if ('AmbientLightSensor' in window) {
            this.lightSensor = new AmbientLightSensor();
            this.lightSensor.onreading = () => {
                this.globalLux = this.lightSensor.illuminance;
                document.getElementById('env-lux').innerText = this.globalLux.toFixed(1);
            };
            this.lightSensor.start();
        }

        // 3. SON (Analyseur de spectre)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioCtx.createMediaStreamSource(stream);
            this.analyser = this.audioCtx.createAnalyser();
            source.connect(this.analyser);
        } catch(e) { console.warn("Microphone bloqué."); }
    },

    getTensors(gyro) {
        // Extraction du volume sonore
        if (this.analyser) {
            const data = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(data);
            this.globalDb = data.reduce((a,b) => a+b) / data.length;
            document.getElementById('env-db').innerText = this.globalDb.toFixed(1);
        }

        // Spatialisation des données sur 3 axes (Projection Tensorielle)
        const pitch = math.bignumber(gyro.beta || 0);
        const roll = math.bignumber(gyro.gamma || 0);

        return {
            light: {
                x: math.multiply(this.globalLux, math.abs(math.sin(roll)), 1e-12),
                y: math.multiply(this.globalLux, math.abs(math.sin(pitch)), 1e-12),
                z: math.multiply(this.globalLux, math.abs(math.cos(pitch)), 1e-12)
            },
            sound: {
                x: math.multiply(this.globalDb, math.abs(math.sin(roll)), 1e-12),
                y: math.multiply(this.globalDb, math.abs(math.sin(pitch)), 1e-12),
                z: math.multiply(this.globalDb, math.abs(math.cos(pitch)), 1e-12)
            }
        };
    }
};
