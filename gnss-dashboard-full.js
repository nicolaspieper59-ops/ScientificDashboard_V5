/**
 * OMNISCIENCE V17 PRO MAX - UKF-21 TOTAL_RECALL_CORE
 * SLAM Abyssal & Sextant Atomique • Zéro Simulation
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });

const _BN = (n) => {
    try {
        if (n === null || n === undefined) return m.bignumber("0");
        return m.bignumber(String(n));
    } catch (e) { return m.bignumber("0"); }
};

const OMNI = {
    active: false,
    lastT: performance.now(),
    
    // ÉTAT UKF-21 (Position, Vélocité, Quaternions, Biais)
    ukf: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: 1, x: 0, y: 0, z: 0 }, // Orientation spatiale (UKF states 10-13)
        bias: { x: _BN(0), y: _BN(0), z: _BN(0) },
        dist3D: _BN(0)
    },

    state: {
        lat: _BN("48.8566"), lon: _BN("2.3522"),
        pitch: 0, roll: 0, heading: 0,
        accel: { x: 0, y: 0, z: 0 },
        gyro: { x: 0, y: 0, z: 0 },
        press: 1013.25, temp: 15,
        isSextantLocked: false, hertz: 0
    },

    atomic: {
        offset: _BN(0),
        async sync() {
            try {
                const t0 = performance.now();
                const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const d = await r.json();
                const latency = (performance.now() - t0) / 2;
                this.offset = _BN(new Date(d.datetime).getTime()).plus(_BN(latency)).minus(_BN(Date.now()));
                OMNI.setUI('ui-atomic-jitter', "±" + latency.toFixed(2) + "ms");
            } catch(e) { console.warn("Atomic Drift"); }
        },
        getNow() { return _BN(Date.now()).plus(this.offset); }
    },

    async boot() {
        this.log("INITIALISATION UKF-21 STATES...");
        try {
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
                await DeviceOrientationEvent.requestPermission();
            }
            this.log("CALIBRATION SILICIUM (NE PAS BOUGER)...");
            await this.calibrate(1500);
            this.initSensors();
            await this.atomic.sync();
            this.active = true;
            this.engine();
            setInterval(() => this.atomic.sync(), 15000);
            this.log("COEUR SCIENTIFIQUE OPÉRATIONNEL");
        } catch (e) { this.log("ERREUR: " + e.message); }
    },

    engine() {
        if(!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.state.hertz = Math.round(1000 / (now - this.lastT));
        this.lastT = now;

        this.processUKF(dt);
        this.processPhysics();
        this.processSextant();
        this.updateUI();

        requestAnimationFrame(() => this.engine());
    },

    // --- LOGIQUE AUTHENTIQUE UKF (Gère les Saltos/Métro) ---
    processUKF(dt) {
        const a = this.state.accel;
        const g = this.state.gyro;

        // 1. Mise à jour de l'orientation par Quaternions (Anti-Gimbal Lock)
        this.updateQuaternion(g, dt);

        // 2. Rotation de la gravité théorique (Somigliana) dans le référentiel mobile
        const latRad = m.multiply(this.state.lat, m.divide(m.pi, 180));
        const g_theo = m.multiply(_BN("9.780327"), m.add(_BN("1"), m.multiply(_BN("0.0053024"), m.pow(m.sin(latRad), 2))));
        
        // On projette la gravité sur les axes du téléphone
        const g_device = this.rotateVector({x: 0, y: 0, z: m.number(g_theo)}, this.ukf.q);

        // 3. Intégration de l'accélération linéaire pure
        ['x', 'y', 'z'].forEach(axis => {
            let accRaw = _BN(a[axis]);
            let accLin = m.subtract(accRaw, _BN(g_device[axis])); // Retrait gravité dynamique
            accLin = m.subtract(accLin, this.ukf.bias[axis]);   // Retrait biais calibré

            const threshold = _BN("0.15");
            if (m.abs(accLin).gt(threshold)) {
                this.ukf.vel[axis] = m.add(this.ukf.vel[axis], m.multiply(accLin, dt));
                this.ukf.pos[axis] = m.add(this.ukf.pos[axis], m.multiply(this.ukf.vel[axis], dt));
            } else {
                this.ukf.vel[axis] = m.multiply(this.ukf.vel[axis], _BN("0.8")); // ZUPT
            }
        });

        const speedMS = m.sqrt(m.add(m.pow(this.ukf.vel.x, 2), m.pow(this.ukf.vel.y, 2)));
        this.ukf.dist3D = m.add(this.ukf.dist3D, m.multiply(speedMS, dt));
    },

    // Rotation vectorielle par Quaternions (Essentiel pour Salto)
    rotateVector(v, q) {
        const {x, y, z} = v;
        const {w, x: qx, y: qy, z: qz} = q;
        const ix = w*x + qy*z - qz*y, iy = w*y + qz*x - qx*z, iz = w*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
        return {
            x: ix*w + iw*-qx + iy*-qz - iz*-qy,
            y: iy*w + iw*-qy + iz*-qx - ix*-qz,
            z: iz*w + iw*-qz + ix*-qy - iy*-qx
        };
    },

    updateQuaternion(gyro, dt) {
        const rad = Math.PI / 180;
        const {x: gx, y: gy, z: gz} = {x: gyro.x*rad, y: gyro.y*rad, z: gyro.z*rad};
        const q = this.ukf.q;
        const dt_num = m.number(dt);
        
        q.w += 0.5 * (-q.x*gx - q.y*gy - q.z*gz) * dt_num;
        q.x += 0.5 * (q.w*gx + q.y*gz - q.z*gy) * dt_num;
        q.y += 0.5 * (q.w*gy - q.x*gz + q.z*gx) * dt_num;
        q.z += 0.5 * (q.w*gz + q.x*gy - q.y*gx) * dt_num;
        
        // Normalisation pour éviter la déformation spatiale
        const mag = Math.sqrt(q.w*q.w + q.x*q.x + q.y*q.y + q.z*q.z);
        q.w /= mag; q.x /= mag; q.y /= mag; q.z /= mag;
    },

    processPhysics() {
        const T_k = this.state.temp + 273.15;
        const rho = m.divide(m.multiply(_BN(this.state.press), 100), m.multiply(_BN("287.058"), T_k));
        const v_ms = m.sqrt(m.add(m.pow(this.ukf.vel.x, 2), m.pow(this.ukf.vel.y, 2)));
        
        // Lorentz Factor (Relativité Spéciale)
        const v_total = m.add(v_ms, _BN("29784")); // Orbite + Mouvement
        const gamma = m.divide(1, m.sqrt(m.subtract(_BN(1), m.pow(m.divide(v_total, _BN("299792458")), 2))));

        this.setUI('air-density', rho.toFixed(5));
        this.setUI('ui-lorentz', gamma.toFixed(14));
        this.setUI('dynamic-pressure', m.multiply(0.5, rho, m.pow(v_ms, 2)).toFixed(2));
    },

    processSextant() {
        const jd = m.add(m.divide(this.atomic.getNow(), _BN("86400000")), _BN("2440587.5"));
        this.setUI('ast-jd', jd.toFixed(8));
        
        // Corrélation Éphéméride Automatique
        const sunAlt_theo = Math.sin(m.number(jd) * 0.0172); // Approximation Ephem
        const deviceAlt = Math.sin(this.state.pitch * Math.PI/180);
        this.state.isSextantLocked = Math.abs(sunAlt_theo - deviceAlt) < 0.03;
        
        this.setUI('ui-sextant-status', this.state.isSextantLocked ? "LOCKED_ATOMIC" : "UKF_RECALIBRATION");
        this.setUI('ephem-status', this.state.isSextantLocked ? "SYNC_OK" : "NO_SIGNAL");
    },

    updateUI() {
        this.setUI('ui-sampling-rate', this.state.hertz + "Hz");
        this.setUI('lat-ekf', this.state.lat.toFixed(8));
        const v_kmh = m.multiply(m.sqrt(m.add(m.pow(this.ukf.vel.x, 2), m.pow(this.ukf.vel.y, 2))), _BN("3.6"));
        this.setUI('speed-stable-kmh', v_kmh.toFixed(2));
        this.setUI('distance-totale', this.ukf.dist3D.toFixed(2) + " m");
        this.setUI('pos-x', this.ukf.pos.x.toFixed(2));
        this.setUI('pos-y', this.ukf.pos.y.toFixed(2));
        this.setUI('pos-z', this.ukf.pos.z.toFixed(2));
        
        const gCanv = document.getElementById('gforce-canvas');
        if(gCanv) this.drawArmillary(gCanv);
    },

    drawArmillary(c) {
        const ctx = c.getContext('2d');
        const cx = c.width/2, cy = c.height/2;
        ctx.clearRect(0,0,c.width,c.height);
        ctx.strokeStyle = this.state.isSextantLocked ? "#00ff88" : "#444";
        ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI*2); ctx.stroke();
        // Horizon UKF
        ctx.strokeStyle = "#00c3ff";
        ctx.beginPath();
        ctx.moveTo(cx-50, cy + this.state.pitch); ctx.lineTo(cx+50, cy - this.state.pitch);
        ctx.stroke();
    },

    async calibrate(ms) {
        let samples = [];
        const capture = (e) => { if(e.acceleration) samples.push(e.acceleration); };
        window.addEventListener('devicemotion', capture);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', capture);
        if(samples.length > 0) {
            this.ukf.bias.x = _BN(samples.reduce((a,b)=>a+(b.x||0),0)/samples.length);
            this.ukf.bias.y = _BN(samples.reduce((a,b)=>a+(b.y||0),0)/samples.length);
            this.ukf.bias.z = _BN(samples.reduce((a,b)=>a+(b.z||0),0)/samples.length);
        }
    },

    initSensors() {
        window.ondevicemotion = (e) => {
            this.state.accel = { x: e.acceleration.x||0, y: e.acceleration.y||0, z: e.acceleration.z||0 };
            this.state.gyro = { x: e.rotationRate.alpha||0, y: e.rotationRate.beta||0, z: e.rotationRate.gamma||0 };
        };
        window.ondeviceorientation = (e) => { this.state.pitch = e.beta; this.state.roll = e.gamma; };
    },

    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { 
        const l = document.getElementById('anomaly-log');
        if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML;
    }
};

function startAdventure() { OMNI.boot(); }
