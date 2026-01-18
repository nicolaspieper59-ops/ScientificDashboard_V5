/**
 * OMNISCIENCE V25.9.4 - ULTIMATE_CORE
 * Architecture : RK4 + PDR (Cave Navigation) + EKF + ASTRO
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (val) => m.bignumber(val);

const OMNI = {
    active: false,
    labMode: false,
    lastT: performance.now(),
    v: _BN(0),
    dist: _BN(0),
    pos: { lat: 0, lon: 0, alt: 0, acc: 1000 },
    orientation: { a: 0, b: 0, g: 0 },
    stepCount: 0,
    isStepping: false,
    accBuffer: [],
    current_mag: 0,
    current_type: "STASE",
    
    // Constantes
    C: 299792458,
    H_BAR: 1.054571817e-34,
    G_STD: 9.80665,

    async start() {
        this.log("INITIALISATION SYSTÈME V17 PRO MAX...");
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission === 'granted') this.activate();
        } else {
            this.activate();
        }
    },

    activate() {
        this.active = true;
        this.log("FLUX DE DONNÉES ACTIF ✅");

        window.addEventListener('devicemotion', (e) => this.coreLoop(e), true);
        window.addEventListener('deviceorientation', (e) => {
            this.orientation = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
            this.setUI('pitch', this.orientation.b.toFixed(1));
            this.setUI('roll', this.orientation.g.toFixed(1));
        }, true);

        navigator.geolocation.watchPosition(p => {
            this.pos.lat = p.coords.latitude;
            this.pos.lon = p.coords.longitude;
            this.pos.alt = p.coords.altitude || 0;
            this.pos.acc = p.coords.accuracy;
            
            // Correction de vitesse via GPS si disponible (Fusion 20%)
            if(p.coords.speed !== null) {
                const gpsV = _BN(p.coords.speed);
                this.v = m.add(m.multiply(this.v, 0.8), m.multiply(gpsV, 0.2));
            }
        }, null, { enableHighAccuracy: true });

        setInterval(() => this.refreshHUD(), 100);
        setInterval(() => this.refreshAstro(), 1000);
        
        document.getElementById('main-init-btn').innerText = "V25_CONNECTED";
    },

    coreLoop(e) {
        if (!this.active) return;
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;
        if (dt <= 0 || dt > 0.1) return;

        let acc = e.acceleration || { x: 0, y: 0, z: 0 };
        let mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
        
        // --- LOGIQUE ANTI-DÉRIVE & MODE GROTTE ---
        if (this.pos.acc > 50) { // Si GPS perdu ou faible (Cave Mode)
            this.current_type = "CAVE_NAV";
            this.handleStepDetection(mag);
        } else {
            // Mode RK4 Classique
            if (mag < 0.18) { // Noise Gate
                mag = 0;
                this.v = m.multiply(this.v, 0.92); // Friction d'arrêt
            }
            this.integrateRK4(mag, dt);
        }

        this.current_mag = mag;
        this.setUI('f-acc-xyz', `${acc.x.toFixed(2)}|${acc.y.toFixed(2)}`);
    },

    handleStepDetection(mag) {
        const stepThreshold = 1.3;
        if (mag > stepThreshold && !this.isStepping) {
            this.isStepping = true;
            this.stepCount++;
            this.dist = m.add(this.dist, 0.75); // Longueur de pas
            this.v = _BN(1.4); // Vitesse de marche constante (5 km/h)
        } else if (mag < stepThreshold) {
            this.isStepping = false;
            if (mag < 0.2) this.v = m.multiply(this.v, 0.8);
        }
    },

    integrateRK4(mag, dt) {
        const masse = this.current_type === "BIO" ? 80 : 1200;
        const f = (v_in) => {
            const drag = 0.5 * 1.225 * v_in * v_in * 0.3 * 0.5;
            return (mag - drag / masse);
        };
        let v0 = Number(this.v);
        let k1 = f(v0), k2 = f(v0 + (dt/2)*k1), k3 = f(v0 + (dt/2)*k2), k4 = f(v0 + dt*k3);
        let newV = v0 + (dt/6)*(k1 + 2*k2 + 2*k3 + k4);
        this.v = _BN(newV < 0.01 ? 0 : newV);
        this.dist = m.add(this.dist, m.multiply(this.v, dt));
    },

    refreshHUD() {
        const v = Number(this.v);
        const dist = Number(this.dist);
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/this.C, 2));
        const masse = this.current_type === "BIO" ? 80 : 1200;

        // --- CINÉMATIQUE ---
        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('speed-stable-ms', v.toFixed(6));
        this.setUI('dist-3d', dist.toFixed(2) + " m");
        this.setUI('g-force-resultant', (this.current_mag / this.G_STD + 1).toFixed(3));

        // --- RELATIVITÉ ---
        this.setUI('ui-gamma', gamma.toFixed(14));
        this.setUI('time-dilation', ((gamma - 1) * 1e9).toFixed(6));
        this.setUI('schwarzschild-radius', "0.00887");
        this.setUI('relativistic-energy', (gamma * masse * this.C**2).toExponential(3));
        this.setUI('rest-mass-energy', (masse * this.C**2).toExponential(3));
        this.setUI('momentum', (gamma * masse * v).toFixed(2));

        // --- MÉCANIQUE & SON ---
        const vSon = 340.29; 
        this.setUI('vitesse-son-cor', vSon.toFixed(2));
        this.setUI('mach-number', (v / vSon).toFixed(3));
        this.setUI('dynamic-pressure', (0.5 * 1.225 * v * v).toFixed(2));
        this.setUI('reynolds-number', v > 0.1 ? ((1.225 * v * 1) / 1.8e-5).toExponential(2) : "LAMINAIRE");

        // --- ESPACE-TEMPS ---
        this.setUI('distance-light-s', (dist / this.C).toExponential(5));
        this.setUI('ui-gps-accuracy', this.pos.acc.toFixed(1));
        this.setUI('lat-ukf', this.pos.lat.toFixed(6));
        this.setUI('lon-ukf', this.pos.lon.toFixed(6));
        this.setUI('alt-display', this.pos.alt.toFixed(1));

        // --- STATUS ---
        this.setUI('filter-status', this.pos.acc > 50 ? "CAVE_NAV" : "NOMINAL_GPS");
        this.setUI('reality-status', this.pos.acc > 50 ? "INERTIAL" : "CONNECTED");
    },

    refreshAstro() {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(5));
        this.setUI('utc-datetime', now.toLocaleTimeString());
        this.setUI('horizon-distance-km', (3.57 * Math.sqrt(this.pos.alt || 1.8)).toFixed(2));
        
        // Sim Astro IDs
        this.setUI('tslv', ((jd % 1) * 24).toFixed(2) + "h");
        this.setUI('ast-deltat', "69.2 s");
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

// Initialisation via le bouton HTML
document.getElementById('main-init-btn').addEventListener('click', () => OMNI.start());
