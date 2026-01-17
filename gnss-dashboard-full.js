/**
 * OMNISCIENCE V25.9.1 - CORE ENGINE STABLE
 * Système de Navigation Inertielle / Relativiste / Quantique
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (val) => m.bignumber(val);

const OMNI = {
    active: false,
    lastT: performance.now(),
    v: _BN(0),
    dist: _BN(0),
    pos: { lat: 44.4368, lon: 26.1350, alt: 114.4 },
    orientation: { a: 0, b: 0, g: 0 },
    accBuffer: [],
    current_mag: 0,
    current_type: "STASE",
    
    // Constantes
    C: 299792458,
    H_BAR: 1.054571817e-34,
    G_STD: 9.80665,

    // 1. DÉMARRAGE ET PERMISSIONS
    async start() {
        this.log("INTERROGATION DES CAPTEURS...");

        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                this.log("PERMISSION : " + permission);
                if (permission === 'granted') {
                    this.activate();
                } else {
                    this.log("ERREUR : ACCÈS REFUSÉ");
                }
            } catch (e) {
                this.log("ERREUR CRITIQUE : " + e.message);
            }
        } else {
            this.log("ACCÈS DIRECT (SÉCURISÉ)...");
            this.activate();
        }
    },

    // 2. ACTIVATION DES ÉCOUTEURS
    activate() {
        this.active = true;
        this.log("FLUX DE DONNÉES ACTIF ✅");

        // Accéléromètre
        window.addEventListener('devicemotion', (e) => {
            if (!this.lastSample) this.lastSample = performance.now();
            const now = performance.now();
            this.setUI('ui-sampling-rate', Math.round(1000 / (now - this.lastSample)));
            this.lastSample = now;
            this.coreLoop(e);
        }, true);

        // Gyroscope
        window.addEventListener('deviceorientation', (e) => {
            this.orientation = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
            this.updateIMU();
        }, true);

        // Géolocalisation
        navigator.geolocation.watchPosition(p => {
            this.pos.lat = p.coords.latitude;
            this.pos.lon = p.coords.longitude;
            this.pos.alt = p.coords.altitude || 45;
            this.setUI('ui-gps-accuracy', p.coords.accuracy.toFixed(1));
        }, null, { enableHighAccuracy: true });

        // HUD Refresh @ 10Hz
        setInterval(() => this.refreshHUD(), 100);

        const btn = document.getElementById('main-init-btn');
        btn.innerText = "V25_CONNECTED";
        btn.style.background = "rgba(0, 255, 136, 0.2)";
    },

    // 3. MOTEUR PHYSIQUE RK4
    coreLoop(e) {
        if (!this.active) return;
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;
        if (dt <= 0 || dt > 0.2) return;

        const acc = e.acceleration || { x: 0, y: 0, z: 0 };
        const mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
        this.current_mag = mag;

        // Détection BIO/MACH
        this.accBuffer.push(mag);
        if(this.accBuffer.length > 50) this.accBuffer.shift();
        const variance = math.var(this.accBuffer || [0]);
        this.current_type = variance > 1.5 ? "BIO" : "MACH";
        
        const OBJ = this.current_type === "BIO" ? {m: 80, mu: 0.5, cx: 0.45} : {m: 1200, mu: 0.02, cx: 0.30};
        const rho = 1.225 * Math.exp(-this.pos.alt / 8500);
        const pitchRad = this.orientation.b * (Math.PI / 180);

        // Équation différentielle (RK4)
        const f = (v_in) => {
            const drag = 0.5 * rho * v_in * v_in * OBJ.cx * 0.55;
            const friction = v_in > 0.01 ? OBJ.mu * OBJ.m * this.G_STD * Math.cos(pitchRad) : 0;
            const slope = OBJ.m * this.G_STD * Math.sin(pitchRad);
            return ( (mag * OBJ.m) + slope - drag - friction ) / OBJ.m;
        };

        let v0 = Number(this.v);
        let k1 = f(v0);
        let k2 = f(v0 + (dt/2)*k1);
        let k3 = f(v0 + (dt/2)*k2);
        let k4 = f(v0 + dt*k3);
        
        let newV = v0 + (dt/6)*(k1 + 2*k2 + 2*k3 + k4);
        if (newV < 1e-8) newV = 0;

        this.v = _BN(newV);
        this.dist = m.add(this.dist, m.multiply(this.v, _BN(dt)));
    },

    // 4. RENDU INTERFACE
    refreshHUD() {
        const v = Number(this.v);
        const dist = Number(this.dist);
        
        // Cinématique
        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        this.setUI('speed-stable-ms', v.toFixed(6));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('dist-3d', dist.toFixed(2));

        // Fluides & Forces
        const re = (1.225 * v * 1.8) / 1.8e-5;
        this.setUI('reynolds-number', v > 0.05 ? re.toExponential(2) : "LAMINAIRE");
        this.setUI('dynamic-pressure', (0.5 * 1.225 * v * v).toFixed(4));
        this.setUI('g-force-resultant', (this.current_mag / this.G_STD + 1).toFixed(3));

        // Relativité & Quantum
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/this.C, 2));
        this.setUI('ui-gamma', gamma.toFixed(14));
        this.setUI('time-dilation', ((gamma - 1) * 1e9).toFixed(6));
        this.setUI('quantum-drag', (this.H_BAR / (80 * v + 1e-25)).toExponential(3));

        // Astro
        const jd = (Date.now() / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(5));
        this.setUI('sun-azimuth', ((180 + (new Date().getHours()*15)) % 360).toFixed(1) + "°");

        // Status
        this.setUI('filter-status', this.current_type + "_STATE");
    },

    updateIMU() {
        this.setUI('pitch-roll', `${this.orientation.b.toFixed(1)} / ${this.orientation.g.toFixed(1)}`);
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

// Initialisation au clic
document.getElementById('main-init-btn').addEventListener('click', () => OMNI.start());
