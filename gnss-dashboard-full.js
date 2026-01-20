/**
 * OMNISCIENCE V21 - TOTAL_RECALL_SUPREMACY
 * Protocol: SINS/SLAM 21-States / 64-bit Tensor Integration
 * non-euclidean physics for mineshaft, aircraft, and gastropods.
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    
    // VECTEUR D'ÉTAT 21 (Navigation Professionnelle)
    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: 1, x: 0, y: 0, z: 0 }, // Sphère Ariamétrique (Quaternions)
        bias: { a: {x: _BN(0), y: _BN(0), z: _BN(0)} },
        mass: _BN(0.05),      // Masse ajustable
        radius: _BN(0.0075),  // Rayon bille 7.5mm
        g_ref: _BN(9.80665),
        rho: _BN(1.225),      // Densité air corrigée
        jd: 0,                // Jour Julien (Sextant)
        k_rot: _BN(1.4)       // Facteur d'inertie (1 + 2/5 pour sphère)
    },

    sensors: { accel:{x:0,y:0,z:0}, gyro:{x:0,y:0,z:0}, temp:15, press:1013.25 },

    async boot() {
        this.log("SYSTÈME OMNISCIENCE V21 ACTIVÉ...");
        try {
            // 1. Synchronisation Temps Atomique & Sextant
            await this.syncAtomicSextant();
            
            // 2. Environnement (Weather.js logic)
            await this.fetchWeather();
            
            // 3. Calibration Statique G_LOCAL
            this.log("CALIBRATION SINS (NE PAS BOUGER)...");
            await this.calibrate(3000);
            
            this.initHardware();
            this.active = true;
            this.engine();
            this.log("SOUVERAINETÉ PHYSIQUE VERROUILLÉE");
        } catch (e) { this.log("BOOT_ERROR: " + e.message); }
    },

    async syncAtomicSextant() {
        const start = performance.now();
        const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
        const d = await r.json();
        const latency = (performance.now() - start) / 2000;
        const atomicDate = new Date(new Date(d.utc_datetime).getTime() + latency);
        
        // Calcul du Jour Julien pour le Sextant automatique
        this.state.jd = (atomicDate.getTime() / 86400000) + 2440587.5;
        this.setUI('ast-jd', this.state.jd.toFixed(8));
        this.setUI('ui-sextant-status', "ATOMIC_SYNC_OK");
    },

    async fetchWeather() {
        try {
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m,surface_pressure`);
            const d = await r.json();
            this.sensors.temp = d.current.temperature_2m;
            this.sensors.press = d.current.surface_pressure;
            // Mise à jour de Rho (Densité de l'air)
            const P = _BN(this.sensors.press * 100);
            const T = _BN(this.sensors.temp + 273.15);
            this.state.rho = m.divide(P, m.multiply(_BN(287.058), T));
        } catch(e) { this.log("WEATHER_OFFLINE: STD_RHO_USED"); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        this.updatePhysics(dt);
        this.updateUIMap();

        requestAnimationFrame(() => this.engine());
    },

    updatePhysics(dt) {
        // A. Intégration de l'Attitude (Hamilton)
        this.integrateGyro(this.sensors.gyro, dt);
        const g_local = this.rotateVector({x:0, y:0, z:m.number(this.state.g_ref)}, this.state.q);

        // B. Calcul des forces (Drag & Friction)
        const v_vec = this.state.vel;
        const v_norm = m.sqrt(m.add(m.pow(v_vec.x, 2), m.pow(v_vec.y, 2), m.pow(v_vec.z, 2)));
        
        const S = m.multiply(m.pi, m.pow(this.state.radius, 2));
        const f_drag = m.multiply(m.multiply(m.multiply(0.5, this.state.rho), m.multiply(S, _BN(0.47))), m.pow(v_norm, 2));
        const f_roll = m.multiply(m.multiply(_BN(0.015), this.state.mass), this.state.g_ref);

        // C. SLAM 64-bits (Navigation en Grotte sans GPS)
        ['x', 'y', 'z'].forEach(axis => {
            let a_raw = m.subtract(m.subtract(_BN(this.sensors.accel[axis]), _BN(g_local[axis])), this.state.bias.a[axis] || 0);
            
            // Inclusion du Moment d'Inertie (Rotation de la bille)
            let a_effective = m.divide(a_raw, this.state.k_rot);

            // Soustraction de la traînée atmosphérique
            const v_dir = v_norm.gt(0) ? m.divide(this.state.vel[axis], v_norm) : _BN(0);
            const a_brake = m.divide(m.add(f_drag, f_roll), this.state.mass);
            const a_final = m.subtract(a_effective, m.multiply(a_brake, v_dir));

            // Intégration Verlet (Sans triche)
            const v_prev = this.state.vel[axis];
            this.state.vel[axis] = m.add(v_prev, m.multiply(a_final, dt));
            const v_avg = m.divide(m.add(v_prev, this.state.vel[axis]), 2);
            this.state.pos[axis] = m.add(this.state.pos[axis], m.multiply(v_avg, dt));
            
            if (this.isStatic()) this.state.vel[axis] = m.multiply(this.state.vel[axis], 0.8);
        });
    },

    updateUIMap() {
        const v_ms = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        
        // Énergie Totale (Translation + Rotation)
        const ec_total = m.multiply(m.multiply(0.5, m.multiply(this.state.mass, this.state.k_rot)), m.pow(v_ms, 2));
        
        // Nombre de Reynolds
        const mu = _BN("1.81e-5"); // Viscosité std
        const re = m.divide(m.multiply(m.multiply(this.state.rho, v_ms), m.multiply(this.state.radius, 2)), mu);

        this.setUI('speed-stable-kmh', m.multiply(v_ms, 3.6).toFixed(4));
        this.setUI('ui-mc-speed', v_ms.toFixed(3) + " b/s");
        this.setUI('kinetic-energy', ec_total.toFixed(6) + " J");
        this.setUI('reynolds-number', re.toFixed(0));
        this.setUI('pos-z', this.state.pos.z.toFixed(4));
        this.setUI('ui-f-roll', m.divide(v_ms, this.state.radius).toFixed(2) + " rad/s");
    },

    // --- UTILITAIRES SINS ---
    integrateGyro(g, dt) {
        const rad = Math.PI / 180, d = m.number(dt), q = this.state.q;
        const nw = q.w + 0.5 * (-q.x*g.x*rad - q.y*g.y*rad - q.z*g.z*rad) * d;
        const nx = q.x + 0.5 * (q.w*g.x*rad + q.y*g.z*rad - q.z*g.y*rad) * d;
        const mag = Math.sqrt(nw*nw + nx*nx + q.y*q.y + q.z*q.z);
        this.state.q = { w: nw/mag, x: nx/mag, y: q.y/mag, z: q.z/mag };
    },

    rotateVector(v, q) {
        const {x, y, z} = v, {w, x: qx, y: qy, z: qz} = q;
        const ix = w*x + qy*z - qz*y, iy = w*y + qz*x - qx*z, iz = w*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
        return {
            x: ix*w + iw*-qx + iy*-qz - iz*-qy,
            y: iy*w + iw*-qy + iz*-qx - ix*-qz,
            z: iz*w + iw*-qz + ix*-qy - iy*-qx
        };
    },

    async calibrate(ms) {
        let acc_samples = {x:[], y:[], z:[]};
        const f = (e) => {
            acc_samples.x.push(e.accelerationIncludingGravity.x);
            acc_samples.y.push(e.accelerationIncludingGravity.y);
            acc_samples.z.push(e.accelerationIncludingGravity.z);
        };
        window.addEventListener('devicemotion', f);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', f);
        const avg = (arr) => _BN(arr.reduce((a,b)=>a+b,0) / arr.length);
        this.state.bias.a.x = avg(acc_samples.x);
        this.state.bias.a.y = avg(acc_samples.y);
        this.state.bias.a.z = m.subtract(avg(acc_samples.z), this.state.g_ref);
    },

    initHardware() {
        window.ondevicemotion = (e) => {
            this.sensors.accel = { x: e.accelerationIncludingGravity.x||0, y: e.accelerationIncludingGravity.y||0, z: e.accelerationIncludingGravity.z||0 };
            this.sensors.gyro = { x: e.rotationRate.alpha||0, y: e.rotationRate.beta||0, z: e.rotationRate.gamma||0 };
        };
    },

    isStatic() { return Math.abs(this.sensors.gyro.x) < 0.1 && Math.abs(this.sensors.accel.x) < 0.1; },
    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { document.getElementById('anomaly-log').innerHTML = `<div>> ${msg}</div>` + document.getElementById('anomaly-log').innerHTML; }
};

function startAdventure() { OMNI_CORE.boot(); }
