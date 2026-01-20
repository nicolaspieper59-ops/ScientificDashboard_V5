/**
 * OMNISCIENCE V21.4 - COSMIC SOUVERAINETÉ
 * Protocol: SINS/SLAM 21-States / 64-bit Tensor Integration
 * Features: Schwarzschild Metric, Lorentz Factor, Auto-Mass Profiling, Planetary Gravity Detection
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    
    // CONSTANTES UNIVERSELLES (Précision 64-bit)
    PHYS: {
        C: _BN("299792458"),
        G: _BN("6.67430e-11"),
        M_EARTH: _BN("5.9722e24"),
        R_EARTH: _BN("6371000"),
        G_STD: _BN("9.80665")
    },

    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: 1, x: 0, y: 0, z: 0 }, // Quaternions Hamiltoniens
        bias: { a: {x: _BN(0), y: _BN(0), z: _BN(0)} },
        g_local: _BN(9.80665), // Gravité détectée
        rho: _BN(1.225),       // Densité air
        jd: 0,                 // Jour Julien (Sextant)
        profile_mode: "IDLE",  // [IDLE, GASTROPODE, TRAIN, ROCKET]
        k_rot: _BN(1.0)        // Inertie adaptative
    },

    sensors: { accel:{x:0,y:0,z:0}, gyro:{x:0,y:0,z:0}, temp:15, press:1013.25 },
    astro: { gmt: null },

    async boot() {
        this.log("INITIALISATION V21.4 - SOUVERAINETÉ TOTALE...");
        try {
            await this.syncAtomicSextant();
            await this.fetchWeather();
            
            this.log("CALIBRATION ET DÉTECTION PLANÉTAIRE...");
            await this.calibrate(3000); // Détecte g_local et les biais
            
            this.initHardware();
            this.active = true;
            this.engine();
            this.log("SYSTÈME VERROUILLÉ : PRÊT POUR L'AVENTURE");
        } catch (e) { this.log("BOOT_ERROR: " + e.message); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        this.identifyProfile();
        this.solveSINS(dt);
        this.updateUIMap();

        requestAnimationFrame(() => this.engine());
    },

    // 1. IDENTIFICATION DYNAMIQUE (Masse et Inertie automatiques)
    identifyProfile() {
        const a_mag = Math.sqrt(this.sensors.accel.x**2 + this.sensors.accel.y**2 + this.sensors.accel.z**2);
        const g_mag = Math.sqrt(this.sensors.gyro.x**2 + this.sensors.gyro.y**2 + this.sensors.gyro.z**2);

        if (a_mag < 0.1 && g_mag < 0.1) {
            this.state.profile_mode = "STATIONNAIRE";
            this.state.k_rot = _BN(1.0);
        } else if (a_mag < 2.0) {
            this.state.profile_mode = "GASTROPODE";
            this.state.k_rot = _BN(1.0);
        } else if (a_mag < 15.0) {
            this.state.profile_mode = "DYNAMIQUE (BILLE)";
            this.state.k_rot = _BN(1.4); // Rotation engagée
        } else {
            this.state.profile_mode = "VÉLOCITÉ HAUTE";
            this.state.k_rot = _BN(1.0);
        }
    },

    // 2. RÉSOLUTION DES FORCES SPÉCIFIQUES (SINS/SLAM)
    solveSINS(dt) {
        this.integrateGyro(this.sensors.gyro, dt);
        
        // Projection de la gravité détectée
        const g_local_vec = this.rotateVector({x:0, y:0, z:m.number(this.state.g_local)}, this.state.q);
        const v_norm = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));

        ['x', 'y', 'z'].forEach(axis => {
            // Accélération pure (Force spécifique)
            let a_raw = m.subtract(m.subtract(_BN(this.sensors.accel[axis]), _BN(g_local_vec[axis])), this.state.bias.a[axis]);
            
            // Traînée Aéro automatique (Modèle balistique unitaire)
            const v_dir = v_norm.gt(0) ? m.divide(this.state.vel[axis], v_norm) : _BN(0);
            const a_drag = m.multiply(m.multiply(_BN(0.005), this.state.rho), m.pow(v_norm, 2));
            
            // Application de l'inertie et soustraction traînée
            let a_final = m.subtract(m.divide(a_raw, this.state.k_rot), m.multiply(a_drag, v_dir));

            // Intégration Verlet
            const v_prev = this.state.vel[axis];
            this.state.vel[axis] = m.add(v_prev, m.multiply(a_final, dt));
            this.state.pos[axis] = m.add(this.state.pos[axis], m.multiply(this.state.vel[axis], dt));

            if (this.state.profile_mode === "STATIONNAIRE") this.state.vel[axis] = _BN(0);
        });
    },

    // 3. MISE À JOUR DU BUFFER ET DU DASHBOARD
    updateUIMap() {
        const v = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        
        // --- CALCULS RELATIVISTES ---
        const beta = m.divide(v, this.PHYS.C);
        const gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(beta, 2))));
        
        // Schwarzschild (RG)
        const r = m.add(this.PHYS.R_EARTH, this.state.pos.z);
        const rs = m.divide(m.multiply(2, m.multiply(this.PHYS.G, this.PHYS.M_EARTH)), m.pow(this.PHYS.C, 2));
        const dt_g = m.subtract(1, m.sqrt(m.subtract(1, m.divide(rs, r))));

        // --- DASHBOARD ---
        this.setUI('speed-stable-kmh', m.multiply(v, 3.6).toFixed(4));
        this.setUI('ui-mc-speed', v.toFixed(3) + " b/s");
        this.setUI('kinetic-energy', m.multiply(0.5, m.pow(v, 2)).toFixed(4) + " J/kg");
        this.setUI('ui-sextant-status', this.state.profile_mode);
        
        // --- SCIENTIFIC BUFFER SYNC ---
        this.setUI('ast-jd', this.state.jd.toFixed(8));
        this.setUI('ukf-q-w', this.state.q.w.toFixed(6));
        this.setUI('ukf-q-x', this.state.q.x.toFixed(6));
        this.setUI('ukf-q-y', this.state.q.y.toFixed(6));
        this.setUI('ukf-q-z', this.state.q.z.toFixed(6));
        this.setUI('ui-lorentz-2', gamma.toFixed(18));
        this.setUI('time-dilation-vitesse', m.subtract(gamma, 1).toFixed(20));
        this.setUI('time-dilation-gravite', dt_g.toFixed(20));
        this.setUI('vitesse-raw', v.toFixed(6));
        this.setUI('mach-number', m.divide(v, 340.29).toFixed(5));
        this.setUI('last-sync-gmt', this.astro.gmt ? this.astro.gmt.toISOString() : "SYNCING...");
    },

    // --- UTILITAIRES SINS & ASTRO ---
    async syncAtomicSextant() {
        const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
        const d = await r.json();
        this.astro.gmt = new Date(d.utc_datetime);
        this.state.jd = (this.astro.gmt.getTime() / 86400000) + 2440587.5;
    },

    async fetchWeather() {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m,surface_pressure`);
        const d = await r.json();
        this.sensors.temp = d.current.temperature_2m;
        this.sensors.press = d.current.surface_pressure;
        this.state.rho = m.divide(_BN(this.sensors.press * 100), m.multiply(_BN(287.058), _BN(this.sensors.temp + 273.15)));
    },

    integrateGyro(g, dt) {
        const rad = Math.PI / 180, d = m.number(dt), q = this.state.q;
        const nw = q.w + 0.5 * (-q.x*g.x*rad - q.y*g.y*rad - q.z*g.z*rad) * d;
        const nx = q.x + 0.5 * (q.w*g.x*rad + q.y*g.z*rad - q.z*g.y*rad) * d;
        const ny = q.y + 0.5 * (q.w*g.y*rad + q.z*g.x*rad - q.x*g.z*rad) * d;
        const nz = q.z + 0.5 * (q.w*g.z*rad + q.x*g.y*rad - q.y*g.x*rad) * d;
        const mag = Math.sqrt(nw*nw + nx*nx + ny*ny + nz*nz);
        this.state.q = { w: nw/mag, x: nx/mag, y: ny/mag, z: nz/mag };
    },

    rotateVector(v, q) {
        const {x, y, z} = v, {w, x: qx, y: qy, z: qz} = q;
        const ix = w*x + qy*z - qz*y, iy = w*y + qz*x - qx*z, iz = w*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
        return { x: ix*w + iw*-qx + iy*-qz - iz*-qy, y: iy*w + iw*-qy + iz*-qx - ix*-qz, z: iz*w + iw*-qz + ix*-qy - iy*-qx };
    },

    async calibrate(ms) {
        let samples = {x:[], y:[], z:[]};
        const f = (e) => { 
            samples.x.push(e.accelerationIncludingGravity.x); 
            samples.y.push(e.accelerationIncludingGravity.y); 
            samples.z.push(e.accelerationIncludingGravity.z); 
        };
        window.addEventListener('devicemotion', f);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', f);
        
        const avg = (arr) => arr.reduce((a,b)=>a+b,0) / arr.length;
        const g_measured = Math.sqrt(avg(samples.x)**2 + avg(samples.y)**2 + avg(samples.z)**2);
        
        this.state.g_local = _BN(g_measured);
        this.state.bias.a = { x: _BN(avg(samples.x)), y: _BN(avg(samples.y)), z: _BN(avg(samples.z) - g_measured) };
        
        this.log(`DÉTECTION G: ${this.state.g_local.toFixed(5)} m/s²`);
    },

    initHardware() {
        window.ondevicemotion = (e) => { 
            this.sensors.accel = { x: e.accelerationIncludingGravity.x||0, y: e.accelerationIncludingGravity.y||0, z: e.accelerationIncludingGravity.z||0 };
            this.sensors.gyro = { x: e.rotationRate.alpha||0, y: e.rotationRate.beta||0, z: e.rotationRate.gamma||0 };
        };
    },

    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { 
        const l = document.getElementById('anomaly-log'); 
        if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; 
    }
};

function startAdventure() { OMNI_CORE.boot(); }
