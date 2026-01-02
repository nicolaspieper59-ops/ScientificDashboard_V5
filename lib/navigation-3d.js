const Navigation3D = {
    mode: "EARTH",
    currentOri: { beta: 0, gamma: 0, alpha: 0 },

    async start() {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }

        window.addEventListener('deviceorientation', (e) => {
            this.currentOri = { beta: e.beta, gamma: e.gamma, alpha: e.alpha };
        });

        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity;
            const gyro = e.rotationRate;

            // DÉTECTION AUTOMATIQUE DU RÉFÉRENTIEL
            const totalG = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.81;
            
            if (totalG > 2.5) this.mode = "ACROBATICS";
            else if (totalG < 0.1) this.mode = "SPACE";
            else this.mode = "EARTH";

            UKF.predict(acc, gyro, this.currentOri, this.mode);
        });

        document.getElementById('ekf-status').innerText = "V100 PRO : SYSTÈME ACTIF (" + this.mode + ")";
    }
};

// Liaison bouton INITIALISER OMNISCIENCE
document.querySelector('.btn-primary').addEventListener('click', () => {
    Navigation3D.start();
});
