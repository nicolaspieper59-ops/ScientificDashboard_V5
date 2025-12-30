/**
 * MASTER CONTROLER - OMNISCIENCE V100
 * Mapping complet de tous les IDs du HTML
 */
const Dashboard = {
    ukf: new UKFPro(),
    isRunning: false,
    startTime: null,
    maxSpeed: 0,

    init() {
        document.getElementById('start-btn').addEventListener('click', () => this.start());
        this.initSensors();
    },

    start() {
        this.isRunning = true;
        this.startTime = Date.now();
        document.getElementById('start-btn').style.display = 'none';
        document.getElementById('status-physique').textContent = "SYSTÈME ACTIF";
    },

    initSensors() {
        window.addEventListener('devicemotion', (e) => {
            if (!this.isRunning) return;
            const dt = 0.016;
            const res = this.ukf.update(e.accelerationIncludingGravity, e.rotationRate, dt);
            this.updateUI(e, res);
        });

        // Capteur de lumière (ID: env-lux)
        if ('AmbientLightSensor' in window) {
            const sensor = new AmbientLightSensor();
            sensor.onreading = () => document.getElementById('env-lux').textContent = sensor.illuminance + " lx";
            sensor.start();
        }
    },

    updateUI(e, ukfRes) {
        // 1. Colonne SYSTÈME
        document.getElementById('elapsed-time').textContent = ((Date.now() - this.startTime)/1000).toFixed(2) + " s";
        document.getElementById('ukf-velocity-uncertainty').textContent = ukfRes.uncertainty.toFixed(4);

        // 2. Colonne NAVIGATION & RELATIVITÉ (ID sp-main et speed-stable-kmh)
        const v = Math.abs(this.ukf.state.vel[2] * 3.6); // km/h
        if(v > this.maxSpeed) this.maxSpeed = v;
        
        document.getElementById('sp-main').textContent = v.toFixed(4);
        document.getElementById('speed-stable-kmh').textContent = v.toFixed(1) + " km/h";
        document.getElementById('speed-max-session').textContent = this.maxSpeed.toFixed(1) + " km/h";
        
        const gamma = 1 / Math.sqrt(1 - (v/1079252848)**2); // Relativité
        document.getElementById('lorentz-factor').textContent = gamma.toFixed(8);
        document.getElementById('lorentz-val').textContent = gamma.toFixed(10);

        // 3. Colonne DYNAMIQUE (G-Force et Inclinaison)
        const g = Math.sqrt(e.accelerationIncludingGravity.x**2 + e.accelerationIncludingGravity.y**2 + e.accelerationIncludingGravity.z**2) / 9.80665;
        document.getElementById('g-force').textContent = g.toFixed(2);
        document.getElementById('force-g-vert').textContent = g.toFixed(2);
        document.getElementById('pitch').textContent = (ukfRes.pitch * 57.29).toFixed(1) + "°";
        document.getElementById('roll').textContent = (ukfRes.roll * 57.29).toFixed(1) + "°";

        // 4. Colonne ASTRO (Appel moteur astro)
        const astro = AstroEngine.calculate(43.28, 5.34); // Marseille par défaut
        document.getElementById('tslv').textContent = astro.tslv;
        document.getElementById('hud-sun-alt').textContent = astro.sunAlt + "°";
        document.getElementById('julian-date').textContent = astro.jd;
    }
};

Dashboard.init();
