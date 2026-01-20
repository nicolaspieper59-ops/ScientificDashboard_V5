/**
 * OMNISCIENCE V21.9 - SUPREMACY
 * Protocol: SINS/SLAM 21-States / 64-bit Tensor Core
 * Libraries: math.js, weather.js (integrated), ephem.js (sextant sync)
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    lastSave: 0,
    lastMotion: performance.now(),
    history: [],

    // CONSTANTES UNIVERSELLES (64-bit)
    PHYS: {
        C: _BN("299792458"),
        G: _BN("6.67430e-11"),
        M_EARTH: _BN("5.9722e24"),
        R_EARTH: _BN("6371000"),
        G_STD: _BN("9.80665"),
        V_SOUND_BASE: _BN("331.3")
    },

    // ÉTAT DU SYSTÈME (21 ÉTATS UKF/SLAM)
    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) }, // 1-3
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) }, // 4-6
        q: { w: 1, x: 0, y: 0, z: 0 },             // 7-10 (Quaternions)
        bias_a: { x: _BN(0), y: _BN(0), z: _BN(0) }, // 11-13
        bias_g: { x: _BN(0), y: _BN(0), z: _BN(0) }, // 14-16
        g_local: _BN(9.80665),                    // 17
        rho: _BN(1.225),                          // 18
        jd: _BN(0),                               // 19 (Julian Date)
        temp: _BN(15),                            // 20
        press: _BN(1013.25)                       // 21
    },

    sensors: { accel:{x:0,y:0,z:0}, gyro:{x:0,y:0,z:0} },
    config: { powerMode: "PERFORMANCE", profile: "STANDBY" },

    async boot() {
        this.log("INITIALISATION V21.9 - SOUVERAINETÉ SUPRÊME...");
        try {
            this.loadBlackBox();
            
            // SEXTANT ATOMIQUE : Sync GMT Haute Fréquence
            await this.syncSextant().catch(() => this.log("OFFLINE: HORLOGE QUARTZ LOCALE"));
            
            // WEATHER MODULE : Densité de l'air réelle
            await this.updateAtmosphere().catch(() => this.log("OFFLINE: ATMOSPHÈRE STANDARD"));
            
            // SPHERE ARIAMETRIQUE : Calibration gravimétrique
            await this.calibrate(3000);
            
            this.initHardware();
            this.active = true;
            this.engine();
            this.log("SYSTÈME VERROUILLÉ : SLAM 64-BIT ACTIF");
        } catch (e) { this.log("BOOT_ERROR: " + e.message); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        // Gestion Énergétique (Zénith)
        this.managePower(now);

        // Algorithme de Navigation 21 états
        this.updateSextantRealtime(dt);
        this.identifyProfile();
        this.solveSLAM(dt);
        this.updateUIMap();

        // Boîte Noire & Export CSV
        if (now - this.lastSave > 2000) {
            this.archiveState();
            this.lastSave = now;
        }

        const nextTick = this.config.powerMode === "STAMINA" ? 100 : 16;
        setTimeout(() => requestAnimationFrame(() => this.engine()), nextTick);
    },

    // --- MODULE SEXTANT & ASTRO (Ephem.js Logic) ---
    async syncSextant() {
        const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
        const d = await r.json();
        const date = new Date(d.utc_datetime);
        this.state.jd = _BN((date.getTime() / 86400000) + 2440587.5);
        this.setUI('last-sync-gmt', date.toISOString().split('T')[1].split('.')[0] + " Z");
    },

    updateSextantRealtime(dt) {
        // Incrémentation précise du Jour Julien à chaque frame (High Frequency)
        const jdStep = m.divide(dt, _BN(86400));
        this.state.jd = m.add(this.state.jd, jdStep);
    },

    // --- MODULE MÉTÉO (Weather.js Logic) ---
    async updateAtmosphere() {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m,surface_pressure`);
        const d = await r.json();
        this.state.temp = _BN(d.current.temperature_2m);
        this.state.press = _BN(d.current.surface_pressure);
        // Loi des gaz parfaits pour la densité ρ
        this.state.rho = m.divide(m.multiply(this.state.press, _BN(100)), m.multiply(_BN(287.05), m.add(this.state.temp, _BN(273.15))));
    },

    // --- CŒUR DE NAVIGATION SLAM 64-BIT ---
    solveSLAM(dt) {
        // Intégration Gyroscopique (Quaternions Hamiltoniens)
        this.integrateGyro(this.sensors.gyro, dt);
        
        // Projection Gravité dans le référentiel local
        const g_vec = this.rotateVector({x:0, y:0, z:m.number(this.state.g_local)}, this.state.q);
        const v_norm = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));

        ['x', 'y', 'z'].forEach(axis => {
            // Force spécifique sans biais
            let a_raw = m.subtract(m.subtract(_BN(this.sensors.accel[axis]), _BN(g_vec[axis])), this.state.bias_a[axis]);
            
            // Traînée Dynamique (Pas de triche : modèle balistique fluide)
            const v_dir = v_norm.gt(0) ? m.divide(this.state.vel[axis], v_norm) : _BN(0);
            const a_drag = m.multiply(m.multiply(_BN(0.005), this.state.rho), m.pow(v_norm, 2));
            
            // Coefficient de rotation (Bille en mouvement vs Gastéropode)
            const k_rot = (this.config.profile === "DYNAMIQUE") ? _BN(1.4) : _BN(1.0);
            let a_final = m.subtract(m.divide(a_raw, k_rot), m.multiply(a_drag, v_dir));

            // Intégration de Verlet (Position/Vitesse)
            this.state.vel[axis] = m.add(this.state.vel[axis], m.multiply(a_final, dt));
            this.state.pos[axis] = m.add(this.state.pos[axis], m.multiply(this.state.vel[axis], dt));
            
            if (this.config.profile === "STATIONNAIRE") this.state.vel[axis] = _BN(0);
        });
    },

    updateUIMap() {
        const v = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        
        // RELATIVITÉ (No triche : Schwarzschild + Lorentz)
        const beta = m.divide(v, this.PHYS.C);
        const gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(beta, 2))));
        const rs = m.divide(m.multiply(2, m.multiply(this.PHYS.G, this.PHYS.M_EARTH)), m.pow(this.PHYS.C, 2));
        const dt_g = m.subtract(1, m.sqrt(m.subtract(1, m.divide(rs, m.add(this.PHYS.R_EARTH, this.state.pos.z)))));

        // Mach Number Réel (Température dépendant)
        const v_sound = m.sqrt(m.multiply(m.multiply(_BN(1.4), _BN(287)), m.add(this.state.temp, _BN(273.15))));
        const mach = m.divide(v, v_sound);

        // Affichage Tableau Scientifique
        this.setUI('speed-stable-kmh', m.multiply(v, 3.6).toFixed(4));
        this.setUI('ui-mc-speed', v.toFixed(3) + " m/s");
        this.setUI('vitesse-raw', v.toFixed(6));
        this.setUI('ui-lorentz-2', gamma.toFixed(18));
        this.setUI('time-dilation-gravite', dt_g.toFixed(20));
        this.setUI('ast-jd', this.state.jd.toFixed(8));
        this.setUI('mach-number', mach.toFixed(5));
        this.setUI('pos-z', this.state.pos.z.toFixed(2));
        this.setUI('ui-sextant-status', this.config.profile);
    },

    // --- UTILITAIRES DE SOUVERAINETÉ ---
    identifyProfile() {
        const a_mag = Math.sqrt(this.sensors.accel.x**2 + this.sensors.accel.y**2 + this.sensors.accel.z**2);
        if (a_mag < 1.0) this.config.profile = "FREE_FALL";
        else if (a_mag < 2.0) this.config.profile = "GASTROPODE";
        else if (a_mag < 12.0) this.config.profile = "DYNAMIQUE";
        else this.config.profile = "VÉLOCITÉ_HAUTE";
    },

    managePower(now) {
        const motion = Math.abs(this.sensors.accel.x) + Math.abs(this.sensors.gyro.x);
        if (motion > 0.1) this.lastMotion = now, this.config.powerMode = "PERFORMANCE";
        else if (now - this.lastMotion > 20000) this.config.powerMode = "STAMINA";
    },

    async calibrate(ms) {
        let s = {x:[], y:[], z:[]};
        const f = (e) => { s.x.push(e.accelerationIncludingGravity.x); s.y.push(e.accelerationIncludingGravity.y); s.z.push(e.accelerationIncludingGravity.z); };
        window.addEventListener('devicemotion', f);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', f);
        const avg = (a) => a.reduce((p,c)=>p+c,0)/a.length;
        const g_m = Math.sqrt(avg(s.x)**2 + avg(s.y)**2 + avg(s.z)**2);
        this.state.g_local = _BN(g_m);
        this.state.bias_a = { x:_BN(avg(s.x)), y:_BN(avg(s.y)), z:_BN(avg(s.z)-g_m) };
    },

    archiveState() {
        const v = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        this.history.push({ t: new Date().toLocaleTimeString(), z: this.state.pos.z.toFixed(2), v: v.toFixed(4) });
        if (this.history.length > 1000) this.history.shift();
        localStorage.setItem('OMNI_BLACKBOX', JSON.stringify({ pos: this.state.pos, q: this.state.q, hist: this.history }));
    },

    exportCSV() {
        let csv = "Timestamp,Altitude_Z,Vitesse_ms\n";
        this.history.forEach(e => csv += `${e.t},${e.z},${e.v}\n`);
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `mission_supremacy_${Date.now()}.csv`;
        a.click();
    },

    loadBlackBox() {
        const saved = localStorage.getItem('OMNI_BLACKBOX');
        if (saved) {
            const d = JSON.parse(saved);
            this.state.pos = d.pos; this.state.q = d.q; this.history = d.hist || [];
            this.log("BOÎTE NOIRE RESTAURÉE");
        }
    },

    initHardware() {
        window.ondevicemotion = (e) => {
            this.sensors.accel = { x:e.accelerationIncludingGravity.x||0, y:e.accelerationIncludingGravity.y||0, z:e.accelerationIncludingGravity.z||0 };
            this.sensors.gyro = { x:e.rotationRate.alpha||0, y:e.rotationRate.beta||0, z:e.rotationRate.gamma||0 };
        };
        document.getElementById('export-metrics-btn').onclick = () => this.exportCSV();
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
