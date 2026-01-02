const Navigation3D = {
    lastT: performance.now(),
    active: false,

    async init() {
        if (this.active) return;
        
        // Demande de permission iOS/Android
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const p = await DeviceMotionEvent.requestPermission();
            if (p !== 'granted') return alert("Accès capteurs refusé");
        }

        window.addEventListener('devicemotion', (e) => this.process(e));
        this.active = true;
        document.getElementById('ekf-status').innerText = "21-STATES ACTIVE";
    },

    process(e) {
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;

        const acc = e.acceleration || {x:0, y:0, z:0};
        const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};

        // Détection Salto
        const rot = Math.abs(gyro.alpha) + Math.abs(gyro.beta) + Math.abs(gyro.gamma);
        if (rot > 400) {
            document.getElementById('motion-mode-master').innerText = "MODE SALTO";
            return; // On fige l'UKF pendant la rotation
        } else {
            document.getElementById('motion-mode-master').innerText = "STABLE";
        }

        UKF.update(acc, gyro, dt);
    }
};
