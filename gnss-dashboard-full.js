/**
 * OMNISCIENCE V21.9 - TOTAL_RECALL_SUPREMACY
 * Protocol: SINS/SLAM 21-States / 64-bit Tensor Integration
 * Modules: Schwarzschild, Lorentz, Power-Zenith, BlackBox, CSV-Report, Free-Fall
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    lastSave: 0,
    lastMotion: performance.now(),
    history: [], // Tampon pour export CSV

    // CONSTANTES UNIVERSELLES
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
        q: { w: 1, x: 0, y: 0, z: 0 },
        bias: { a: {x: _BN(0), y: _BN(0), z: _BN(0)} },
        g_local: _BN(9.80665),
        rho: _BN(1.225),
        jd: 0,
        isFreeFall: false,
        powerMode: "PERFORMANCE", // PERFORMANCE ou STAMINA
        profile_mode: "IDLE",
        k_rot: _BN(1.0)
    },

    sensors: { accel:{x:0,y:0,z:0}, gyro:{x:0,y:0,z:0} },
    astro: { gmt: null },

    async boot() {
        this.log("INITIALISATION V21.9 - SOUVERAINETÉ ABSOLUE...");
        try {
            // 1. Récupération BlackBox (localStorage)
            this.loadFromCache();

            // 2. Sync Temps & Météo (avec Fallback Offline)
            await this.syncAtomicSextant().catch(() => this.log("OFFLINE: UTILISATION HORLOGE INTERNE"));
            await this.fetchWeather().catch(() => this.log("OFFLINE: ATMOSPHÈRE STD UTILISÉE"));
            
            // 3. Calibration Gravité & Biais
            this.log("CALIBRATION SINS (DÉTECTION PLANÉTAIRE)...");
            await this.calibrate(3000);
            
            this.initHardware();
            this.active = true;
            this.engine();
            this.log("SYSTÈME VERROUILLÉ : BOÎTE NOIRE ET CSV PRÊTS");
        } catch (e) { this.log("BOOT_ERROR: " + e.message); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        // --- GESTION ÉNERGÉTIQUE (ZÉNITH) ---
        this.updatePowerMode(now);

        // --- NAVIGATION SLAM ---
        this.identifyProfile();
        this.solveSINS(dt);
        this.updateUIMap();

        // --- PERSISTENCE & ARCHIVAGE ---
        if (now - this.lastSave > 2000) {
            this.archiveState();
            this.lastSave = now;
        }

        // Boucle adaptative
        if (this.state.powerMode === "STAMINA") {
            setTimeout(() => requestAnimationFrame(() => this.engine()), 100);
        } else {
            requestAnimationFrame(() => this.engine());
        }
    },

    updatePowerMode(now) {
        const motion = Math.abs(this.sensors.accel.x) + Math.abs(this.sensors.accel.y) + Math.abs(this.sensors.gyro.x);
        if (motion > 0.15) {
            this.lastMotion = now;
            if (this.state.powerMode !== "PERFORMANCE") {
                this.state.powerMode = "PERFORMANCE";
                this.log("MODE HAUTE PERFORMANCE");
            }
        } else if (now - this.lastMotion > 15000) {
            if (this.state.powerMode !== "STAMINA") {
                this.state.powerMode = "STAMINA";
                this.log("MODE ÉCONOMIE (STAMINA)");
            }
        }
    },

    identifyProfile() {
        const a_mag = Math.sqrt(this.sensors.accel.x**2 + this.sensors.accel.y**2 + this.sensors.accel.z**2);
        // Détection Free-Fall (Chute libre)
        this.state.isFreeFall = a_mag < 1.0;

        if (this.state.isFreeFall) {
            this.state.profile_mode = "FREE_FALL";
            this.state.k_rot = _BN(1.0);
        } else if (a_mag < 2.0) {
            this.state.profile_mode = "GASTROPODE";
            this.state.k_rot = _BN(1.0);
        } else {
            this.state.profile_mode = "DYNAMIQUE";
            this.state.k_rot = _BN(1.4); // Inertie de rotation
        }
    },

    solveSINS(dt) {
        this.integrateGyro(this.sensors.gyro, dt);
        const g_vec = this.rotateVector({x:0, y:0, z:m.number(this.state.g_local)}, this.state.q);
        const v_norm = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));

        ['x', 'y', 'z'].forEach(axis => {
            let a_raw = m.subtract(m.subtract(_BN(this.sensors.accel[axis]), _BN(g_vec[axis])), this.state.bias.a[axis]);
            
            // Traînée aéro (Modèle balistique)
            const v_dir = v_norm.gt(0) ? m.divide(this.state.vel[axis], v_norm) : _BN(0);
            const a_drag = m.multiply(m.multiply(_BN(0.005), this.state.rho), m.pow(v_norm, 2));
            
            let a_final = m.subtract(m.divide(a_raw, this.state.k_rot), m.multiply(a_drag, v_dir));

            // Intégration
            this.state.vel[axis] = m.add(this.state.vel[axis], m.multiply(a_final, dt));
            this.state.pos[axis] = m.add(this.state.pos[axis], m.multiply(this.state.vel[axis], dt));
        });
    },

    updateUIMap() {
        const v = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        
        // Relativité Schwarzschild (Gravité) & Lorentz (Vitesse)
        const beta = m.divide(v, this.PHYS.C);
        const gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(beta, 2))));
        const rs = m.divide(m.multiply(2, m.multiply(this.PHYS.G, this.PHYS.M_EARTH)), m.pow(this.PHYS.C, 2));
        const dt_g = m.subtract(1, m.sqrt(m.subtract(1, m.divide(rs, m.add(this.PHYS.R_EARTH, this.state.pos.z)))));

        // Update UI
        this.setUI('speed-stable-kmh', m.multiply(v, 3.6).toFixed(4));
        this.setUI('ui-mc-speed', v.toFixed(3) + " m/s");
        this.setUI('ui-sextant-status', this.state.profile_mode);
        this.setUI('ast-jd', this.state.jd.toFixed(8));
        this.setUI('ui-lorentz-2', gamma.toFixed(18));
        this.setUI('time-dilation-gravite', dt_g.toFixed(20));
        this.setUI('pos-z', this.state.pos.z.toFixed(4));
        this.setUI('vitesse-raw', v.toFixed(6));
        this.setUI('mach-number', m.divide(v, 340.29).toFixed(5));
    },

    // --- BLACK BOX & CSV ---
    archiveState() {
        const v = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        const entry = {
            t: new Date().toLocaleTimeString(),
            jd: this.state.jd.toFixed(8),
            z: this.state.pos.z.toString(),
            v: v.toString(),
            mode: this.state.profile_mode
        };
        this.history.push(entry);
        if (this.history.length > 500) this.history.shift();
        
        // Sauvegarde persistence
        localStorage.setItem('OMNI_BLACKBOX_V21', JSON.stringify({
            history: this.history,
            pos: {x:this.state.pos.x.toString(), y:this.state.pos.y.toString(), z:this.state.pos.z.toString()},
            vel: {x:this.state.vel.x.toString(), y:this.state.vel.y.toString(), z:this.state.vel.z.toString()},
            q: this.state.q
        }));
    },

    exportCSV() {
        if (this.history.length === 0) return;
        let csv = "Timestamp,JD,PosZ,Vel_ms,Profile\n";
        this.history.forEach(e => {
            csv += `${e.t},${e.jd},${e.z},${e.v},${e.mode}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mission_report_${Date.now()}.csv`;
        a.click();
        this.log("RAPPORT CSV GÉNÉRÉ");
    },

    loadFromCache() {
        const saved = localStorage.getItem('OMNI_BLACKBOX_V21');
        if (saved) {
            const d = JSON.parse(saved);
            this.history = d.history || [];
            this.state.pos = { x:_BN(d.pos.x), y:_BN(d.pos.y), z:_BN(d.pos.z) };
            this.state.vel = { x:_BN(d.vel.x), y:_BN(d.vel.y), z:_BN(d.vel.z) };
            this.state.q = d.q;
            this.log("RÉCUPÉRATION BOÎTE NOIRE RÉUSSIE");
        }
    },

    // --- SENSORS & HARDWARE ---
    async calibrate(ms) {
        let s = {x:[], y:[], z:[]};
        const f = (e) => { 
            s.x.push(e.accelerationIncludingGravity.x); 
            s.y.push(e.accelerationIncludingGravity.y); 
            s.z.push(e.accelerationIncludingGravity.z); 
        };
        window.addEventListener('devicemotion', f);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', f);
        
        const avg = (a) => a.reduce((p,c)=>p+c,0)/a.length;
        const g_m = Math.sqrt(avg(s.x)**2 + avg(s.y)**2 + avg(s.z)**2);
        this.state.g_local = _BN(g_m);
        this.state.bias.a = { x:_BN(avg(s.x)), y:_BN(avg(s.y)), z:_BN(avg(s.z)-g_m) };
        this.log(`G LOCAL DÉTECTÉ: ${g_m.toFixed(4)} m/s²`);
    },

    initHardware() {
        window.ondevicemotion = (e) => {
            this.sensors.accel = { x:e.accelerationIncludingGravity.x||0, y:e.accelerationIncludingGravity.y||0, z:e.accelerationIncludingGravity.z||0 };
            this.sensors.gyro = { x:e.rotationRate.alpha||0, y:e.rotationRate.beta||0, z:e.rotationRate.gamma||0 };
        };
        const btn = document.getElementById('export-metrics-btn');
        if (btn) btn.onclick = () => this.exportCSV();
    },

    async syncAtomicSextant() {
        const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
        const d = await r.json();
        this.astro.gmt = new Date(d.utc_datetime);
        this.state.jd = (this.astro.gmt.getTime() / 86400000) + 2440587.5;
    },

    async fetchWeather() {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=surface_pressure`);
        const d = await r.json();
        this.state.rho = m.divide(_BN(d.current.surface_pressure * 100), m.multiply(_BN(287.058), _BN(288.15)));
    },

    rotateVector(v, q) {
        const {x, y, z} = v, {w, x: qx, y: qy, z: qz} = q;
        const ix = w*x + qy*z - qz*y, iy = w*y + qz*x - qx*z, iz = w*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
        return { x: ix*w + iw*-qx + iy*-qz - iz*-qy, y: iy*w + iw*-qy + iz*-qx - ix*-qz, z: iz*w + iw*-qz + ix*-qy - iy*-qx };
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

    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { 
        const l = document.getElementById('anomaly-log'); 
        if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; 
    }
};

function startAdventure() { OMNI_CORE.boot(); }
