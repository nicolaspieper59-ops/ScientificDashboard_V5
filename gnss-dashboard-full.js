const MainHub = {
    async init() {
        document.getElementById('start-btn-final').addEventListener('click', async () => {
            await TimeSync.sync();
            TimeSync.loop();
            this.activateSensors();
        });
    },

    async activateSensors() {
        // 1. Accéléromètre Linéaire Haute Fréquence
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({ frequency: 60 });
            acc.onreading = () => {
                UKF_PRO.update(acc.y, null, 1/60, window.lastGpsSpeed);
                // Mise à jour IMU IDs
                document.getElementById('acc-x').innerText = acc.x.toFixed(3);
                document.getElementById('acc-y').innerText = acc.y.toFixed(3);
                document.getElementById('acc-z').innerText = acc.z.toFixed(3);
            };
            acc.start();
        }

        // 2. Capteur de Lumière (API Chrome)
        if ('AmbientLightSensor' in window) {
            const light = new AmbientLightSensor();
            light.onreading = () => {
                const lux = light.illuminance;
                document.getElementById('ambient-light').innerText = lux.toFixed(1) + " Lux";
                document.getElementById('env-lux').innerText = lux > 10 ? "Extérieur" : "Poche/Sombre";
            };
            light.start();
        }

        // 3. Audio (Décibels & Fréquence)
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const trackSound = () => {
            analyser.getByteFrequencyData(data);
            const level = Math.max(...data);
            document.getElementById('sound-level').innerText = (20 * Math.log10(level || 1)).toFixed(1) + " dB";
            requestAnimationFrame(trackSound);
        };
        trackSound();
        
        document.getElementById('status-physique').innerText = "V100 PRO OPÉRATIONNEL";
    }
};

document.addEventListener('DOMContentLoaded', () => MainHub.init());
