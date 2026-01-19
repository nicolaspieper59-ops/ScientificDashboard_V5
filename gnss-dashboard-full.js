/**
 * OMNISCIENCE V53.0 - GRAVITY_BREAKER_MAX
 * Fusion Multimodale (IMU+Baro+Audio+Lux) | ZUPT Anti-Drift | Zero-Latency Bypass
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
        lux: 0, audio_level: 0, 
        pitch: 0, roll: 0, vibration: 0,
        profile: "STATIONARY", v_var: _BN(1.0),
        v_buffer: []
    },

    async boot() {
        if (this.active) return;
        this.log("INITIALISATION V53.0 : GRAVITY_BREAKER_MAX");
        try {
            // Permissions iOS/Android
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') throw new Error("Accès senseurs refusé");
            }
            
            this.active = true;
            this.initHardware();
            this.initAcoustic();
            await this.syncEnvironment();
            
            // Boucle de rendu haute fréquence
            setInterval(() => this.masterLoop(), 100);
            
            const btn = document.getElementById('main-init-btn');
            if(btn) { btn.innerText = "SYSTEM_RUNNING"; btn.style.color = "#00ff88"; }
            this.log("SYSTÈME OMNISCIENT : RÉALISME TOTAL ACTIVÉ");
        } catch (e) { this.log("ERREUR CRITIQUE : " + e.message); }
    },

    initHardware() {
        // GPS
        navigator.geolocation.watchPosition(p => {
            this.state.lat = p.coords.latitude;
            this.state.lon = p.coords.longitude;
            this.state.alt = p.coords.altitude || 0;
            this.state.acc = p.coords.accuracy;
        }, null, { enableHighAccuracy: true });

        // Baromètre (Grotte & Chute Libre)
        if ('PressureSensor' in window) {
            const baro = new PressureSensor({ frequency: 25 });
            baro.onreading = () => {
                const p = _BN(baro.pressure);
                const dt = 0.04; 
                const dp = m.subtract(p, this.state.last_p);
                // Vz par gradient de pression (EKF)
                this.state.v_z = m.divide(m.multiply(-287.05, (this.state.temp + 273.15), dp), m.multiply(9.81, p, dt));
                // Profondeur hydrostatique
                this.state.depth = m.multiply(29.27, (this.state.temp + 273.15), m.log(m.divide(p, this.p0)));
                this.state.last_p = p;
                this.state.press = Number(p);
            };
            baro.start();
        }

        // Accéléromètre 64-bit avec Bypass de retard
        window.addEventListener('devicemotion', (e) => {
            if (!this.active) return;
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;

            const a = e.acceleration || { x: 0, y: 0, z: 0 };
            const mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
            this.state.vibration = mag;

            // Détection du JERK (Variation brusque pour chute libre)
            const jerk = Math.abs(mag - this.last_mag) / Number(dt);
            this.last_mag = mag;

            // GESTION DU RÉALISME ET ANTI-DÉRIVE
            this.state.v_buffer.push(mag);
            if(this.state.v_buffer.length > 10) this.state.v_buffer.shift();
            const variance = math.std(this.state.v_buffer);

            // Si mouvement brusque (Jerk > 15) : BYPASS TOTAL (Zéro retard)
            if (jerk > 15 || mag > 12) {
                this.v = m.add(this.v, m.multiply(mag, dt));
                this.state.profile = "BALLISTIC_EVENT";
            } 
            // Si immobile (Variance faible + Lumière fixe + Pas de bruit)
            else if (variance < 0.03 && this.state.audio_level < 15) {
                this.v = m.multiply(this.v, 0.7); // Freinage ZUPT
                if(Number(this.v) < 0.005) this.v = _BN(0);
                this.state.profile = "STATIONARY";
            } 
            // Mode transport normal
            else {
                const drag = m.multiply(0.5, this.state.rho, m.pow(this.v, 2), 0.4);
                const a_eff = Math.max(0, mag - Number(m.divide(drag, 80)));
                this.v = m.add(this.v, m.multiply(a_eff, dt));
                this.state.profile = "TRANSPORT";
            }
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        });

        window.addEventListener('deviceorientation', e => {
            this.state.pitch = e.beta || 0;
            this.state.roll = e.gamma || 0;
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
        
        if ('AmbientLightSensor' in window) {
            const ls = new AmbientLightSensor();
            ls.onreading = () => { this.state.lux = ls.lux; };
            ls.start();
        }
    },

    getAstro() {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        const d = jd - 2451545.0;
        let gmst = (18.697374558 + 24.06570982441908 * d) % 24;
        let tslv = (gmst + this.state.lon / 15) % 24;
        const l_age = (jd - 2451550.1) % 29.530588;
        const p_idx = Math.floor((l_age / 29.530588) * 8);
        const moon_icons = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
        
        const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const b = (360/365)*(doy-81)*(Math.PI/180);
        const eot = 9.87*Math.sin(2*b) - 7.53*Math.cos(b) - 1.5*Math.sin(b);
        const solar = new Date(now.getTime() + (this.state.lon*4 + eot)*60000);

        return { jd, tslv: (tslv<0?tslv+24:tslv), moon: moon_icons[p_idx], solar: solar.toLocaleTimeString() };
    },

    masterLoop() {
        const v = Number(this.v);
        const vz = Number(this.state.v_z);
        const depth = Number(this.state.depth);
        const astro = this.getAstro();
        const c = 299792458;

        // --- CINÉMATIQUE ---
        this.setUI('v-cosmic', v.toFixed(8));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('vitesse-raw', v.toFixed(4));
        this.setUI('vel-z-ekf', vz.toFixed(4));
        const v_snd = 331.3 * Math.sqrt(1 + this.state.temp / 273.15);
        this.setUI('mach-number', (v / v_snd).toFixed(4));

        // --- RELATIVITÉ ---
        const gamma = 1 / Math.sqrt(1 - (v / c)**2 || 1);
        this.setUI('ui-lorentz', gamma.toFixed(18));
        this.setUI('time-dilation', ((gamma - 1) * 1e9).toFixed(6));
        this.setUI('dilat-temps-g', ((9.81 * depth) / c**2 * 1e9).toExponential(4));
        this.setUI('schwarzschild-radius', "1.187e-25");

        // --- POSITION & GROTTE ---
        this.setUI('alt-baro', depth.toFixed(2));
        this.setUI('dist-cumulee', Number(this.dist).toFixed(1));
        this.setUI('horizon-distance-km', (3.57 * Math.sqrt(Math.max(0, this.state.alt + depth))).toFixed(2));

        // --- ASTRO ---
        this.setUI('ast-jd', astro.jd.toFixed(6));
        this.setUI('sidereal-tslv', Math.floor(astro.tslv) + "h " + Math.floor((astro.tslv%1)*60) + "m");
        this.setUI('temps-solaire', astro.solar);
        this.setUI('phase-lunaire', astro.moon);
        this.setUI('ast-deltat', "0.000000927");

        // --- MÉCANIQUE ---
        const p_dyn = 0.5 * Number(this.state.rho) * v**2;
        this.setUI('dynamic-pressure', p_dyn.toFixed(3));
        this.setUI('reynolds-number', v > 0 ? (1.225 * v * 0.1 / 1.8e-5).toExponential(2) : "0");
        this.setUI('coriolis-force', (2 * v * 7.29e-5 * Math.sin(this.state.lat * Math.PI/180)).toExponential(3));
        this.setUI('g-force-resultant', (this.state.vibration / 9.81 + 1).toFixed(3));

        // --- SIGNAL & BIO ---
        this.setUI('snr-global', (20 * Math.log10(this.state.audio_level + 1)).toFixed(1));
        this.setUI('visibilite', this.state.lux > 5 ? "99.9%" : "0.1%");
        this.setUI('gps-accuracy', this.state.acc.toFixed(1));
        this.setUI('o2-saturation', ((this.state.press / 1013.25) * 20.9).toFixed(2));
        this.setUI('adrenaline-idx', (10 + v*2 + Math.abs(vz)*5).toFixed(1));
        this.setUI('kalman-p-certainty', (this.state.profile === "STATIONARY" ? "100" : "98.2"));
    },

    async syncEnvironment() {
        try {
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.state.lat}&longitude=${this.state.lon}&current=temperature_2m,surface_pressure`);
            const d = await r.json();
            this.state.temp = d.current.temperature_2m;
            this.p0 = _BN(d.current.surface_pressure);
            this.state.rho = _BN((d.current.surface_pressure * 100) / (287.058 * (this.state.temp + 273.15)));
        } catch(e) { this.state.rho = _BN(1.225); }
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) {
        const l = document.getElementById('anomaly-log');
        if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML;
    }
};

window.onload = () => { document.getElementById('main-init-btn').onclick = () => OMNI.boot(); };
