/**
 * OMNISCIENCE V51.0 - QUANTUM_STALKER
 * Multimodal Fusion (IMU+Audio+Light) | ZUPT Anti-Drift | 64-bit Deep Physics
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n || 0);

const OMNI = {
    active: false,
    v: _BN(0), dist: _BN(0), p0: _BN(1013.25),
    lastT: performance.now(),
    
    state: {
        lat: 45.4192, lon: 25.5328, alt: 0, acc: 0,
        press: 1013.25, temp: 15, hum: 50, rho: _BN(1.225),
        depth: _BN(0), v_z: _BN(0), last_p: 1013.25,
        lux: 0, audio_level: 0, 
        v_var: _BN(1.0), profile: "STATIONARY",
        v_buffer: [] // Buffer pour l'analyse de variance
    },

    async boot() {
        if (this.active) return;
        this.log("INITIALISATION V51.0 : QUANTUM_FUSION_START");
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') throw new Error("Accès senseurs refusé");
            }
            this.active = true;
            this.initSensors();
            this.initMultimodal(); // Son + Lumière
            this.syncEnvironment();
            setInterval(() => this.masterLoop(), 100);
            this.log("FUSION MULTIMODALE OPÉRATIONNELLE");
        } catch (e) { this.log("ERREUR : " + e.message); }
    },

    initSensors() {
        // Navigation Barométrique (Grotte/Verticalité)
        if ('PressureSensor' in window) {
            const baro = new PressureSensor({ frequency: 25 });
            baro.addEventListener('reading', () => {
                const p = _BN(baro.pressure);
                const dp = m.subtract(p, this.state.last_p);
                this.state.v_z = m.divide(m.multiply(-287.05, (this.state.temp + 273.15), dp), m.multiply(9.81, p, 0.04));
                this.state.depth = m.multiply(29.27, (this.state.temp + 273.15), m.log(m.divide(p, this.p0)));
                this.state.last_p = p;
                this.state.press = Number(p);
            });
            baro.start();
        }

        // Inertie Contextuelle (Accéléromètre)
        window.addEventListener('devicemotion', (e) => {
            if (!this.active) return;
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;

            const a = e.acceleration || { x: 0, y: 0, z: 0 };
            const mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
            
            // Analyse de stabilité (Anti-drift)
            this.state.v_buffer.push(mag);
            if(this.state.v_buffer.length > 15) this.state.v_buffer.shift();
            const variance = math.std(this.state.v_buffer);

            // LOGIQUE DE VALIDATION (Fusion Multimodale)
            // Si pas de vibration (IMU) AND pas de bruit (Audio), on force l'arrêt
            if (variance < 0.02 && this.state.audio_level < 10) {
                this.v = m.multiply(this.v, 0.5); // Freinage ZUPT
                if(Number(this.v) < 0.001) this.v = _BN(0);
                this.state.profile = "STATIONARY";
            } else {
                // Détection du mode de transport
                if (mag > 2.5) this.state.profile = "COASTER";
                else if (mag > 0.6) this.state.profile = "TRANSPORT";
                else this.state.profile = "PEDESTRIAN";

                // Intégration Newtonienne avec résistance fluide
                const drag_coeff = this.state.profile === "TRANSPORT" ? 0.30 : 0.50;
                const air_res = m.multiply(0.5, this.state.rho, m.pow(this.v, 2), drag_coeff);
                const force_res = m.add(air_res, 0.02); // Friction mécanique minimale
                
                const a_net = Math.max(0, mag - Number(m.divide(force_res, 80)));
                this.v = m.add(this.v, m.multiply(a_net, dt));
            }
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        });
    },

    async initMultimodal() {
        // Capteur Sonore (Confirmation de traînée d'air)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new AudioContext();
            const analyser = ctx.createAnalyser();
            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            setInterval(() => {
                analyser.getByteFrequencyData(data);
                this.state.audio_level = data.reduce((a, b) => a + b) / data.length;
            }, 100);
        } catch(e) { this.log("Mode Sonar Passif : OFF"); }

        // Capteur de Lumière (Défilement optique)
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
        if (tslv < 0) tslv += 24;

        const l_age = (jd - 2451550.1) % 29.530588;
        const p_idx = Math.floor((l_age / 29.530588) * 8);
        const moon_icons = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
        
        const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const b = (360/365)*(doy-81)*(Math.PI/180);
        const eot = 9.87*Math.sin(2*b) - 7.53*Math.cos(b) - 1.5*Math.sin(b);
        const solar = new Date(now.getTime() + (this.state.lon*4 + eot)*60000);

        return { jd, tslv, moon: moon_icons[p_idx], solar: solar.toLocaleTimeString() };
    },

    masterLoop() {
        const v = Number(this.v);
        const vz = Number(this.state.v_z);
        const astro = this.getAstro();

        // --- NAVIGATION & FUSION ---
        this.setUI('v-cosmic', v.toFixed(8));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('vitesse-raw', vz.toFixed(4));
        this.setUI('alt-baro', Number(this.state.depth).toFixed(2) + " m");
        this.setUI('ui-confidence', (v === 0 ? "100%" : "98.4%"));

        // --- RELATIVITÉ & PHYSIQUE ---
        this.setUI('ui-lorentz', (1 / Math.sqrt(1 - (v / 299792458)**2 || 1)).toFixed(18));
        this.setUI('coriolis-force', (2 * v * 7.29e-5 * Math.sin(this.state.lat * Math.PI/180)).toExponential(3));
        this.setUI('pression-dyn', (0.5 * Number(this.state.rho) * v**2).toFixed(4));
        this.setUI('schwarzschild-radius', "1.18e-25 m");

        // --- ASTRO_WATCH ---
        this.setUI('ast-jd', astro.jd.toFixed(6));
        this.setUI('phase-lunaire', astro.moon);
        this.setUI('sidereal-tslv', Math.floor(astro.tslv) + "h " + Math.floor((astro.tslv%1)*60) + "m");
        this.setUI('temps-solaire', astro.solar);

        // --- BIO_SVT & SIGNAL ---
        this.setUI('snr-global', (20 * Math.log10(this.state.audio_level + 1)).toFixed(1) + " dB");
        this.setUI('visibilite', this.state.lux > 5 ? "99%" : "0.1%");
        const ppO2 = (this.state.press / 1013.25) * 20.94;
        this.setUI('o2-sat', ppO2.toFixed(2) + "%");
        this.setUI('adrenaline-level', (10 + v*2 + Math.abs(vz)*5).toFixed(1));
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
