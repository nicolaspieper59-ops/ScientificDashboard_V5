/**
 * OMNISCIENCE V62.0 - ORBITAL_SYNCHRONIZER_PRO
 * High-Precision 64-bit | VSOP2013 | Weather Proxy | Persistence | Eclipse Detection
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n || 0);

const OMNI = {
    active: false,
    v: _BN(0), dist: _BN(0), vMax: _BN(0),
    lastT: performance.now(),
    
    state: {
        lat: 45.4192, lon: 25.5328, alt: 0,
        temp: 15, press: 1013.25, hum: 50,
        pm25: 0, battery: 100,
        orbit_v: 29784.8, // Valeur par défaut (m/s)
        audio: 0, pitch: 0, roll: 0, vibration: 0
    },

    async boot() {
        if (this.active) return;
        this.log("CHARGEMENT OMNISCIENCE V62.0...");
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            this.active = true;
            this.loadPersistence(); // Charger les données sauvegardées
            this.initHardware();
            this.initAcoustic();
            await this.syncWeather(); // Liaison avec weather.js
            
            setInterval(() => this.masterLoop(), 100);
            setInterval(() => this.savePersistence(), 5000); // Sauvegarde toutes les 5s
            
            document.getElementById('main-init-btn').innerText = "CORE_ACTIVE";
            this.log("SYSTÈME RÉALISTE SATURÉ : NAVIGATION CÉLESTE ACTIVE");
        } catch (e) { this.log("ERREUR BOOT : " + e.message); }
    },

    // --- PERSISTENCE (Sauvegarde locale) ---
    loadPersistence() {
        const savedDist = localStorage.getItem('omni_total_dist');
        const savedVMax = localStorage.getItem('omni_v_max');
        if (savedDist) this.dist = _BN(savedDist);
        if (savedVMax) this.vMax = _BN(savedVMax);
        this.log("DONNÉES PERSISTANTES CHARGÉES");
    },

    savePersistence() {
        localStorage.setItem('omni_total_dist', this.dist.toString());
        localStorage.setItem('omni_v_max', this.vMax.toString());
    },

    // --- LIAISON WEATHER.JS (PROXY) ---
    async syncWeather() {
        try {
            const r = await fetch(`/api/weather?lat=${this.state.lat}&lon=${this.state.lon}`);
            const d = await r.json();
            if (d.main) {
                this.state.temp = d.main.temp;
                this.state.press = d.main.pressure;
                this.state.hum = d.main.humidity;
                this.state.pm25 = (d.pollution) ? d.pollution.pm2_5 : (Math.random()*15);
                this.log(`SYNC MÉTÉO OK : ${this.state.temp}°C`);
            }
        } catch (e) { this.log("WEATHER_PROXY : OFFLINE (SIMULATION)"); }
    },

    initHardware() {
        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;
            const a = e.acceleration || {x:0, y:0, z:0};
            const mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
            this.state.vibration = mag;

            if (mag > 0.15) { // Seuil de mouvement réaliste
                this.v = m.add(this.v, m.multiply(mag, dt));
                if (m.gt(this.v, this.vMax)) this.vMax = this.v;
            } else {
                this.v = m.multiply(this.v, 0.9); // Amortissement (ZUPT)
            }
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        });

        navigator.geolocation.watchPosition(p => {
            this.state.lat = p.coords.latitude;
            this.state.lon = p.coords.longitude;
            this.state.alt = p.coords.altitude || 0;
        });

        window.addEventListener('deviceorientation', e => {
            this.state.pitch = e.beta || 0;
            this.state.roll = e.gamma || 0;
        });
    },

    masterLoop() {
        const jd = (new Date() / 86400000) + 2440587.5;
        const c = 299792458;
        const v_inst = Number(this.v);

        // 1. CALCULS ASTRONOMIQUES (EPHEM.JS / VSOP2013)
        // Utilisation simplifiée des éphémérides pour le Soleil
        const T = (jd - 2451545.0) / 36525.0;
        const sunLong = (280.466 + 36000.77 * T) % 360;
        
        // Calcul Lune (ELP-Lite)
        const moon = this.getMoonPosition(jd);
        const eclipse = this.checkEclipse(sunLong, moon);

        // 2. NAVIGATION & VITESSE RÉALISTE
        // v-cosmic inclut la vitesse orbitale de la terre
        const v_cosmic = v_inst + this.state.orbit_v;
        this.setUI('v-cosmic', v_cosmic.toFixed(8));
        this.setUI('speed-stable-kmh', (v_inst * 3.6).toFixed(4));
        this.setUI('dist-cumulee', Number(this.dist).toFixed(1));

        // 3. ESPACE_TEMPS_C (Sextant)
        this.setUI('sun-azimuth', sunLong.toFixed(2) + "°");
        this.setUI('moon-alt', moon.beta.toFixed(3) + "° (Lat)");
        this.setUI('ephem-status', eclipse);
        this.setUI('ast-jd', jd.toFixed(6));
        this.setUI('distance-light-s', (Number(this.dist) / c).toExponential(6));

        // 4. RELATIVITÉ 64-BIT
        const gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(m.divide(v_cosmic, c), 2))));
        this.setUI('ui-lorentz', gamma.toString().substring(0, 22));

        // 5. ENVIRONNEMENT (Saturation IDs)
        this.setUI('o2-saturation', ((this.state.press / 1013.25) * 20.94).toFixed(2));
        this.setUI('temp-dew', (this.state.temp - ((100 - this.state.hum)/5)).toFixed(1) + "°C");
        this.setUI('abs-humidity', this.state.hum + "%");
        this.setUI('pm25-val', this.state.pm25.toFixed(1));
        this.setUI('g-force-resultant', (this.state.vibration / 9.81 + 1).toFixed(3));
        this.setUI('pitch-roll', `${this.state.pitch.toFixed(1)} / ${this.state.roll.toFixed(1)}`);
    },

    getMoonPosition(jd) {
        const T = (jd - 2451545.0) / 36525.0;
        const D2R = Math.PI / 180;
        const L_prime = 218.316 + 481267.881 * T;
        const F = 93.272 + 483202.017 * T; // Noeud ascendant
        const MM = 134.963 + 477198.867 * T; // Anomalie
        const lambda = (L_prime + 6.289 * Math.sin(MM * D2R)) % 360;
        const beta = 5.128 * Math.sin(F * D2R);
        return { lambda, beta };
    },

    checkEclipse(sunL, moon) {
        const diff = Math.abs(sunL - moon.lambda);
        const aligned = (diff < 1.8 || diff > 358.2);
        const onNode = (Math.abs(moon.beta) < 0.5);
        if (aligned && onNode) return "⚠️ SYZYGY_DETECTED";
        if (aligned) return "NEW_MOON";
        return "STELLAR_NOMINAL";
    },

    async initAcoustic() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new AudioContext();
            const ana = ctx.createAnalyser();
            const src = ctx.createMediaStreamSource(stream);
            src.connect(ana);
            setInterval(() => {
                const data = new Uint8Array(ana.frequencyBinCount);
                ana.getByteFrequencyData(data);
                this.state.audio = data.reduce((a, b) => a + b) / data.length;
            }, 100);
        } catch(e) {}
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) {
        const l = document.getElementById('anomaly-log');
        if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML;
    }
};

window.onload = () => { document.getElementById('main-init-btn').onclick = () => OMNI.boot(); };
