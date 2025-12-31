/**
 * OMNISCIENCE V100 PRO - SENSOR HUB
 * Gère les API Chrome : AmbientLight, Accelerometer, AudioAnalyzer
 */
const MainController = {
    isActive: false,
    sensors: {},

    async init() {
        const btn = document.getElementById('start-btn-final');
        btn.addEventListener('click', () => this.startGlobalSystem());
    },

    async startGlobalSystem() {
        if (this.isActive) return location.reload();
        this.isActive = true;

        document.getElementById('start-btn-final').innerText = "SYSTÈME ACTIF";
        document.getElementById('start-btn-final').style.background = "#ff00ff";

        // 1. CAPTEUR DE LUMIÈRE (Ambient Light Sensor API)
        if ('AmbientLightSensor' in window) {
            try {
                this.sensors.light = new AmbientLightSensor();
                this.sensors.light.addEventListener('reading', () => {
                    const lux = this.sensors.light.illuminance;
                    document.getElementById('lux-api').innerText = lux.toFixed(1);
                    // Pression de radiation théorique
                    const pRad = (lux * 0.0079) / 299792458;
                    document.getElementById('pression-radiation').innerText = pRad.toExponential(3) + " Pa";
                });
                this.sensors.light.start();
            } catch (e) { console.warn("Lumière non supportée"); }
        }

        // 2. ANALYSE DU SON (Web Audio API)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);

            const updateSound = () => {
                analyser.getByteFrequencyData(data);
                let avg = data.reduce((a, b) => a + b) / data.length;
                document.getElementById('db-level').innerText = (avg + 30).toFixed(1) + " dB";
                if (this.isActive) requestAnimationFrame(updateSound);
            };
            updateSound();
        } catch (e) { console.warn("Microphone bloqué"); }

        // 3. IMU HAUTE FRÉQUENCE (Accelerometer & Gyroscope)
        if ('LinearAccelerationSensor' in window) {
            this.sensors.accel = new LinearAccelerationSensor({frequency: 60});
            this.sensors.accel.addEventListener('reading', () => {
                const a = this.sensors.accel;
                document.getElementById('acc-x').innerText = a.x.toFixed(3);
                document.getElementById('acc-y').innerText = a.y.toFixed(3);
                document.getElementById('acc-z').innerText = a.z.toFixed(3);
                UKF_PRO.updateIMU(a, {x:0, y:0, z:0});
                this.updateRelativityUI();
            });
            this.sensors.accel.start();
        }

        // 4. BOUCLE ASTRO (1Hz)
        setInterval(() => {
            AstroEngine.update(43.29, 5.37); // Marseille par défaut
        }, 1000);
    },

    updateRelativityUI() {
        const rel = UKF_PRO.getRelativity();
        document.getElementById('lorentz-factor').innerText = rel.gamma.toFixed(12);
        document.getElementById('time-dilation-gravite').innerText = rel.gravDilation.toFixed(4) + " ns/j";
        document.getElementById('energy-mass-e0').innerText = rel.energy.toExponential(4) + " J";
    }
};

document.addEventListener('DOMContentLoaded', () => MainController.init());
