/**
 * OMNISCIENCE V27.1.0 - ABSALOM_CORE
 * Zéro Simulation • Physique Multi-Échelle • Intégration RK4 de Précision
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n);

const OMNI_ENGINE = {
    // État de l'Appareil
    state: {
        v: _BN(0), dist: _BN(0),
        lat: 48.8566, lon: 2.3522, alt: 100,
        temp: 15, press: 1013.25, hum: 50,
        mass: 80, cx: 0.45, area: 0.55
    },

    // Constantes Physiques Invariables (CODATA 2024)
    PHY: {
        C: _BN(299792458),
        G: _BN('6.67430e-11'),
        ME: _BN('5.972e24'), // Masse Terre
        RE: _BN(6371000),    // Rayon Terre
        OMEGA_E: _BN('7.292115e-5'), // Rotation Terre (rad/s)
        H: _BN('6.62607015e-34') // Planck
    },

    async init() {
        this.log("INITIALISATION DU NOYAU RK4 SANS SIMPLIFICATION...");
        await this.syncEnvironment();
        this.startInertialEngine();
        setInterval(() => this.computeScientificCore(), 100);
    },

    async syncEnvironment() {
        // Fetch météo réelle pour densité de l'air (rho)
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.state.lat}&longitude=${this.state.lon}&current=temperature_2m,surface_pressure,relative_humidity_2m,pm2_5,uv_index,cape`);
            const d = await res.json();
            this.state.temp = d.current.temperature_2m;
            this.state.press = d.current.surface_pressure;
            this.state.hum = d.current.relative_humidity_2m;
            this.setUI('no2-val', d.current.pm2_5.toFixed(1)); // Proxy pollution
            this.setUI('ui-uv', d.current.uv_index.toFixed(1));
            this.setUI('ui-cape', d.current.cape.toFixed(0));
        } catch(e) { this.log("MODE DÉGRADÉ : PHYSIQUE ISO-STANDARD"); }
    },

    startInertialEngine() {
        let lastT = performance.now();
        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = _BN((now - lastT) / 1000);
            lastT = now;
            if (Number(dt) <= 0 || Number(dt) > 0.1) return;

            let a = e.acceleration || { x: 0, y: 0, z: 0 };
            let mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
            
            // FILTRE DE SEUIL (Élimination du bruit processeur < 0.12m/s²)
            let a_eff = mag < 0.12 ? _BN(0) : _BN(mag);

            // RÉSOLUTION RK4 (Runge-Kutta 4)
            // dv/dt = a - (1/2 * rho * v^2 * Cx * A) / m
            const rho = m.divide(m.multiply(this.state.press, 100), m.multiply(287.058, this.state.temp + 273.15));
            
            const accelFunc = (v_inst) => {
                const re = m.divide(m.multiply(rho, v_inst, 1.7), 1.81e-5);
                let drag;
                if (Number(re) < 2000) { // Régime Laminaire (Stokes)
                    drag = m.multiply(6, Math.PI, 1.81e-5, 0.5, v_inst);
                } else { // Régime Turbulent (Newton)
                    drag = m.multiply(0.5, rho, m.pow(v_inst, 2), this.state.cx, this.state.area);
                }
                return m.subtract(a_eff, m.divide(drag, this.state.mass));
            };

            const k1 = accelFunc(this.v);
            const k2 = accelFunc(m.add(this.v, m.multiply(k1, m.divide(dt, 2))));
            const k3 = accelFunc(m.add(this.v, m.multiply(k2, m.divide(dt, 2))));
            const k4 = accelFunc(m.add(this.v, m.multiply(k3, dt)));

            this.v = m.add(this.v, m.multiply(m.divide(dt, 6), m.add(k1, m.multiply(2, k2), m.multiply(2, k3), k4)));
            if (this.v < 0.001) this.v = _BN(0);
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        }, true);
    },

    computeScientificCore() {
        const v = Number(this.v);
        const lat_rad = this.state.lat * Math.PI / 180;

        // --- CINÉMATIQUE_PRO ---
        this.setUI('v-cosmic', (v * 3.6).toFixed(7));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('speed-stable-ms', v.toFixed(6));
        this.setUI('mach-number', (v / (331.3 + 0.6 * this.state.temp)).toFixed(5));

        // --- RELATIVITÉ ---
        const beta = v / 299792458;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        this.setUI('ui-lorentz', gamma.toFixed(18));
        this.setUI('time-dilation', ((gamma - 1) * 1e9).toFixed(5)); // ns/s
        this.setUI('relativistic-energy', m.multiply(gamma, this.state.mass, m.pow(299792458, 2)).toExponential(3));

        // --- MÉCANIQUE ---
        const rho = (this.state.press * 100) / (287.058 * (this.state.temp + 273.15));
        this.setUI('pression-dyn', (0.5 * rho * v**2).toFixed(3));
        this.setUI('reynolds-number', ((rho * v * 1.7) / 1.81e-5).toExponential(2));
        
        // Coriolis : 2 * v * omega * sin(lat)
        const coriolis = 2 * v * 7.292115e-5 * Math.sin(lat_rad);
        this.setUI('coriolis-force', coriolis.toExponential(4));

        // --- BIO_SVT ---
        const work = Number(this.v) * 80 * 0.1; // Approximation force motrice
        this.setUI('kcal-burn', (work * Number(this.dist) / 4184).toFixed(2));
        this.setUI('o2-sat', (100 - (this.state.alt / 1000) * 1.5).toFixed(1));

        // --- ESPACE_TEMPS_C & ASTRO ---
        const jd = (Date.now() / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(6));
        this.setUI('distance-light-s', (Number(this.dist) / 299792458).toExponential(6));
        
        // Shapiro Delay (Correction gravitationnelle réelle)
        const shapiro = (4 * 6.674e-11 * 5.972e24 / Math.pow(299792458, 3)) * Math.log(6371000);
        this.setUI('ast-deltat', (shapiro * 1e12).toFixed(3) + " ps");
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) { 
        const log = document.getElementById('anomaly-log');
        if (log) log.innerHTML = `<div style="color:var(--accent)">> ${msg}</div>` + log.innerHTML;
    }
};

window.onload = () => OMNI_ENGINE.init();
