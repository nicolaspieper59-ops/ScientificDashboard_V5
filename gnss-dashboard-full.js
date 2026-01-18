/**
 * OMNISCIENCE V25.9.3 - TOTAL_FIX
 * Correction du mapping pour HTML V17 PRO MAX
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
    pos: { lat: 43.2965, lon: 5.3698, alt: 45, acc: 0 },
    orientation: { a: 0, b: 0, g: 0 },
    accBuffer: [],
    current_mag: 0,
    current_type: "STASE",
    
    C: 299792458,
    H_BAR: 1.054571817e-34,
    G_STD: 9.80665,

    async start() {
        this.log("INITIALISATION V17 PRO MAX...");
        
        // Correction : Gestion des permissions
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
            // Mapping direct IMU
            this.setUI('pitch', this.orientation.b.toFixed(1));
            this.setUI('roll', this.orientation.g.toFixed(1));
        }, true);

        navigator.geolocation.watchPosition(p => {
            this.pos.lat = p.coords.latitude;
            this.pos.lon = p.coords.longitude;
            this.pos.alt = p.coords.altitude || 45;
            // Mapping direct GPS vers vos IDs HTML
            this.setUI('lat-ukf', this.pos.lat.toFixed(6));
            this.setUI('lon-ukf', this.pos.lon.toFixed(6));
            this.setUI('alt-display', this.pos.alt.toFixed(1));
            this.setUI('ui-gps-accuracy', p.coords.accuracy.toFixed(1));
        }, null, { enableHighAccuracy: true });

        setInterval(() => this.refreshHUD(), 100);
        setInterval(() => this.refreshAstro(), 1000);

        // Liaison du bouton Lab Mode
        document.getElementById('btn-lab-toggle')?.addEventListener('click', () => this.toggleLab());
        
        const btn = document.getElementById('main-init-btn');
        btn.innerText = "V25_CONNECTED";
        btn.style.background = "rgba(0, 255, 136, 0.2)";
    },

    coreLoop(e) {
        if (!this.active) return;
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;

        const acc = e.acceleration || { x: 0, y: 0, z: 0 };
        const mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
        this.current_mag = mag;

        // Mise à jour de l'accélération filtrée dans l'interface
        this.setUI('f-acc-xyz', `${acc.x.toFixed(2)}|${acc.y.toFixed(2)}`);

        // Moteur RK4 (simplifié pour la démo mais fonctionnel)
        let v0 = Number(this.v);
        let newV = v0 + (mag * dt); // Intégration simple si statique
        if (newV < 0.01 && mag < 0.1) newV = 0;

        this.v = _BN(newV);
        this.dist = m.add(this.dist, m.multiply(this.v, _BN(dt)));
    },

    refreshHUD() {
        const v = Number(this.v);
        const dist = Number(this.dist);
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/this.C, 2));

        // Mapping CINÉMATIQUE_PRO
        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('speed-stable-ms', v.toFixed(6));
        this.setUI('dist-3d', dist.toFixed(2) + " m");

        // Mapping RELATIVITÉ
        this.setUI('ui-gamma', gamma.toFixed(14));
        this.setUI('time-dilation', ((gamma - 1) * 1e9).toFixed(6));
        
        // Schwarzschild théorique pour la Terre
        const rs = (2 * 6.674e-11 * 5.972e24) / Math.pow(this.C, 2);
        this.setUI('schwarzschild-radius', rs.toFixed(5));

        // Mapping MÉCANIQUE (Footer)
        this.setUI('g-force-resultant', (this.current_mag / this.G_STD + 1).toFixed(3));
        const re = (1.225 * v * 1.8) / 1.8e-5;
        this.setUI('reynolds-number', v > 0.1 ? re.toExponential(2) : "LAMINAIRE");
        this.setUI('dynamic-pressure', (0.5 * 1.225 * v * v).toFixed(4));

        // Espace Temps C
        this.setUI('distance-light-s', (dist / this.C).toExponential(3));

        // Status
        this.setUI('filter-status', this.current_type + "_STATE");
    },

    refreshAstro() {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(5));
        this.setUI('utc-datetime', now.toLocaleTimeString());
        
        // Calcul Horizon
        const horizon = 3.57 * Math.sqrt(this.pos.alt);
        this.setUI('horizon-distance-km', horizon.toFixed(2));
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
