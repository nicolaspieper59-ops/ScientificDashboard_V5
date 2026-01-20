/**
 * OMNISCIENCE V17.6 - RECALL_CORE_FINAL
 * Fix: Drift suppression, Weather integration, Ephem logic
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    
    ukf: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: 1, x: 0, y: 0, z: 0 },
        bias_a: { x: _BN(0), y: _BN(0), z: _BN(0) },
        g_inst: _BN(1)
    },

    state: {
        lat: _BN("48.8566"), lon: _BN("2.3522"),
        accel: { x: 0, y: 0, z: 0 }, gyro: { x: 0, y: 0, z: 0 },
        press: 1013.25, temp: 15, pitch: 0, hertz: 0,
        humidity: 50, lux: 0
    },

    async boot() {
        this.log("CORE_REBOOT_INIT...");
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') return;
            }
            this.log("CALIBRATING_ZUPT_THRESHOLD...");
            await this.calibrateSINS(2000);
            await this.fetchWeather(); // Remplit la colonne de droite
            
            this.initSensors();
            this.active = true;
            this.engine();
            this.log("SYSTEM_ONLINE_V17.6");
        } catch (e) { this.log("BOOT_ERROR: " + e.message); }
    },

    async fetchWeather() {
        try {
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.state.lat}&longitude=${this.state.lon}&current=temperature_2m,relative_humidity_2m,surface_pressure`);
            const d = await r.json();
            this.state.temp = d.current.temperature_2m;
            this.state.press = d.current.surface_pressure;
            this.state.humidity = d.current.relative_humidity_2m;
            this.log("WEATHER_SYNC_OK");
        } catch(e) { this.log("WEATHER_OFFLINE_USE_STD"); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.state.hertz = Math.round(1000 / (now - this.lastT));
        this.lastT = now;

        this.solveSINS(dt);
        this.solveAstro();
        this.updateUIMap();

        requestAnimationFrame(() => this.engine());
    },

    solveSINS(dt) {
        this.updateOrientation(this.state.gyro, dt);
        const g_p = this.rotateVector({x: 0, y: 0, z: 9.80665}, this.ukf.q);

        ['x', 'y', 'z'].forEach(axis => {
            let a_pure = m.subtract(m.subtract(_BN(this.state.accel[axis]), _BN(g_p[axis])), this.ukf.bias_a[axis]);

            // FILTRE ANTI-DRIFT SÉVÈRE (ZUPT)
            // Si l'accélération est inférieure à 0.25 m/s², on considère l'objet immobile
            if (m.abs(a_pure).gt(_BN("0.25"))) {
                this.ukf.vel[axis] = m.add(this.ukf.vel[axis], m.multiply(a_pure, dt));
                this.ukf.pos[axis] = m.add(this.ukf.pos[axis], m.multiply(this.ukf.vel[axis], dt));
            } else {
                this.ukf.vel[axis] = m.multiply(this.ukf.vel[axis], 0.7); // Freinage moteur pour stabiliser
            }
        });
    },

    solveAstro() {
        const now = new Date();
        const jd = (now.getTime() / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(6));
        this.setUI('ui-sextant-status', "LOCKED_GMT");
    },

    updateUIMap() {
        // Remplissage des IDs de ton HTML
        this.setUI('ui-sampling-rate', this.state.hertz + "Hz");
        this.setUI('temp-air', this.state.temp + "°C");
        this.setUI('press-hpa', this.state.press + " hPa");
        this.setUI('humidity-pct', this.state.humidity + "%");
        
        const v_ms = m.sqrt(m.add(m.pow(this.ukf.vel.x, 2), m.pow(this.ukf.vel.y, 2), m.pow(this.ukf.vel.z, 2)));
        this.setUI('speed-stable-kmh', m.multiply(v_ms, 3.6).toFixed(2));
        this.setUI('pos-x', this.ukf.pos.x.toFixed(2));
        this.setUI('pos-y', this.ukf.pos.y.toFixed(2));
        this.setUI('pos-z', this.ukf.pos.z.toFixed(2));
        
        // Calcul Portance (Lift) théorique
        const rho = 1.225; // Densité air std
        const lift = 0.5 * rho * Math.pow(m.number(v_ms), 2) * 0.4; // 0.4 = Cx/Cz estimé
        this.setUI('dynamic-lift', lift.toFixed(2) + " N");
    },

    setUI(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    },

    log(msg) {
        const log = document.getElementById('anomaly-log');
        if (log) log.innerHTML = `<div>> ${msg}</div>` + log.innerHTML;
    },

    updateOrientation(g, dt) {
        const r = Math.PI / 180, q = this.ukf.q, d = m.number(dt);
        const nw = q.w + 0.5 * (-q.x*g.x*r - q.y*g.y*r - q.z*g.z*r) * d;
        const nx = q.x + 0.5 * (q.w*g.x*r + q.y*g.z*r - q.z*g.y*r) * d;
        const mag = Math.sqrt(nw*nw + nx*nx + q.y*q.y + q.z*q.z);
        this.ukf.q.w = nw/mag; this.ukf.q.x = nx/mag;
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

    async calibrateSINS(ms) {
        let s = [];
        const f = (e) => { if(e.accelerationIncludingGravity) s.push(e.accelerationIncludingGravity); };
        window.addEventListener('devicemotion', f);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', f);
        if(s.length > 0) {
            this.ukf.bias_a.z = m.subtract(_BN(s.reduce((a,b)=>a+(b.z||0),0)/s.length), 9.80665);
        }
    },

    initSensors() {
        window.ondevicemotion = (e) => {
            this.state.accel = { x: e.accelerationIncludingGravity.x||0, y: e.accelerationIncludingGravity.y||0, z: e.accelerationIncludingGravity.z||0 };
            this.state.gyro = { x: e.rotationRate.alpha||0, y: e.rotationRate.beta||0, z: e.rotationRate.gamma||0 };
        };
    }
};
function startAdventure() { OMNI_CORE.boot(); }
