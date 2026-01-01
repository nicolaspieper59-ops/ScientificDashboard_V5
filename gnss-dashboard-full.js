/**
 * OMNISCIENCE V100 PRO - MAIN SENSOR HUB
 */
const MainController = {
    isRunning: false,

    async init() {
        const startBtn = document.getElementById('start-btn-final');
        startBtn.addEventListener('click', () => this.activate());
    },

    async activate() {
        if (this.isRunning) return location.reload();
        
        try {
            // Permissions cruciales
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            
            await TimeSync.sync();
            this.isRunning = true;
            this.startLoops(stream);
        } catch (err) {
            alert("Erreur : Autorisez le Micro et les Capteurs (HTTPS requis).");
        }
    },

    startLoops(stream) {
        // 1. CAPTEUR DE LUMIÈRE (API Chrome)
        if ('AmbientLightSensor' in window) {
            const light = new AmbientLightSensor();
            light.onreading = () => {
                document.getElementById('lux-api').innerText = light.illuminance.toFixed(1);
            };
            light.start();
        }

        // 2. ANALYSE SONORE (Décibels)
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // 3. IMU HAUTE FRÉQUENCE
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({frequency: 60});
            const gyro = new Gyroscope({frequency: 60});
            
            acc.onreading = () => {
                UKF_PRO.update(acc, gyro, 1/60, window.lastGpsSpeed);
            };
            acc.start(); gyro.start();
        }

        // 4. RENDU TEMPS RÉEL (0.001s GMT)
        const loop = () => {
            const now = TimeSync.getAtomicTime();
            const d = new Date(now);
            const timeStr = d.toISOString().split('T')[1].replace('Z','');
            document.getElementById('gmt-time-sync').innerText = timeStr;
            
            // Calcul de la Date Julienne
            const jd = (now / 86400000) + 2440587.5;
            document.getElementById('julian-date').innerText = jd.toFixed(6);

            if (this.isRunning) requestAnimationFrame(loop);
        };
        loop();
    }
};
document.addEventListener('DOMContentLoaded', () => MainController.init());
