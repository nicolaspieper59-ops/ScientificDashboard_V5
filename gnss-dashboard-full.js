const MainEngine = {
    isStarted: false,
    dist3D: 0,
    startTime: 0,

    async activate() {
        if (this.isStarted) return;
        this.isStarted = true;
        this.startTime = performance.now();

        // WakeLock : Empêche l'écran de s'éteindre pendant le record
        if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');

        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }
        
        WeatherEngine.init();
        
        // Boucle Inertielle (50Hz)
        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity;
            const a_total = Math.sqrt(acc.x**2 + acc.y**2 + (acc.z - 9.80512)**2);
            const v = UKF.update(a_total, 0.02);
            this.dist3D += v * 0.02;
        });

        // Rendu UI (10Hz)
        setInterval(() => this.render(), 100);
    },

    render() {
        const v_ms = UKF.v;
        const v_kmh = v_ms * 3.6;
        const c = 299792458;

        // Vitesse & HUD
        document.getElementById('speed-main-display').innerText = v_kmh.toFixed(4);
        document.getElementById('sp-main-hud').innerText = v_kmh.toFixed(1);
        document.getElementById('v-stable-kmh').innerText = v_kmh.toFixed(2);
        document.getElementById('dist-3d-precis').innerText = (this.dist3D / 1000).toFixed(4);

        // Relativité (Einstein)
        const beta = v_ms / c;
        const lorentz = 1 / Math.sqrt(1 - beta**2);
        document.getElementById('lorentz-factor').innerText = lorentz.toFixed(15);
        document.getElementById('time-dilation-vitesse').innerText = ((lorentz - 1) * 86400 * 1e9).toFixed(2) + " ns/j";
        document.getElementById('kinetic-energy').innerText = (0.5 * 70 * v_ms**2).toFixed(2) + " J";

        // Cosmos
        document.getElementById('v-cosmic').innerText = (v_kmh + 107000 + 828000).toLocaleString();
        AstroEngine.update();

        // Système
        document.getElementById('elapsed-time').innerText = ((performance.now() - this.startTime)/1000).toFixed(1);
        document.getElementById('utc-time-sync').innerText = new Date().toLocaleTimeString();
        document.getElementById('ekf-status').innerText = "FUSION ACTIVE (UKF)";
    }
};

document.getElementById('start-btn-final').addEventListener('click', () => MainEngine.activate());
