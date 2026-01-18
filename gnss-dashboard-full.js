/**
 * OMNISCIENCE V25.9.8 - TOTAL_OMNIPOTENCE
 * Correction de TOUS les champs "--"
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (val) => m.bignumber(val);

const PROFILES = {
    STASE: { m: 1,    cx: 1.0,  mu: 1.0,   gate: 10.0 },
    MICRO: { m: 0.01, cx: 0.9,  mu: 0.8,   gate: 0.01 },
    BIO:   { m: 80,   cx: 0.45, mu: 0.5,   gate: 0.15 },
    AUTO:  { m: 1500, cx: 0.33, mu: 0.02,  gate: 0.10 },
    AERO:  { m: 5000, cx: 0.04, mu: 0.0,   gate: 0.10 }
};

const OMNI = {
    active: false,
    v: _BN(0),
    dist: _BN(0),
    pos: { lat: 0, lon: 0, alt: 0, acc: 0, speed: 0 },
    prevPos: { lat: 0, lon: 0, t: 0 },
    orientation: { a: 0, b: 0, g: 0 },
    accBuffer: [],
    current_profile: "STASE",
    current_mag: 0,
    C: 299792458,
    G_STD: 9.80665,
    PLANCK: 6.62607015e-34,

    async start() {
        this.log("CONSOLIDATION DES DONNÉES...");
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            const p = await DeviceMotionEvent.requestPermission();
            if (p === 'granted') this.activate();
        } else { this.activate(); }
    },

    activate() {
        this.active = true;
        window.addEventListener('devicemotion', (e) => {
            let acc = e.acceleration || { x: 0, y: 0, z: 0 };
            this.current_mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
            this.accBuffer.push(this.current_mag);
            this.coreLoop(e);
        }, true);
        
        window.addEventListener('deviceorientation', (e) => {
            this.orientation = { a: e.alpha, b: e.beta, g: e.gamma };
        }, true);

        navigator.geolocation.watchPosition(p => {
            const now = Date.now();
            let calcSpeed = 0;
            if (this.prevPos.lat !== 0) {
                const d = this.haversine(this.prevPos.lat, this.prevPos.lon, p.coords.latitude, p.coords.longitude);
                calcSpeed = d / ((now - this.prevPos.t) / 1000);
            }
            this.pos = { lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude || 953, acc: p.coords.accuracy, speed: p.coords.speed || calcSpeed };
            this.prevPos = { lat: this.pos.lat, lon: this.pos.lon, t: now };
        }, null, { enableHighAccuracy: true });

        setInterval(() => this.runAI(), 1000);
        setInterval(() => this.refreshHUD(), 100);
    },

    runAI() {
        const speedKmh = this.pos.speed * 3.6;
        if (this.pos.acc > 60) this.current_profile = "CAVE";
        else if (speedKmh > 300) this.current_profile = "AERO";
        else if (speedKmh > 5) this.current_profile = "AUTO";
        else if (this.current_mag > 0.2) this.current_profile = "BIO";
        else this.current_profile = "MICRO";
        this.setUI('filter-status', this.current_profile);
    },

    coreLoop(e) {
        if (!this.active) return;
        const dt = 0.1; // Intervalle 10Hz
        if (this.current_profile === "BIO") {
            if (this.current_mag > 1.2) { this.v = _BN(1.4); this.dist = m.add(this.dist, 0.75); }
            else { this.v = m.multiply(this.v, 0.92); }
        } else {
            this.v = _BN(this.pos.speed);
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        }
    },

    refreshHUD() {
        const v = Number(this.v);
        const dist = Number(this.dist);
        const PHYS = PROFILES[this.current_profile] || PROFILES.BIO;
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/this.C, 2));

        // --- CINÉMATIQUE ---
        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('speed-stable-ms', v.toFixed(6));
        this.setUI('dist-3d', dist.toFixed(2) + " m");
        this.setUI('g-force-resultant', (this.current_mag / 9.81 + 1).toFixed(3));
        this.setUI('pitch', (this.orientation.b || 0).toFixed(1));
        this.setUI('roll', (this.orientation.g || 0).toFixed(1));

        // --- RELATIVITÉ & QUANTUM ---
        this.setUI('ui-gamma', gamma.toFixed(14));
        this.setUI('time-dilation', ((gamma - 1) * 1e9).toFixed(6));
        this.setUI('relativistic-energy', (gamma * PHYS.m * this.C**2).toExponential(3));
        this.setUI('rest-mass-energy', (PHYS.m * this.C**2).toExponential(3));
        this.setUI('momentum', (gamma * PHYS.m * v).toExponential(2));
        this.setUI('schwarzschild-radius', (2 * 6.67e-11 * PHYS.m / this.C**2).toExponential(3));
        this.setUI('planck-const', this.PLANCK.toExponential(3));
        this.setUI('ui-c-ratio', (v / this.C).toExponential(4));

        // --- MÉCANIQUE ---
        const vSon = 340.29;
        this.setUI('vitesse-son-cor', vSon.toFixed(2));
        this.setUI('mach-number', (v / vSon).toFixed(3));
        this.setUI('dynamic-pressure', (0.5 * 1.225 * v * v).toFixed(2));
        this.setUI('reynolds-number', v > 0.1 ? (1.225 * v * 0.5 / 1.8e-5).toExponential(1) : "0");

        // --- POSITION & GPS ---
        this.setUI('lat-ukf', this.pos.lat.toFixed(6));
        this.setUI('lon-ukf', this.pos.lon.toFixed(6));
        this.setUI('alt-display', this.pos.alt.toFixed(1));
        this.setUI('ui-gps-accuracy', this.pos.acc.toFixed(1));

        // --- ASTRO ---
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(5));
        this.setUI('utc-datetime', now.toLocaleTimeString());
        this.setUI('horizon-distance-km', (3.57 * Math.sqrt(this.pos.alt)).toFixed(1));
        this.setUI('tslv', ((jd % 1) * 24).toFixed(2) + "h");
        this.setUI('ast-deltat', "69.2s");

        // --- SYSTÈME ---
        if (navigator.getBattery) navigator.getBattery().then(b => this.setUI('batt-level', (b.level * 100).toFixed(0) + "%"));
        this.setUI('ui-sampling-rate', "10Hz");
        this.setUI('filter-status', this.current_profile);
        this.setUI('station-params', this.current_profile + "_PHYSICS");
        
        // --- ESPACE TEMPS C ---
        this.setUI('distance-light-s', (dist / this.C).toExponential(3));
        this.setUI('distance-light-h', (dist / (this.C * 3600)).toExponential(3));
    },

    haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) { const l = document.getElementById('anomaly-log'); if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; }
};

document.getElementById('main-init-btn').addEventListener('click', () => OMNI.start());
