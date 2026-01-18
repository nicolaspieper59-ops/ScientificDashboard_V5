/**
 * OMNISCIENCE V27.3.0 - PURE_METRICS
 * Zéro Simulation • Zéro NaN • Affichage "--" pour Données Non-Initialisées
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n);

const CORE = {
    v: null, // Null = Pas de donnée (Affichera --)
    dist: _BN(0),
    lastT: performance.now(),
    
    // Paramètres Physiques Réels
    env: {
        rho: null, temp: 15, press: 1013.25, 
        mass: 80, area: 0.55, cx: 0.45
    },

    init() {
        this.log("DÉPLOIEMENT DU NOYAU V27.3.0...");
        this.syncEnvironment();
        this.startInertialEngine();
        setInterval(() => this.updateDashboard(), 100);
    },

    // Fonction de formatage "Dignité Scientifique"
    format(val, type = 'fixed', precision = 2) {
        if (val === null || val === undefined || isNaN(Number(val))) return "--";
        const num = Number(val);
        if (type === 'exp') return num.toExponential(precision);
        return num.toFixed(precision);
    },

    async syncEnvironment() {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=45.4&longitude=25.5&current=temperature_2m,surface_pressure`);
            const d = await res.json();
            this.env.temp = d.current.temperature_2m;
            this.env.press = d.current.surface_pressure;
            // Calcul de la densité de l'air locale
            this.env.rho = _BN((this.env.press * 100) / (287.058 * (this.env.temp + 273.15)));
            this.log("FLUIDE ATMOSPHÉRIQUE : NOMINAL");
        } catch(e) { this.log("API_OFFLINE : UTILISATION AIR STANDARD"); this.env.rho = _BN(1.225); }
    },

    startInertialEngine() {
        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = (now - this.lastT) / 1000;
            this.lastT = now;
            if (dt <= 0 || dt > 0.1) return;

            const a_raw = e.acceleration || { x: 0, y: 0, z: 0 };
            const mag = Math.sqrt(a_raw.x**2 + a_raw.y**2 + a_raw.z**2);
            
            // Initialisation de la vitesse au premier mouvement
            if (this.v === null) this.v = _BN(0);

            // MOTEUR RK4 SANS TRICHERIE
            const dv_dt = (v_inst) => {
                const rho = this.env.rho || _BN(1.225);
                // Reynolds pour bascule Laminaire/Turbulent
                const re = m.divide(m.multiply(rho, v_inst, 1.7), 1.81e-5);
                let drag;
                if (Number(re) < 2000) { 
                    drag = m.multiply(6, Math.PI, 1.81e-5, 0.5, v_inst);
                } else {
                    drag = m.multiply(0.5, rho, m.pow(v_inst, 2), this.env.cx, this.env.area);
                }
                return m.subtract(_BN(mag < 0.15 ? 0 : mag), m.divide(drag, this.env.mass));
            };

            const k1 = dv_dt(this.v);
            const k2 = dv_dt(m.add(this.v, m.multiply(k1, dt/2)));
            const k3 = dv_dt(m.add(this.v, m.multiply(k2, dt/2)));
            const k4 = dv_dt(m.add(this.v, m.multiply(k3, dt)));

            this.v = m.add(this.v, m.multiply(dt/6, m.add(k1, m.multiply(2, k2), m.multiply(2, k3), k4)));
            if (this.v < 0.0001) this.v = _BN(0);
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        });
    },

    updateDashboard() {
        const v = this.v === null ? null : Number(this.v);
        const dist = Number(this.dist);

        // --- CINÉMATIQUE_PRO ---
        this.setUI('v-cosmic', this.format(v ? v * 3.6 : null, 'fixed', 7));
        this.setUI('speed-stable-kmh', this.format(v ? v * 3.6 : null, 'fixed', 4));
        this.setUI('speed-stable-ms', this.format(v, 'fixed', 6));
        this.setUI('mach-number', this.format(v ? v / (331.3 + 0.6 * this.env.temp) : null, 'fixed', 5));

        // --- RELATIVITÉ ---
        const gamma = v !== null ? 1 / Math.sqrt(1 - (v / 299792458)**2) : null;
        this.setUI('ui-lorentz', this.format(gamma, 'fixed', 18));
        this.setUI('time-dilation', this.format(gamma ? (gamma - 1) * 1e9 : null, 'fixed', 5));

        // --- MÉCANIQUE ---
        const rho = this.env.rho ? Number(this.env.rho) : null;
        this.setUI('pression-dyn', this.format(rho && v ? 0.5 * rho * v**2 : null, 'fixed', 3));
        this.setUI('reynolds-number', this.format(rho && v ? (rho * v * 1.7) / 1.81e-5 : null, 'exp', 2));

        // --- ASTRO & ESPACE-TEMPS ---
        const jd = (Date.now() / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(6));
        this.setUI('distance-light-s', this.format(v ? dist / 299792458 : null, 'exp', 6));
        
        // Shapiro Delay (ps)
        const shapiro = (4 * 6.674e-11 * 5.972e24 / Math.pow(299792458, 3)) * Math.log(6371000);
        this.setUI('ast-deltat', (shapiro * 1e12).toFixed(3) + " ps");
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) { 
        const l = document.getElementById('anomaly-log'); 
        if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; 
    }
};

window.onload = () => CORE.init();
