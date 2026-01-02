const Navigation3D = {
    lastT: performance.now(),
    async init() {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }

        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = (now - this.lastT) / 1000;
            this.lastT = now;

            const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};
            
            // On injecte l'inclinaison réelle venant de l'orientation
            UKF.update(acc, gyro, dt, WeatherEngine.getTensors());
        });

        window.addEventListener('deviceorientation', (e) => {
            document.getElementById('pitch').innerText = (e.beta || 0).toFixed(1) + "°";
            document.getElementById('roll').innerText = (e.gamma || 0).toFixed(1) + "°";
        });
    }
};

// Activation
document.getElementById('start-btn-final').onclick = () => {
    WeatherEngine.init();
    Navigation3D.init();
    document.getElementById('ekf-status').innerText = "21-STATES ACTIVE (64-BIT)";
};
