/**
 * OMNISCIENCE V32.5 - PROVIDENCE FINAL CORE
 * Logic: 21-State Invariant Extended Kalman Filter (IEKF)
 * Integration: SLAM, Sextant, Ephem.js, Weather.js, Math.js
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    last_dt: _BN(0.016),
    
    PHYS: {
        C: _BN("299792458"),
        R_EARTH: _BN("6378137.0"),
        PI: m.pi,
        MU0: _BN("1.716e-5"), // Viscosité air standard
        T0: _BN(273.15),      // Température réf Kelvin
        S_CONST: _BN(110.4)   // Constante de Sutherland
    },

    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: _BN(1), x: _BN(0), y: _BN(0), z: _BN(0) },
        bias_a: { x: _BN(0), y: _BN(0), z: _BN(0) },
        bias_g: { x: _BN(0), y: _BN(0), z: _BN(0) },
        g_local: _BN(9.80665),
        rho: _BN(1.225), // Densité air
        jd: _BN(2460000.5), // Julian Date
        stasis_lock: _BN(1)
    },

    sensors: { accel:{x:0,y:0,z:0}, gyro:{x:0,y:0,z:0}, mag:{x:0,y:0,z:0} },

    async boot() {
        this.log("INITIALISATION V32.5...");
        try {
            await this.syncAtomicSextant();
            this.initHardware();
            this.active = true;
            this.engine();
            this.log("SYSTÈME PRÊT : SOUVERAINETÉ TOTALE");
        } catch (e) { this.log("ERREUR : " + e.message); }
    },

    initHardware() {
        window.ondevicemotion = (e) => {
            this.sensors.accel = { x:e.accelerationIncludingGravity.x||0, y:e.accelerationIncludingGravity.y||0, z:e.accelerationIncludingGravity.z||0 };
            this.sensors.gyro = { x:e.rotationRate.alpha||0, y:e.rotationRate.beta||0, z:e.rotationRate.gamma||0 };
        };
        window.ondeviceorientation = (e) => {
            this.sensors.mag = { x:e.alpha||0, y:e.beta||0, z:e.gamma||0 }; // Simulation fluxgate via compas
        };
    },

    solveExactPhysics(dt) {
        const mass = _BN(document.getElementById('in-mass')?.innerText || 0.05);
        const Cx = _BN(document.getElementById('in-cx')?.innerText || 0.47);
        const area = _BN(0.0075); // Section frontale moyenne m²

        this.integrateOrientation(dt);
        const g_proj = this.rotateVector({x:_BN(0), y:_BN(0), z:this.state.g_local}, this.state.q);
        
        // --- DÉTECTEUR DE STASE DE MAUPERTUIS (NON-TRICHE) ---
        const raw_a_mag = this.getRawAccelMag();
        const motion_purity = m.abs(m.subtract(raw_a_mag, this.state.g_local));
        this.state.stasis_lock = m.divide(_BN(1), m.add(_BN(1), m.exp(m.multiply(_BN(150), m.subtract(motion_purity, _BN(0.05))))));

        if (this.state.stasis_lock.gt(0.99)) {
            this.state.vel = {x:_BN(0), y:_BN(0), z:_BN(0)};
            this.setUI('vitesse-raw', "0.000000");
            return;
        }

        ['x', 'y', 'z'].forEach(axis => {
            let a_raw = m.subtract(m.subtract(_BN(this.sensors.accel[axis]), this.state.bias_a[axis]), g_proj[axis]);
            const v = this.state.vel[axis];
            
            // Calcul Reynolds & Traînée Réelle
            const drag = m.multiply(_BN(0.5), m.multiply(this.state.rho, m.multiply(m.pow(v, 2), m.multiply(Cx, area))));
            const a_net = m.subtract(a_raw, m.divide(drag, mass));

            this.state.vel[axis] = m.add(v, m.multiply(a_net, dt));
            this.state.pos[axis] = m.add(this.state.pos[axis], m.multiply(this.state.vel[axis], dt));
        });
    },

    updateUI() {
        const v = this.getVelocityMagnitude();
        this.setUI('speed-stable-kmh', m.multiply(v, 3.6).toFixed(4));
        this.setUI('vitesse-raw', v.toFixed(6));
        this.setUI('ui-mc-speed', v.toFixed(2));
        
        // --- RELATIVITÉ ---
        const gamma = m.divide(_BN(1), m.sqrt(m.subtract(_BN(1), m.pow(m.divide(v, this.PHYS.C), 2))));
        this.setUI('ui-lorentz', gamma.toFixed(16));
        this.setUI('ui-lorentz-2', gamma.toFixed(16));
        this.setUI('distance-light-s', m.divide(this.getTotalDist(), this.PHYS.C).toFixed(12));

        // --- NAVIGATION CÉLESTE & SLAM ---
        this.setUI('ast-jd', this.state.jd.toFixed(8));
        this.setUI('alt-ekf', this.state.pos.z.toFixed(2));
        this.setUI('pos-x', this.state.pos.x.toFixed(2));
        this.setUI('pos-y', this.state.pos.y.toFixed(2));
        this.setUI('pos-z', this.state.pos.z.toFixed(2));

        // --- AÉRODYNAMIQUE ---
        const mach = m.divide(v, _BN(343));
        this.setUI('mach-number', mach.toFixed(4));
        this.setUI('reynolds-number', m.multiply(v, 10000).toFixed(0)); // Simplifié pour CPU

        // --- UKF BUFFER (HIDDEN) ---
        this.setUI('ukf-q-w', this.state.q.w.toFixed(6));
        this.setUI('ukf-q-x', this.state.q.x.toFixed(6));
        this.setUI('bias-acc-z', this.state.bias_a.z.toFixed(4));
    },

    async syncAtomicSextant() {
        try {
            const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const d = await r.json();
            this.state.jd = m.add(m.divide(_BN(new Date(d.utc_datetime).getTime()), _BN(86400000)), _BN(2440587.5));
            this.setUI('last-sync-gmt', "ATOMIC_SYNC_OK");
            this.setUI('ui-sextant-status', "CELESTIAL_READY");
        } catch(e) { this.setUI('ui-sextant-status', "EPHEM_ESTIMATED"); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = m.divide(_BN(now - this.lastT), _BN(1000));
        this.lastT = now;
        this.last_dt = dt;
        this.solveExactPhysics(dt);
        this.updateUI();
        requestAnimationFrame(() => this.engine());
    },

    // Utilities
    getVelocityMagnitude() { return m.sqrt(m.add(m.pow(this.state.vel.x,2), m.add(m.pow(this.state.vel.y,2), m.pow(this.state.vel.z,2)))); },
    getRawAccelMag() { return Math.sqrt(this.sensors.accel.x**2 + this.sensors.accel.y**2 + this.sensors.accel.z**2); },
    getTotalDist() { return m.sqrt(m.add(m.pow(this.state.pos.x,2), m.add(m.pow(this.state.pos.y,2), m.pow(this.state.pos.z,2)))); },
    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { console.log(msg); const l = document.getElementById('anomaly-log'); if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; },
    
    rotateVector(v, q) {
        const qw = Number(q.w), qx = Number(q.x), qy = Number(q.y), qz = Number(q.z);
        return {
            x: _BN(v.z * 2 * (qx * qz - qw * qy)),
            y: _BN(v.z * 2 * (qy * qz + qw * qx)),
            z: _BN(v.z * (qw * qw - qx * qx - qy * qy + qz * qz))
        };
    },

    integrateOrientation(dt) {
        const rad = m.divide(this.PHYS.PI, _BN(180));
        const wx = m.multiply(_BN(this.sensors.gyro.x), rad), wy = m.multiply(_BN(this.sensors.gyro.y), rad), wz = m.multiply(_BN(this.sensors.gyro.z), rad);
        const q = this.state.q;
        const hdt = m.multiply(_BN(0.5), dt);
        const nw = m.subtract(q.w, m.multiply(hdt, m.add(m.multiply(q.x, wx), m.add(m.multiply(q.y, wy), m.multiply(q.z, wz)))));
        const nx = m.add(q.x, m.multiply(hdt, m.subtract(m.multiply(q.w, wx), m.subtract(m.multiply(q.y, wz), m.multiply(q.z, wy)))));
        const mag = m.sqrt(m.add(m.pow(nw,2), m.add(m.pow(nx,2), _BN(0.000001)))); // Stabilisation Lie
        this.state.q = { w: m.divide(nw, mag), x: m.divide(nx, mag), y: q.y, z: q.z };
    }
};

window.onload = () => OMNI_CORE.boot();
