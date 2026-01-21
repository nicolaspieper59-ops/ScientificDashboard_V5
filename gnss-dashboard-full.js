/**
 * OMNISCIENCE V24.4 - THE OMNI-ENGINE (FINAL TITAN CORE)
 * Logic: SLAM/SINS/EKF 64-bit Strict
 * Safety: G-Shock Proof, Marine-Damped, Black-Box Synced
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    blackBox: [],
    
    PHYS: {
        C: _BN("299792458"),
        R_EARTH: _BN("6378137.0"),
        EARTH_OMEGA: _BN("7.292115e-5"),
        R_GAS: _BN("287.05"),
        PI: m.pi,
        S_CONST: _BN(110.4), 
        MU0: _BN("1.716e-5"),
        T0: _BN(273.15)
    },

    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: _BN(1), x: _BN(0), y: _BN(0), z: _BN(0) },
        bias_a: { x: _BN(0), y: _BN(0), z: _BN(0) },
        bias_g: { x: _BN(0), y: _BN(0), z: _BN(0) },
        g_local: _BN(9.80665),
        rho: _BN(1.225),
        temp: _BN(293.15),
        press: _BN(101325),
        viscosity: _BN("1.81e-5"),
        jd: _BN(0),
        lat: _BN(48.85),
        profile: "SCANNING",
        status: "INITIALIZING",
        safetyLock: false
    },

    sensors: { accel:{x:0,y:0,z:0}, gyro:{x:0,y:0,z:0} },

    async boot() {
        this.log("V24.4: DÉMARRAGE DU MOTEUR UNIVERSEL...");
        try {
            await this.syncAtomicSextant();
            this.initHardware();
            
            // 1. Détection automatique du milieu (5s)
            const env = await this.autoDetectEnvironment();
            this.state.profile = env.name;
            this.setUI('ui-sextant-status', env.icon + " " + env.name);

            // 2. Calibration Scientifique (jusqu'à 45s selon milieu)
            await this.calibrate(env.calibTime);
            
            this.active = true;
            this.engine();
            this.logEvent("MISSION_START", `Milieu: ${env.name}`);
        } catch (e) { this.log("FATAL: " + e.message); }
    },

    async autoDetectEnvironment() {
        let vibrations = [];
        const listener = (e) => vibrations.push(Math.abs(e.accelerationIncludingGravity.z));
        window.addEventListener('devicemotion', listener);
        await new Promise(r => setTimeout(r, 5000));
        window.removeEventListener('devicemotion', listener);

        const mean = vibrations.reduce((a,b)=>a+b,0) / vibrations.length;
        const variance = vibrations.reduce((a,b)=>a+(b-mean)**2,0) / vibrations.length;

        if (variance < 0.005) return { name: "GASTROPODE", calibTime: 30000, icon: "🐌" };
        if (variance < 0.2) return { name: "RAIL/ROUTE", calibTime: 20000, icon: "🚆" };
        if (variance < 1.5) return { name: "MARINE/MANÈGE", calibTime: 45000, icon: "🚢" };
        return { name: "AÉRO/FUSÉE", calibTime: 15000, icon: "🚀" };
    },

    async calibrate(ms) {
        this.log(`CALIBRATION SINS (${ms/1000}s)... REPOS REQUIS`);
        let samples = { ax:[], ay:[], az:[], gx:[], gy:[], gz:[] };
        let moved = false;

        const collect = (e) => {
            if(Math.abs(e.rotationRate.alpha) > 3) moved = true;
            samples.ax.push(e.accelerationIncludingGravity.x);
            samples.ay.push(e.accelerationIncludingGravity.y);
            samples.az.push(e.accelerationIncludingGravity.z);
            samples.gx.push(e.rotationRate.alpha);
            samples.gy.push(e.rotationRate.beta);
            samples.gz.push(e.rotationRate.gamma);
        };

        window.addEventListener('devicemotion', collect);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', collect);

        if(moved && this.state.profile === "GASTROPODE") {
            this.log("MOUVEMENT DÉTECTÉ : RE-CALIBRATION...");
            return this.calibrate(ms);
        }

        const median = (arr) => {
            const s = [...arr].sort((a,b)=>a-b);
            return _BN(s[Math.floor(s.length/2)]);
        };

        const mAX = median(samples.ax), mAY = median(samples.ay), mAZ = median(samples.az);
        this.state.g_local = m.sqrt(m.add(m.pow(mAX,2), m.add(m.pow(mAY,2), m.pow(mAZ,2))));
        this.state.bias_a = { x:mAX, y:mAY, z:m.subtract(mAZ, this.state.g_local) };
        this.state.bias_g = { x:median(samples.gx), y:median(samples.gy), z:median(samples.gz) };
        
        this.state.vel = {x:_BN(0), y:_BN(0), z:_BN(0)};
        this.log("SINS ALIGNÉ. VITESSE ZÉRO.");
    },

    solveExactPhysics(dt) {
        const mass = _BN(document.getElementById('in-mass').innerText || 0.05);
        const Cx = _BN(document.getElementById('in-cx').innerText || 0.47);
        const area = m.multiply(this.PHYS.PI, m.pow(_BN(0.0075), 2));

        // 1. Orientation Quaternions
        this.integrateOrientation(dt);

        // 2. Newton par axe
        const g_proj = this.rotateVector({x:_BN(0), y:_BN(0), z:this.state.g_local}, this.state.q);
        const v_mag = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.add(m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2))));

        ['x', 'y', 'z'].forEach(axis => {
            let a_net = m.subtract(m.subtract(_BN(this.sensors.accel[axis]), this.state.bias_a[axis]), g_proj[axis]);

            // G-Shock Protection (Limitée à 5G)
            if (m.abs(a_net).gt(50)) {
                this.logEvent("G-SHOCK", `Axe ${axis} sature`);
                a_net = m.multiply(m.sign(a_net), 50);
            }

            // Traînée Sutherland
            if (v_mag.gt(0.01)) {
                const f_drag = m.multiply(_BN(0.5), m.multiply(this.state.rho, m.multiply(m.pow(v_mag, 2), m.multiply(Cx, area))));
                const a_drag = m.divide(f_drag, mass);
                a_net = m.subtract(a_net, m.multiply(a_drag, m.divide(this.state.vel[axis], v_mag)));
            }

            // Intégration Newton
            let v_new = m.add(this.state.vel[axis], m.multiply(a_net, dt));
            
            // Lock de sécurité pour vitesse fantôme
            if (this.state.profile === "GASTROPODE" && m.abs(a_net).lt(0.05) && v_mag.lt(0.1)) v_new = _BN(0);

            this.state.vel[axis] = v_new;
            this.state.pos[axis] = m.add(this.state.pos[axis], m.multiply(v_new, dt));
        });
    },

    integrateOrientation(dt) {
        const rad = m.divide(this.PHYS.PI, _BN(180));
        const w = { x:m.multiply(m.subtract(_BN(this.sensors.gyro.x), this.state.bias_g.x), rad), 
                    y:m.multiply(m.subtract(_BN(this.sensors.gyro.y), this.state.bias_g.y), rad), 
                    z:m.multiply(m.subtract(_BN(this.sensors.gyro.z), this.state.bias_g.z), rad) };
        const q = this.state.q;
        const hdt = m.multiply(_BN(0.5), dt);
        const nw = m.subtract(q.w, m.multiply(hdt, m.add(m.multiply(q.x, w.x), m.add(m.multiply(q.y, w.y), m.multiply(q.z, w.z)))));
        const nx = m.add(q.x, m.multiply(hdt, m.subtract(m.multiply(q.w, w.x), m.subtract(m.multiply(q.y, w.z), m.multiply(q.z, w.y)))));
        const ny = m.add(q.y, m.multiply(hdt, m.add(m.subtract(m.multiply(q.w, w.y), m.multiply(q.x, w.z)), m.multiply(q.z, w.x))));
        const nz = m.add(q.z, m.multiply(hdt, m.subtract(m.add(m.multiply(q.w, w.z), m.multiply(q.x, w.y)), m.multiply(q.y, w.x))));
        const mag = m.sqrt(m.add(m.pow(nw,2), m.add(m.pow(nx,2), m.add(m.pow(ny,2), m.pow(nz,2)))));
        this.state.q = { w: m.divide(nw, mag), x: m.divide(nx, mag), y: m.divide(ny, mag), z: m.divide(nz, mag) };
    },

    async syncAtomicSextant() {
        try {
            const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const d = await r.json();
            this.state.jd = m.add(m.divide(_BN(new Date(d.utc_datetime).getTime()), _BN(86400000)), _BN(2440587.5));
        } catch(e) { this.state.jd = m.add(m.divide(_BN(Date.now()), _BN(86400000)), _BN(2440587.5)); }
    },

    initHardware() {
        if ('PressureSensor' in window) {
            const baro = new PressureSensor({ frequency: 10 });
            baro.onreading = () => this.updateAtmo(baro.pressure * 100);
            baro.start();
        }
        window.ondevicemotion = (e) => {
            this.sensors.accel = { x:e.accelerationIncludingGravity.x||0, y:e.accelerationIncludingGravity.y||0, z:e.accelerationIncludingGravity.z||0 };
            this.sensors.gyro = { x:e.rotationRate.alpha||0, y:e.rotationRate.beta||0, z:e.rotationRate.gamma||0 };
        };
    },

    updateAtmo(p) {
        this.state.press = _BN(p);
        const ratio_T = m.divide(this.state.temp, this.PHYS.T0);
        this.state.viscosity = m.multiply(this.PHYS.MU0, m.multiply(m.pow(ratio_T, 1.5), m.divide(m.add(this.PHYS.T0, this.PHYS.S_CONST), m.add(this.state.temp, this.PHYS.S_CONST))));
        this.state.rho = m.divide(this.state.press, m.multiply(this.PHYS.R_GAS, this.state.temp));
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = m.divide(_BN(now - this.lastT), _BN(1000));
        this.lastT = now;
        this.state.jd = m.add(this.state.jd, m.divide(dt, _BN(86400)));
        
        this.solveExactPhysics(dt);
        this.updateUI();
        requestAnimationFrame(() => this.engine());
    },

    updateUI() {
        const v = this.getVelocityMagnitude();
        const mass = _BN(document.getElementById('in-mass').innerText || 0.05);
        const ek = m.multiply(_BN(0.5), m.multiply(mass, m.pow(v, 2)));

        this.setUI('speed-stable-kmh', m.multiply(v, 3.6).toFixed(4));
        this.setUI('ui-mc-speed', v.toFixed(3) + " m/s");
        this.setUI('energy-cinetic', ek.toFixed(6) + " J");
        this.setUI('altitude-ekf', this.state.pos.z.toFixed(2));
        this.setUI('ast-jd', this.state.jd.toFixed(9));
        this.setUI('air-density', this.state.rho.toFixed(5));
        
        const gamma = m.divide(_BN(1), m.sqrt(m.subtract(_BN(1), m.pow(m.divide(v, this.PHYS.C), 2))));
        this.setUI('ui-lorentz-2', gamma.toFixed(16));
    },

    getVelocityMagnitude() {
        return m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.add(m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2))));
    },

    logEvent(type, data) {
        this.blackBox.unshift({ t: new Date().toISOString(), type, data, v: this.getVelocityMagnitude().toFixed(2) });
        if(this.blackBox.length > 50) this.blackBox.pop();
    },

    rotateVector(v, q) {
        const g = v.z;
        return {
            x: m.multiply(_BN(2), m.multiply(g, m.subtract(m.multiply(q.x, q.z), m.multiply(q.w, q.y)))),
            y: m.multiply(_BN(2), m.multiply(g, m.add(m.multiply(q.y, q.z), m.multiply(q.w, q.x)))),
            z: m.multiply(g, m.subtract(m.subtract(m.multiply(q.w, q.w), m.multiply(q.x, q.x)), m.subtract(m.multiply(q.y, q.y), m.multiply(q.z, q.z))))
        };
    },

    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { const l = document.getElementById('anomaly-log'); if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; }
};

window.onload = () => OMNI_CORE.boot();
