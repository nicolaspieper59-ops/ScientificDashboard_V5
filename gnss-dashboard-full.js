const UIController = {
    init() {
        // Démarrage Système
        document.getElementById('start-btn-final').addEventListener('click', async () => {
            await TimeSync.sync();
            this.startSensors();
        });

        // Mode Nuit
        document.getElementById('btn-night').addEventListener('click', () => {
            document.body.classList.toggle('night-mode');
        });

        // Réinitialisation V-Max
        document.getElementById('btn-reset-vmax').addEventListener('click', () => {
            window.vMax = 0;
            document.getElementById('speed-max').innerText = "0.0";
        });
    },

    startSensors() {
        if ('LinearAccelerationSensor' in window) {
            const acc = new LinearAccelerationSensor({frequency: 60});
            acc.onreading = () => {
                UKF_PRO.update(acc.y, null, 1/60, window.lastGpsSpeed);
            };
            acc.start();
        }

        // Boucle de rendu GMT 0.001s
        const render = () => {
            const atomic = TimeSync.getAtomicTime();
            const d = new Date(atomic);
            document.getElementById('gmt-time-sync').innerText = d.toISOString().split('T')[1].replace('Z','');
            
            // Calcul Date Julienne
            const jd = (atomic / 86400000) + 2440587.5;
            document.getElementById('julian-date').innerText = jd.toFixed(6);

            requestAnimationFrame(render);
        };
        render();
    }
};
document.addEventListener('DOMContentLoaded', () => UIController.init());
