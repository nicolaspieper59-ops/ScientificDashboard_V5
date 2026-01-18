/**
 * OMNISCIENCE V27.4.0 - TOTAL_INIT_CORE
 * Zéro Simulation • Activation par Bouton • Protection des Flux
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n || 0);

const OMNI = {
    active: false,
    v: null, // État initial : "Indéterminé" (Affiche --)
    dist: _BN(0),
    lastT: performance.now(),
    
    // Environnement & Constantes (Zéro Triche)
    env: {
        rho: _BN(1.225), // Air standard initial
        temp: 15, press: 1013.25, lat: 45.0,
        mass: 80, area: 0.55, cx: 0.45
    },

    // --- INITIALISATION PAR BOUTON ---
    async boot() {
        const btn = document.getElementById('main-init-btn');
        if (this.active) return;

        this.log("DEMANDE D'ACCÈS AUX LOIS PHYSIQUES...");

        try {
            // Permission pour iOS/Android
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') throw new Error("Permission refusée");
            }

            this.active = true;
            this.v = _BN(0); // On passe du néant (--) au zéro physique
            if(btn) {
                btn.innerText = "SYSTEM_RUNNING";
                btn.style.background = "var(--critical)";
                btn.style.boxShadow = "0 0 20px var(--critical)";
            }

            // Démarrage des moteurs
            this.syncEnvironment();
            this.startInertialEngine();
            setInterval(() => this.updateUI(), 100);
            
            this.log("V17 PRO MAX : NOMINAL_READY");
        } catch (e) {
            this.log("ERREUR D'ACTIVATION : " + e.message);
        }
    },

    // --- PHYSIQUE SANS SIMULATION (RK4) ---
    startInertialEngine() {
        window.addEventListener('devicemotion', (e) => {
            if (!this.active) return;
            
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;

            if (Number(dt) <= 0 || Number(dt) > 0.1) return;

            const a_raw = e.acceleration || { x: 0, y: 0, z: 0 };
            const mag = Math.sqrt((a_raw.x || 0)**2 + (a_raw.y || 0)**2 + (a_raw.z || 0)**2);
            const a_eff = mag < 0.15 ? _BN(0) : _BN(mag);

            // MOTEUR D'INTÉGRATION RK4
            const accelFunc = (v_inst) => {
                const re = m.divide(m.multiply(this.env.rho, v_inst, 1.7), 1.81e-5);
                let drag = (Number(re) < 2000) 
                    ? m.multiply(6, Math.PI, 1.81e-5, 0.5, v_inst) 
                    : m.multiply(0.5, this.env.rho, m.pow(v_inst, 2), this.env.cx, this.env.area);
                return m.subtract(a_eff, m.divide(drag, this.env.mass));
            };

            const k1 = accelFunc(this.v);
            const k2 = accelFunc(m.add(this.v, m.multiply(k1, m.divide(dt, 2))));
            const k3 = accelFunc(m.add(this.v, m.multiply(k2, m.divide(dt, 2))));
            const k4 = accelFunc(m.add(this.v, m.multiply(k3, dt)));

            this.v = m.add(this.v, m.multiply(m.divide(dt, 6), m.add(k1, m.multiply(2, k2), m.multiply(2, k3), k4)));
            if (this.v.isNegative()) this.v = _BN(0);
            this.dist = m.add(this.dist, m.multiply(this.v, dt));
        }, true);
    },

    // --- MISE À JOUR DU TABLEAU SCIENTIFIQUE ---
    updateUI() {
        const v = (this.v === null) ? null : Number(this.v);
        const dist = Number(this.dist);

        // Formattage intelligent : -- si null, sinon chiffre
        const f = (val, p = 2) => (val === null || isNaN(val)) ? "--" : val.toFixed(p);
        const fExp = (val, p = 2) => (val === null || isNaN(val)) ? "--" : val.toExponential(p);

        // CINÉMATIQUE_PRO
        this.setUI('v-cosmic', f(v ? v * 3.6 : (this.active ? 0 : null), 7));
        this.setUI('speed-stable-kmh', f(v ? v * 3.6 : (this.active ? 0 : null), 4));
        this.setUI('speed-stable-ms', f(v, 6));
        this.setUI('mach-number', f(v ? v / (331.3 + 0.6 * this.env.temp) : (this.active ? 0 : null), 5));

        // RELATIVITÉ & MÉCANIQUE
        const gamma = v !== null ? 1 / Math.sqrt(1 - (v / 299792458)**2) : null;
        this.setUI('ui-lorentz', f(gamma, 18));
        this.setUI('time-dilation', f(gamma ? (gamma - 1) * 1e9 : null, 5));
        
        const pDyn = v !== null ? 0.5 * Number(this.env.rho) * v**2 : null;
        this.setUI('pression-dyn', f(pDyn, 3));
        this.setUI('reynolds-number', fExp(v !== null ? (Number(this.env.rho) * v * 1.7) / 1.81e-5 : null, 2));

        // ESPACE_TEMPS & ASTRO
        this.setUI('ast-jd', ((Date.now() / 86400000) + 2440587.5).toFixed(6));
        this.setUI('distance-light-s', fExp(v !== null ? dist / 299792458 : null, 6));
        
        // Shapiro Delay (ps)
        const shapiro = (4 * 6.674e-11 * 5.972e24 / Math.pow(299792458, 3)) * Math.log(6371000);
        this.setUI('ast-deltat', shapiro ? (shapiro * 1e12).toFixed(3) + " ps" : "--");
    },

    async syncEnvironment() {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.env.lat}&longitude=25.5&current=temperature_2m,surface_pressure`);
            const d = await res.json();
            this.env.temp = d.current.temperature_2m;
            this.env.press = d.current.surface_pressure;
            this.env.rho = _BN((this.env.press * 100) / (287.058 * (this.env.temp + 273.15)));
        } catch(e) { this.log("CLIMAT_SYNC_ERROR: REPLI AIR STANDARD"); }
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) { 
        const log = document.getElementById('anomaly-log');
        if (log) log.innerHTML = `<div>> ${msg}</div>` + log.innerHTML;
    }
};

// Liaison impérative du bouton au chargement
window.onload = () => {
    const btn = document.getElementById('main-init-btn');
    if (btn) btn.addEventListener('click', () => OMNI.boot());
};
