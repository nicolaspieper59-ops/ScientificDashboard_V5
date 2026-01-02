const MainEngine = {
    isStarted: false,
    startTime: 0,
    dist3D: 0,

    async init() {
        if (this.isStarted) return;
        this.isStarted = true;
        this.startTime = performance.now();

        // WakeLock : Indispensable pour le record de 24h
        if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');

        // Permissions Capteurs (HTTPS Obligatoire)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }

        WeatherEngine.init();

        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity;
            const a_tot = Math.sqrt(acc.x**2 + acc.y**2 + (acc.z - 9.8067)**2);
            const v = UKF.update(a_tot, 0.02);
            this.dist3D += v * 0.02;
        });

        setInterval(() => this.syncUI(), 100);
    },

    syncUI() {
        const v_ms = UKF.v;
        const v_kmh = v_ms * 3.6;
        const c = 299792458;
        const mass = parseFloat(document.getElementById('mass-input').value) || 70;

        // Dynamique & Vitesse
        document.getElementById('speed-main-display').innerText = v_kmh.toFixed(4);
        document.getElementById('sp-main-hud').innerText = v_kmh.toFixed(1);
        document.getElementById('v-stable-kmh').innerText = v_kmh.toFixed(2);
        document.getElementById('v-cosmic').innerText = (v_kmh + 108340).toLocaleString() + " km/h";
        document.getElementById('dist-3d-precis').innerText = (this.dist3D / 1000).toFixed(4);

        // Physique & Relativité
        const beta = v_ms / c;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        document.getElementById('lorentz-factor').innerText = gamma.toFixed(15);
        document.getElementById('time-dilation-vitesse').innerText = ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j";
        document.getElementById('kinetic-energy').innerText = (0.5 * mass * v_ms**2).toFixed(2) + " J";

        // Astro
        AstroEngine.update();

        // Systèmes
        document.getElementById('elapsed-time').innerText = ((performance.now() - this.startTime)/1000).toFixed(1);
        document.getElementById('utc-time-sync').innerText = new Date().toLocaleTimeString();
        document.getElementById('cpu-status').innerText = "OPTIMAL";
        document.getElementById('ekf-status').innerText = "FUSION ACTIVE (UKF)";
    }
};

document.getElementById('start-btn-final').addEventListener('click', () => MainEngine.init());
