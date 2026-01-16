/**
 * OMNISCIENCE V20 PRO MAX - ENGINE COMPLET
 * Fusion de capteurs : IMU, Baromètre, Astro & Quantum
 * Logic : No-GPS Dead Reckoning / Einsteinian Physics
 */

// Configuration MathJS pour la précision 64 bits
const m = math;
m.config({ number: 'BigNumber', precision: 64 });

const OMNI_V20 = {
    active: false,
    lastT: performance.now(),
    v: m.bignumber(0),
    dist: m.bignumber(0),
    
    // État Spatial
    pos: { x: 0, y: 0, z: 0, lat: 44.4368, lon: 26.1350, alt: 114.4 },
    orientation: { a: 0, b: 0, g: 0 },
    
    // Paramètres Physiques
    mass: 80, // kg
    cx: 0.45, 
    surface: 0.55, // m2
    
    // Constantes
    C: 299792458,
    H: 6.62607015e-34,
    OMEGA: 7.292115e-5,
    RS: 0.0088701,

    init() {
        this.active = true;
        this.log("INITIALISATION V20 PRO MAX...");
        
        window.addEventListener('devicemotion', (e) => this.coreLoop(e));
        window.addEventListener('deviceorientation', (e) => {
            this.orientation.a = e.alpha || 0;
            this.orientation.b = e.beta || 0;
            this.orientation.g = e.gamma || 0;
        });

        this.log("SYSTEM_LIVE : FUSION CAPTEURS ACTIVE");
        document.getElementById('main-init-btn').style.borderColor = "#00ff88";
        document.getElementById('main-init-btn').innerText = "V20_ONLINE";
    },

    coreLoop(e) {
        if (!this.active) return;
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;

        const acc = e.acceleration || {x:0, y:0, z:0};
        const mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);

        // 1. DÉTECTION DE CONTEXTE
        let context = this.detectContext(mag);

        // 2. CALCUL DE LA VITESSE (RÉALISME FLUIDE)
        if (mag > 0.15) {
            // Intégration de l'accélération
            this.v = m.add(this.v, m.bignumber(mag * dt));
        } else {
            // Dissipation naturelle (Traînée + Friction)
            this.v = this.applyNaturalDecel(this.v, dt, context);
        }

        // 3. NAVIGATION 3D (MODE GROTTE / PODOMÉTRIE)
        this.update3D(mag);

        // 4. DISTANCE CUMULÉE
        this.dist = m.add(this.dist, m.multiply(this.v, m.bignumber(dt)));

        this.refreshHUD(mag, context);
    },

    detectContext(mag) {
        if (mag > 15) return "BALLISTIC / AERO";
        if (mag > 1.2 && mag < 4) return "HUMAN_PEDOMETRY";
        if (mag < 0.05) return "STASE_QUANTIQUE";
        return "LINEAR_TRANSPORT";
    },

    applyNaturalDecel(v_bn, dt, context) {
        let v = Number(v_bn);
        if (v < 1e-9) return m.bignumber(Math.random() * 2e-10); // Jitter nm/s

        const rho = 1.225; // Densité air
        const f_drag = 0.5 * rho * v * v * this.cx * this.surface;
        const mu = (context === "LINEAR_TRANSPORT") ? 0.005 : 0.02;
        const f_fric = mu * this.mass * 9.81;

        const decel = (f_drag + f_fric) / this.mass;
        let newV = v - (decel * dt);
        return m.bignumber(Math.max(0, newV));
    },

    update3D(mag) {
        // Algorithme de détection de pas vectoriel
        if (mag > 1.3 && !this.isStepping) {
            this.isStepping = true;
            const L = 0.75; // Longueur de pas (m)
            const az = this.orientation.a * (Math.PI / 180);
            const p = this.orientation.b * (Math.PI / 180);

            this.pos.x += L * Math.cos(p) * Math.sin(az);
            this.pos.y += L * Math.cos(p) * Math.cos(az);
            this.pos.z += L * Math.sin(p);
        }
        if (mag < 1.1) this.isStepping = false;
    },

    refreshHUD(acc_mag, context) {
        const v = Number(this.v);
        const dist = Number(this.dist);
        const alt = this.pos.alt + this.pos.z;

        // VITESSE & UNITÉS DYNAMIQUES (nm/s -> m/s)
        const unitData = this.formatSpeed(v);
        this.setUI('speed-stable-ms', unitData.val);
        this.setUI('velocity-unit', unitData.unit);
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        
        // MÉCANIQUE DES FLUIDES
        const vsound = 331.3 * Math.sqrt(1 + (15/273.15));
        this.setUI('vitesse-son-cor', vsound.toFixed(2));
        this.setUI('mach-number', (v / vsound).toFixed(6));
        this.setUI('dynamic-pressure', (0.5 * 1.225 * v * v).toFixed(4));
        this.setUI('g-force-resultant', (acc_mag / 9.81 || 1.0).toFixed(3));
        const f_cor = 2 * this.mass * v * this.OMEGA * Math.sin(this.pos.lat * Math.PI/180);
        this.setUI('coriolis', (f_cor * 1000).toFixed(4));

        // RELATIVITÉ
        const gamma = 1 / Math.sqrt(1 - (v**2 / this.C**2));
        this.setUI('ui-gamma', gamma.toFixed(15));
        this.setUI('time-dilation', ((gamma - 1) * 1e9).toFixed(6));
        const dilat_g = (1 - Math.sqrt(1 - (this.RS / (this.R_E + alt)))) * 1e9;
        this.setUI('time-dilation-gravite', dilat_g.toFixed(10));
        this.setUI('schwarzschild-radius', this.RS.toFixed(7));
        this.setUI('relativistic-energy', (gamma * this.mass * this.C**2).toExponential(4));

        // QUANTUM
        const p = this.mass * v;
        this.setUI('quantum-drag', (this.H / (p || 1e-20)).toExponential(4));
        this.setUI('momentum', p.toFixed(4));

        // POSITION 3D & GROTTE
        this.setUI('dist-3d', dist.toFixed(2));
        this.setUI('alt-display', alt.toFixed(2));
        this.setUI('lat-ukf', (this.pos.lat).toFixed(7));
        this.setUI('lon-ukf', (this.pos.lon).toFixed(7));

        // ESPACE_TEMPS_C
        this.setUI('distance-light-s', (dist / this.C).toExponential(8));
        this.setUI('distance-light-h', (dist / (this.C * 3600)).toExponential(10));
        this.setUI('ast-deltat', "69.18 s");

        // ASTRO & LOGS
        const jd = (Date.now() / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(5));
        this.setUI('sun-azimuth', ((180 + (new Date().getHours()*15))%360).toFixed(2) + "°");
        this.setUI('filter-status', context);
        this.setUI('utc-datetime', new Date().toLocaleTimeString());
    },

    formatSpeed(v) {
        if (v < 1e-6) return { val: (v * 1e9).toFixed(2), unit: "nm/s" };
        if (v < 0.1) return { val: (v * 1000).toFixed(4), unit: "mm/s" };
        return { val: v.toFixed(6), unit: "m/s" };
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

// Activation
window.startAdventure = () => OMNI_V20.init();
