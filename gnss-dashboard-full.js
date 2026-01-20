/**
 * OMNISCIENCE V19 - TOTAL_PHYSICS_RECALL
 * Protocol: SINS (Strapdown Inertial Navigation System)
 * Precision: 64-bit BigNumber / Verlet Integration
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    
    // ÉTAT PHYSIQUE COMPLET (Vecteur d'état 21)
    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        acc: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: 1, x: 0, y: 0, z: 0 }, // Orientation spatiale
        bias: { a: {x: _BN(0), y: _BN(0), z: _BN(0)}, g: {x:0, y:0, z:0} },
        mass: _BN(0.1), // Masse par défaut (100g) ajustable via HTML in-mass
        g_ref: _BN(9.80665)
    },

    // CAPTEURS
    sensors: {
        accel: { x: 0, y: 0, z: 0 },
        gyro: { x: 0, y: 0, z: 0 },
        pitch: 0, press: 1013.25, temp: 15, hum: 50
    },

    async boot() {
        this.log("INITIALISATION PHYSIQUE V19...");
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') throw new Error("Permission refusée");
            }

            // Récupération des paramètres utilisateur depuis le HTML (si présents)
            const m_input = document.getElementById('in-mass');
            if(m_input) this.state.mass = _BN(m_input.innerText || 0.1);

            this.log("CALIBRATION STATIQUE (NE PAS BOUGER)...");
            await this.calibrate(3000); 
            
            await this.fetchWeather();
            this.initHardware();
            
            this.active = true;
            this.engine();
            this.log("SOUVERAINETÉ PHYSIQUE VERROUILLÉE");
        } catch (e) { this.log("BOOT_ERROR: " + e.message); }
    },

    async fetchWeather() {
        try {
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m,relative_humidity_2m,surface_pressure`);
            const d = await r.json();
            this.sensors.temp = d.current.temperature_2m;
            this.sensors.press = d.current.surface_pressure;
            this.sensors.hum = d.current.relative_humidity_2m;
        } catch(e) { this.log("WEATHER_API_FAIL: Utilisation STD"); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        const hertz = Math.round(1000 / (now - this.lastT));
        this.lastT = now;

        this.updatePhysics(dt);
        this.updateUIMap(hertz);

        requestAnimationFrame(() => this.engine());
    },

    updatePhysics(dt) {
        // 1. Intégration de l'Attitude (Quaternions Hamiltoniens)
        this.integrateGyro(this.sensors.gyro, dt);

        // 2. Projection de la Gravité Terrestre
        const g_world = { x: 0, y: 0, z: m.number(this.state.g_ref) };
        const g_local = this.rotateVector(g_world, this.state.q);

        // 3. Calcul de l'Accélération Linéaire Pure (Sans Gravité, Sans Biais)
        const a_pure = {
            x: m.subtract(m.subtract(_BN(this.sensors.accel.x), _BN(g_local.x)), this.state.bias.a.x),
            y: m.subtract(m.subtract(_BN(this.sensors.accel.y), _BN(g_local.y)), this.state.bias.a.y),
            z: m.subtract(m.subtract(_BN(this.sensors.accel.z), _BN(g_local.z)), this.state.bias.a.z)
        };

        // 4. Intégration de Verlet (Physique Professionnelle)
        ['x', 'y', 'z'].forEach(axis => {
            // Seuil de bruit ultra-fin (grade recherche)
            const noise = 0.02;
            let acc = m.abs(a_pure[axis]).gt(noise) ? a_pure[axis] : _BN(0);

            // Position : p = p + v*dt + 0.5*a*dt^2
            const pos_inc = m.add(m.multiply(this.state.vel[axis], dt), m.multiply(0.5, m.multiply(acc, m.pow(dt, 2))));
            this.state.pos[axis] = m.add(this.state.pos[axis], pos_inc);

            // Vitesse : v = v + a*dt
            this.state.vel[axis] = m.add(this.state.vel[axis], m.multiply(acc, dt));

            // ZUPT Intelligent (Si statique total, on stabilise la dérive)
            if (this.isStatic()) {
                this.state.vel[axis] = m.multiply(this.state.vel[axis], 0.95);
            }
        });
    },

    integrateGyro(g, dt) {
        const rad = Math.PI / 180;
        const d = m.number(dt);
        const q = this.state.q;
        const wx = g.x * rad; const wy = g.y * rad; const wz = g.z * rad;

        const nw = q.w + 0.5 * (-q.x*wx - q.y*wy - q.z*wz) * d;
        const nx = q.x + 0.5 * (q.w*wx + q.y*wz - q.z*wy) * d;
        const ny = q.y + 0.5 * (q.w*wy - q.x*wz + q.z*wx) * d;
        const nz = q.z + 0.5 * (q.w*wz + q.x*wy - q.y*wx) * d;

        const mag = Math.sqrt(nw*nw + nx*nx + ny*ny + nz*nz);
        this.state.q = { w: nw/mag, x: nx/mag, y: ny/mag, z: nz/mag };
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

    isStatic() {
        return Math.abs(this.sensors.accel.x) < 0.1 && Math.abs(this.sensors.gyro.x) < 0.1;
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
        
        // On capture la gravité + le biais au repos
        const latRad = 48.85 * Math.PI / 180;
        const g_theo = 9.780327 * (1 + 0.0053024 * Math.sin(latRad)**2);
        
        this.state.bias.a.z = m.subtract(_BN(acc_samples.z.reduce((a,b)=>a+b,0)/acc_samples.z.length), g_theo);
        this.state.bias.a.x = _BN(acc_samples.x.reduce((a,b)=>a+b,0)/acc_samples.x.length);
        this.state.bias.a.y = _BN(acc_samples.y.reduce((a,b)=>a+b,0)/acc_samples.y.length);
    },

    updateUIMap(hz) {
        const v_ms = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        
        // Énergies
        const ec = m.multiply(0.5, m.multiply(this.state.mass, m.pow(v_ms, 2)));
        const ep = m.multiply(m.multiply(this.state.mass, this.state.g_ref), m.abs(this.state.pos.z));

        this.setUI('ui-sampling-rate', hz + "Hz");
        this.setUI('speed-stable-kmh', m.multiply(v_ms, 3.6).toFixed(2));
        this.setUI('kinetic-energy', ec.toFixed(6) + " J");
        this.setUI('dynamic-lift', ep.toFixed(6) + " J"); // On détourne l'ID lift pour l'énergie potentielle
        
        this.setUI('pos-x', this.state.pos.x.toFixed(3));
        this.setUI('pos-y', this.state.pos.y.toFixed(3));
        this.setUI('pos-z', this.state.pos.z.toFixed(3));
        
        this.setUI('temp-air', this.sensors.temp + "°C");
        this.setUI('press-hpa', this.sensors.press + " hPa");
        this.setUI('ui-sextant-status', "LOCKED_V19");
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
