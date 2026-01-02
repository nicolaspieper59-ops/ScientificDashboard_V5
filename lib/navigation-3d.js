const Navigation3D = {
    lastT: performance.now(),

    async init() {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const p = await DeviceMotionEvent.requestPermission();
            if (p !== 'granted') return alert("Permission refusée");
        }

        window.addEventListener('deviceorientation', (e) => {
            UKF.setOrientation(e.beta, e.gamma);
            document.getElementById('pitch').innerText = (e.beta || 0).toFixed(1) + "°";
            document.getElementById('roll').innerText = (e.gamma || 0).toFixed(1) + "°";
        });

        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = (now - this.lastT) / 1000;
            this.lastT = now;

            const tensors = WeatherEngine.getTensors(e.rotationRate || {});
            UKF.update(e.accelerationIncludingGravity, e.rotationRate, dt, tensors.light, tensors.sound);
        });
    }
};
