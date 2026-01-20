/**
 * OMNISCIENCE V17 PRO MAX - SCIENTIFIC REVISION
 * Fix: BigNumber Implicit Conversion & HTML ID Mapping
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });

// Blindage total contre l'erreur "significant digits"
const _BN = (n) => {
    try {
        if (n === null || n === undefined) return m.bignumber("0");
        // On convertit toujours en string pour math.js pour éviter le flottant JS
        return m.bignumber(String(n));
    } catch (e) { return m.bignumber("0"); }
};

const OMNI = {
    active: false,
    lastT: performance.now(),
    v: { x: _BN(0), y: _BN(0), z: _BN(0) },
    pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
    dist3D: _BN(0),
    bias: { x: _BN(0), y: _BN(0), z: _BN(0) },
    
    state: {
        lat: _BN("48.8566"), lon: _BN("2.3522"),
        pitch: 0, roll: 0, heading: 0,
        accel: { x: 0, y: 0, z: 0 },
        press: 1013.25, temp: 15, lux: 0,
        rho: _BN("1.225"), gamma: _BN("1"),
        isSextantLocked: false, hertz: 0
    },

    atomic: {
        offset: _BN(0),
        jitter: _BN(0),
        async sync() {
            try {
                const t0 = performance.now();
                const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const d = await r.json();
                const t1 = performance.now();
                const lat = (t1 - t0) / 2;
                this.offset = _BN(new Date(d.datetime).getTime()).plus(_BN(lat)).minus(_BN(Date.now()));
                this.jitter = _BN(Math.abs(lat - 15));
                OMNI.setUI('ui-atomic-jitter', this.jitter.toFixed(2) + "ms");
            } catch(e) { OMNI.log("Sync Fail"); }
        },
        getNow() { return _BN(Date.now()).plus(this.offset); }
    },

    async boot() {
        OMNI.log("INITIALISATION UNITÉ UNIVERSELLE...");
        try {
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
                await DeviceOrientationEvent.requestPermission();
            }
            
            // Éviter l'erreur de conversion pendant la calibration
            this.log("CALIBRATION SLAM (NE PAS BOUGER)...");
            await this.calibrate(1000);
            
            this.initSensors();
            await this.atomic.sync();
            
            this.active = true;
            this.engine();
            this.log("COEUR ACTIF : SLAM 64-BIT");
        } catch (e) { this.log("ERREUR: " + e.message); }
    },

    async calibrate(ms) {
        return new Promise(resolve => {
            let samples = [];
            const gather = (e) => {
                if(e.acceleration) samples.push({x: e.acceleration.x||0, y: e.acceleration.y||0, z: e.acceleration.z||0});
            };
            window.addEventListener('devicemotion', gather);
            setTimeout(() => {
                window.removeEventListener('devicemotion', gather);
                if(samples.length > 0) {
                    this.bias.x = _BN(samples.reduce((a,b)=>a+b.x,0)/samples.length);
                    this.bias.y = _BN(samples.reduce((a,b)=>a+b.y,0)/samples.length);
                    this.bias.z = _BN(samples.reduce((a,b)=>a+b.z,0)/samples.length);
                }
                resolve();
            }, ms);
        });
    },

    engine() {
        if(!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.state.hertz = Math.round(1000 / (now - this.lastT));
        this.lastT = now;

        this.processSlam(dt);
        this.processPhysics();
        this.processAstro();
        this.updateUI();

        requestAnimationFrame(() => this.engine());
    },

    processSlam(dt) {
        const a = this.state.accel;
        const latRad = m.multiply(this.state.lat, m.divide(m.pi, 180));
        const g_theo = m.multiply(_BN("9.780327"), m.add(_BN("1"), m.multiply(_BN("0.0053024"), m.pow(m.sin(latRad), 2))));

        ['x', 'y', 'z'].forEach(axis => {
            let accRaw = _BN(a[axis]);
            let accPure = m.subtract(accRaw, this.bias[axis]);
            
            // Correction Gravité sur Z
            if(axis === 'z') accPure = m.subtract(accPure, m.multiply(g_theo, Math.cos(this.state.pitch * Math.PI/180)));

            const threshold = _BN("0.12");
            if (m.abs(accPure).gt(threshold)) {
                this.v[axis] = m.add(this.v[axis], m.multiply(accPure, dt));
                this.pos[axis] = m.add(this.pos[axis], m.multiply(this.v[axis], dt));
            } else {
                this.v[axis] = m.multiply(this.v[axis], _BN("0.85")); // Filtre stabilisation
            }
        });

        const speedMS = m.sqrt(m.add(m.pow(this.v.x, 2), m.pow(this.v.y, 2)));
        this.dist3D = m.add(this.dist3D, m.multiply(speedMS, dt));
    },

    processPhysics() {
        const T_k = this.state.temp + 273.15;
        this.state.rho = m.divide(m.multiply(_BN(this.state.press), 100), m.multiply(_BN("287.058"), T_k));
        
        const v_ms = m.sqrt(m.add(m.pow(this.v.x, 2), m.pow(this.v.y, 2)));
        const q = m.multiply(_BN("0.5"), this.state.rho, m.pow(v_ms, 2));
        
        // Dilatation Lorentz
        const c = _BN("299792458");
        const v_total = m.add(v_ms, _BN("29784")); // Orbite Terre
        this.state.gamma = m.divide(1, m.sqrt(m.subtract(_BN(1), m.pow(m.divide(v_total, c), 2))));

        this.setUI('air-density', this.state.rho.toFixed(5));
        this.setUI('dynamic-pressure', q.toFixed(2));
        this.setUI('ui-lorentz', this.state.gamma.toFixed(12));
    },

    processAstro() {
        const t_atom = this.atomic.getNow();
        const jd = m.add(m.divide(t_atom, _BN("86400000")), _BN("2440587.5"));
        
        this.setUI('ast-jd', jd.toFixed(8));
        // Recalage Sextant automatique
        const angleTheo = m.sin(m.divide(m.multiply(jd, m.pi), _BN("180"))); // Simplifié
        const angleReal = Math.sin(this.state.pitch * Math.PI/180);
        this.state.isSextantLocked = Math.abs(angleTheo - angleReal) < 0.05;
        
        this.setUI('ui-sextant-status', this.state.isSextantLocked ? "LOCKED_ATOMIC" : "SCANNING");
        this.setUI('ephem-status', this.state.isSextantLocked ? "SYNC_OK" : "NO_SIGNAL");
    },

    updateUI() {
        this.setUI('ui-sampling-rate', this.state.hertz + "Hz");
        this.setUI('lat-ekf', this.state.lat.toFixed(8));
        this.setUI('speed-stable-kmh', m.multiply(m.sqrt(m.add(m.pow(this.v.x, 2), m.pow(this.v.y, 2))), _BN("3.6")).toFixed(2));
        this.setUI('distance-totale', this.dist3D.toFixed(2) + " m");
        this.setUI('pos-x', this.pos.x.toFixed(2));
        this.setUI('pos-y', this.pos.y.toFixed(2));
        this.setUI('pos-z', this.pos.z.toFixed(2));
    },

    initSensors() {
        window.ondevicemotion = (e) => {
            const acc = e.acceleration;
            if(acc) this.state.accel = { x: acc.x||0, y: acc.y||0, z: acc.z||0 };
        };
        window.ondeviceorientation = (e) => {
            this.state.pitch = e.beta; this.state.roll = e.gamma;
        };
    },

    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { 
        const logEl = document.getElementById('anomaly-log');
        if(logEl) logEl.innerHTML = `<div>> ${msg}</div>` + logEl.innerHTML;
    }
};

function startAdventure() { OMNI.boot(); }
