/**
 * OMNISCIENCE V48.0 - NEBULA_DEEP_CORE
 * 64-bit BigNumber | Baro-Inertial Fusion | Hydrostatic Depth | Astro-Zenith
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n || 0);

const OMNI = {
    active: false,
    v: _BN(0), dist: _BN(0), 
    p0: _BN(1013.25), // Référence surface
    lastT: performance.now(),
    
    state: {
        lat: 45.419202, lon: 25.532809, alt: 0, acc: 0,
        temp: 15, press: 1013.25, hum: 50, rho: _BN(1.225),
        depth: _BN(0), v_z: _BN(0), last_p: 1013.25,
        pitch: 0, roll: 0, vibration: 0,
        battery: 100, v_var: _BN(1.0)
    },

    async boot() {
        if (this.active) return;
        this.log("INITIALISATION V48.0 : DEEP_CORE_START");
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') throw new Error("Permission IMU Refusée");
            }
            this.active = true;
            this.initHardware();
            this.syncEnvironment();
            setInterval(() => this.masterLoop(), 100);
            
            const btn = document.getElementById('main-init-btn');
            if(btn) { btn.innerText = "SYSTEM_RUNNING"; btn.style.color = "#00ff88"; }
            this.log("SYSTÈME OMNISCIENT OPÉRATIONNEL");
        } catch (e) { this.log("ERREUR CRITIQUE : " + e.message); }
    },

    initHardware() {
        // GPS Haute Précision
        navigator.geolocation.watchPosition(p => {
            this.state.lat = p.coords.latitude;
            this.state.lon = p.coords.longitude;
            this.state.alt = p.coords.altitude || 0;
            this.state.acc = p.coords.accuracy;
        }, null, { enableHighAccuracy: true });

        // Baromètre (Profondeur & Vitesse Verticale)
        if ('PressureSensor' in window) {
            const sensor = new PressureSensor({ frequency: 20 });
            sensor.addEventListener('reading', () => {
                const p = _BN(sensor.pressure);
                const dt = 0.05; 
                const dp = m.subtract(p, this.state.last_p);
                
                // Vz = -(RT / gP) * (dP/dt)
                this.state.v_z = m.divide(m.multiply(-287.05, (this.state.temp + 273.15), dp), m.multiply(9.81, p, dt));
                // Profondeur relative (Modèle Hydrostatique)
                this.state.depth = m.multiply(29.27, (this.state.temp + 273.15), m.log(m.divide(p, this.p0)));
                
                this.state.last_p = p;
                this.state.press = Number(p);
            });
            sensor.start();
        }

        // Moteur de Vitesse Cinématique 64-bit (Fusion & Réalisme)
        window.addEventListener('devicemotion', (e) => {
            if (!this.active) return;
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;
            if (Number(dt) <= 0 || Number(dt) > 0.15) return;

            const a = e.acceleration || { x: 0, y: 0, z: 0 };
            const mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
            this.state.vibration = mag * 10;

            const gain = Number(this.state.v_var) / (Number(this.state.v_var) + 0.15);
            
            if (mag > 0.22) {
                // Accélération avec traînée aérodynamique réelle (ΣF = ma)
                const vNum = Number(this.v);
                const air_drag = 0.5 * Number(this.state.rho) * Math.pow(vNum, 2) * 0.45 * 0.55;
                const a_eff = Math.max(0, mag - (air_drag / 80)); // Basé sur 80kg ref
                
                this.v = m.add(this.v, m.multiply(a_eff * gain, dt));
                this.state.v_var = m.multiply(this.state.v_var, 0.98);
            } else {
                // Ralentissement par viscosité naturelle (Loi de Stokes)
                const viscosity = m.multiply(this.v, 0.002); 
                this.v = m.subtract(this.v, viscosity);
                this.state.v_var = m.add(this.state.v_var, 0.02);
                if (Number(this.v) < 0.001) this.v = _BN(0);
            }
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        });

        window.addEventListener('deviceorientation', e => {
            this.state.pitch = e.beta || 0;
            this.state.roll = e.gamma || 0;
        });
    },

    // --- MOTEUR ÉPHÉMÉRIDES ---
    getAstro() {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        const d = jd - 2451545.0;
        
        // Temps Sidéral Local
        let gmst = (18.697374558 + 24.06570982441908 * d) % 24;
        let tslv = (gmst + this.state.lon / 15) % 24;
        if (tslv < 0) tslv += 24;

        // Phase Lunaire Unicode
        const lune_age = (jd - 2451550.1) % 29.530588;
        const p_idx = Math.floor((lune_age / 29.530588) * 8);
        const moon_icons = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
        const moon_labels = ["Nouvelle", "Premier Croissant", "Premier Quartier", "Gibbeuse", "Pleine", "Disséminatrice", "Dernier Quartier", "Dernier Croissant"];

        // Temps Solaire Vrai (Équation du Temps)
        const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const b = (360 / 365) * (doy - 81) * (Math.PI / 180);
        const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
        const solar_time = new Date(now.getTime() + (this.state.lon * 4 + eot) * 60000);

        return { jd, tslv, moon: moon_icons[p_idx] + " " + moon_labels[p_idx], solar: solar_time.toLocaleTimeString() };
    },

    masterLoop() {
        const v = Number(this.v);
        const dist = Number(this.dist);
        const vz = Number(this.state.v_z);
        const astro = this.getAstro();
        const c = 299792458;

        // --- NAVIGATION & PROFONDEUR ---
        this.setUI('v-cosmic', v.toFixed(8));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('alt-baro', Number(this.state.depth).toFixed(2) + " m");
        this.setUI('vitesse-raw', vz.toFixed(4)); // Vitesse verticale réelle

        // --- RELATIVITÉ ---
        const gamma = 1 / Math.sqrt(1 - (v / c)**2 || 1);
        this.setUI('ui-lorentz', gamma.toFixed(18));
        this.setUI('ast-deltat', (vz * 0.000000003).toFixed(9) + " ns"); // Drift relativiste vertical

        // --- MÉCANIQUE DES FLUIDES ---
        this.setUI('pression-dyn', (0.5 * Number(this.state.rho) * v**2).toFixed(4));
        const re = v > 0 ? (Number(this.state.rho) * v * 0.1) / 1.81e-5 : 0;
        this.setUI('reynolds-number', re.toExponential(3));

        // --- ASTRO_ZENITH ---
        this.setUI('ast-jd', astro.jd.toFixed(6));
        this.setUI('phase-lunaire', astro.moon);
        this.setUI('sidereal-tslv', Math.floor(astro.tslv) + "h " + Math.floor((astro.tslv % 1) * 60) + "m");
        this.setUI('temps-solaire', astro.solar);

        // --- BIO_SVT ---
        const ppO2 = (this.state.press / 1013.25) * 20.94;
        this.setUI('o2-sat', ppO2.toFixed(2) + "% (pp)");
        this.setUI('adrenaline-level', (10 + (v + Math.abs(vz)) * 4).toFixed(1));

        // --- POSITION & CONFIANCE ---
        this.setUI('ui-confidence', (1 / (1 + Number(this.state.v_var)) * 100).toFixed(1) + "%");
        this.setUI('gps-accuracy', this.state.acc.toFixed(1) + "m");
        this.setUI('horizon-distance-km', (3.57 * Math.sqrt(this.state.alt + 2)).toFixed(2));
    },

    async syncEnvironment() {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.state.lat}&longitude=${this.state.lon}&current=temperature_2m,relative_humidity_2m,surface_pressure`);
            const d = await res.json();
            this.state.temp = d.current.temperature_2m;
            this.state.hum = d.current.relative_humidity_2m;
            this.state.press = d.current.surface_pressure;
            this.p0 = _BN(d.current.surface_pressure); // Calibrage surface
            this.state.rho = _BN((this.state.press * 100) / (287.058 * (this.state.temp + 273.15)));
        } catch(e) { this.state.rho = _BN(1.225); }
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) {
        const l = document.getElementById('anomaly-log');
        if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML;
    }
};

window.onload = () => { document.getElementById('main-init-btn').onclick = () => OMNI.boot(); };
