const Navigation3D = {
    lastT: performance.now(),
    async init() {
        // Demande de permission pour iOS/Android
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }

        window.addEventListener('deviceorientation', (e) => {
            UKF.pitch = math.divide(math.multiply(math.bignumber(e.beta || 0), math.pi), 180);
            UKF.roll = math.divide(math.multiply(math.bignumber(e.gamma || 0), math.pi), 180);
            document.getElementById('pitch').innerText = (e.beta || 0).toFixed(1) + "°";
        });

        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = (now - this.lastT) / 1000;
            this.lastT = now;
            
            const lightSound = WeatherEngine.getTensors();
            UKF.update(e.accelerationIncludingGravity, e.rotationRate, dt, lightSound, lightSound);
        });
    }
};

// LE LIEN FINAL AVEC TON BOUTON HTML
document.getElementById('start-btn-final').addEventListener('click', () => {
    WeatherEngine.init();
    Navigation3D.init();
    document.getElementById('ekf-status').innerText = "V100 PRO : SYSTÈME ACTIF";
});
