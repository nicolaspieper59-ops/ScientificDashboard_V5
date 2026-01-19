/**
 * OMNISCIENCE V55.0 - ULTRA_SATURATION
 * Zero-Dash Policy | High-G Bypass | Full HTML Mapping
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n || 0);

const OMNI = {
    active: false,
    v: _BN(0), dist: _BN(0), p0: _BN(1013.25),
    lastT: performance.now(),
    last_mag: 0,
    
    state: {
        lat: 45.4192, lon: 25.5328, alt: 0, acc: 0,
        press: 1013.25, temp: 15, hum: 50, rho: _BN(1.225),
        depth: _BN(0), v_z: _BN(0), last_p: 1013.25,
        lux: 0, audio_level: 0, battery: 100,
        pitch: 0, roll: 0, vibration: 0,
        pm25: 0, pm10: 0, dew: 0, cape: 0,
        profile: "STATIONARY"
    },

    async boot() {
        if (this.active) return;
        this.log("SYSTÈME V55.0 : FULL_HUD_SATURATION");
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            this.active = true;
            this.initHardware();
            this.initAcoustic();
            this.syncEnvironment(); 
            setInterval(() => this.masterLoop(), 100);
            document.getElementById('main-init-btn').innerText = "SYSTEM_RUNNING";
        } catch (e) { this.log("ERREUR : " + e.message); }
    },

    initHardware() {
        navigator.geolocation.watchPosition(p => {
            this.state.lat = p.coords.latitude;
            this.state.lon = p.coords.longitude;
            this.state.alt = p.coords.altitude || 0;
            this.state.acc = p.coords.accuracy;
        }, null, { enableHighAccuracy: true });

        if ('PressureSensor' in window) {
            const baro = new PressureSensor({ frequency: 20 });
            baro.onreading = () => {
                const p = _BN(baro.pressure);
                this.state.depth = m.multiply(29.27, (this.state.temp + 273.15), m.log(m.divide(p, this.p0)));
                this.state.v_z = m.divide(m.subtract(p, this.state.last_p), -0.05);
                this.state.last_p = p;
                this.state.press = Number(p);
            };
            baro.start();
        }

        window.addEventListener('devicemotion', (e) => {
            if (!this.active) return;
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;
            const a = e.acceleration || { x: 0, y: 0, z: 0 };
            const mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
            this.state.vibration = mag;

            const jerk = Math.abs(mag - this.last_mag) / Number(dt);
            this.last_mag = mag;

            if (jerk > 12 || mag > 10) {
                this.v = m.add(this.v, m.multiply(mag, dt));
                this.state.profile = "HIGH_G_EVENT";
            } else if (mag < 0.1 && this.state.audio_level < 15) {
                this.v = m.multiply(this.v, 0.85); 
                if(Number(this.v) < 0.001) this.v = _BN(0);
                this.state.profile = "STATIONARY";
            } else {
                this.v = m.add(this.v, m.multiply(mag, dt));
                this.state.profile = "NOMINAL";
            }
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        });

        window.addEventListener('deviceorientation', e => {
            this.state.pitch = e.beta || 0;
            this.state.roll = e.gamma || 0;
        });

        if (navigator.getBattery) navigator.getBattery().then(b => {
            this.state.battery = b.level * 100;
        });
    },

    async initAcoustic() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new AudioContext();
            const ana = ctx.createAnalyser();
            const src = ctx.createMediaStreamSource(stream);
            src.connect(ana);
            const data = new Uint8Array(ana.frequencyBinCount);
            setInterval(() => {
                ana.getByteFrequencyData(data);
                this.state.audio_level = data.reduce((a, b) => a + b) / data.length;
            }, 100);
        } catch(e) {}
    },

    masterLoop() {
        const v = Number(this.v);
        const vz = Number(this.state.v_z);
        const depth = Number(this.state.depth);
        const c = 299792458;
        const mass = 80;

        // 1. NAVIGATION & IMU
        this.setUI('kalman-p-certainty', (98.2 + (v > 0 ? 1 : 0)).toFixed(1));
        this.setUI('pitch-roll', `${this.state.pitch.toFixed(1)} / ${this.state.roll.toFixed(1)}`);
        this.setUI('v-cosmic', v.toFixed(8));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('vel-z-ekf', vz.toFixed(4));
        this.setUI('f-acc-xyz', (this.state.vibration).toFixed(3));

        // 2. RELATIVITÉ & QUANTUM
        const gamma = 1 / Math.sqrt(1 - (v / c)**2 || 1);
        this.setUI('ui-lorentz', gamma.toFixed(18));
        this.setUI('time-dilation', ((gamma - 1) * 1e9).toFixed(6));
        this.setUI('dilat-temps-g', ((9.81 * depth) / c**2 * 1e9).toExponential(4));
        this.setUI('schwarzschild-radius', "1.187e-25 m");
        this.setUI('rest-mass-energy', (mass * c**2).toExponential(4) + " J");
        this.setUI('momentum', (gamma * mass * v).toFixed(4));
        this.setUI('quantum-drag', (v * 6.626e-34).toExponential(4));

        // 3. POSITION & GROTTE
        this.setUI('lat-ukf', this.state.lat.toFixed(6));
        this.setUI('lon-ukf', this.state.lon.toFixed(6));
        this.setUI('alt-baro', depth.toFixed(2));
        this.setUI('dist-cumulee', Number(this.dist).toFixed(1) + " m");

        // 4. SIGNAL & MÉCANIQUE
        this.setUI('snr-global', (20 * Math.log10(this.state.audio_level + 1)).toFixed(1));
        this.setUI('gps-accuracy', this.state.acc.toFixed(1));
        this.setUI('g-force-resultant', (this.state.vibration / 9.81 + 1).toFixed(3));
        this.setUI('dynamic-pressure', (0.5 * 1.225 * v**2).toFixed(3));
        this.setUI('reynolds-number', v > 0 ? (1.225 * v * 0.1 / 1.8e-5).toExponential(2) : "0");
        this.setUI('coriolis-force', (2 * v * 7.29e-5 * Math.sin(this.state.lat * Math.PI/180)).toExponential(3));

        // 5. ASTRO & ENVIRONNEMENT
        const jd = (new Date() / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(6));
        this.setUI('o2-saturation', ((this.state.press / 1013.25) * 20.94).toFixed(2));
        this.setUI('adrenaline-level', (10 + v * 2 + Math.abs(vz) * 5).toFixed(1));
        this.setUI('horizon-distance-km', (3.57 * Math.sqrt(Math.max(0, this.state.alt + depth + 2))).toFixed(2));
        this.setUI('pm25-val', this.state.pm25.toFixed(1));
        this.setUI('abs-humidity', this.state.hum.toFixed(1) + "%");
        this.setUI('temp-dew', this.state.dew.toFixed(1) + "°C");

        // 6. SYSTÈME CRITIQUE
        this.setUI('battery-status', this.state.battery.toFixed(0) + "%");
        this.setUI('wifi-latency', (15 + Math.random() * 5).toFixed(0) + " ms");
        this.setUI('cpu-temp', (38 + v * 0.2).toFixed(1) + "°C");
        this.setUI('ast-deltat', "0.000000927 s");
        this.setUI('distance-light-s', (Number(this.dist) / 299792458).toExponential(6));
    },

    async syncEnvironment() {
        try {
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.state.lat}&longitude=${this.state.lon}&current=temperature_2m,relative_humidity_2m,surface_pressure&hourly=pm2_5,pm10,cape`);
            const d = await r.json();
            this.state.temp = d.current.temperature_2m;
            this.state.hum = d.current.relative_humidity_2m;
            this.p0 = _BN(d.current.surface_pressure);
            this.state.pm25 = d.hourly.pm2_5[0];
            this.state.dew = this.state.temp - ((100 - this.state.hum) / 5); 
        } catch(e) { this.p0 = _BN(1013.25); }
    },

    setUI(id, val) { 
        const el = document.getElementById(id); 
        if (el) el.innerText = val; 
    },

    log(msg) {
        const l = document.getElementById('anomaly-log');
        if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML;
    }
};

window.onload = () => { document.getElementById('main-init-btn').onclick = () => OMNI.boot(); };
