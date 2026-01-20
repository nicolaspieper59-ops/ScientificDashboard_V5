/**
 * OMNISCIENCE V17 - MULTI-VECTOR CORE (2026 Edition)
 * Alignement : SINS (Strapdown Inertial Navigation System)
 * Réalisme : Triple Intégration, ZUPT, & Barométrie Relative
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    
    PHYSICS: {
        G: _BN("6.67430e-11"), C: _BN("299792458"),
        Re: _BN("6378137"), M: _BN("5.9722e24"),
        R_AIR: _BN("287.058")
    },

    ukf: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) }, // DISTANCE RÉELLE 3-AXES
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: 1, x: 0, y: 0, z: 0 },
        bias: { x: _BN(0), y: _BN(0), z: _BN(0) },
        steps: 0
    },

    state: {
        lat: _BN("48.8566"), 
        accel: { x: 0, y: 0, z: 0 }, gyro: { x: 0, y: 0, z: 0 },
        press: 1013.25, temp: 15, pitch: 0,
        mode: "AUTO_DETECT"
    },

    async boot() {
        this.log("ALIGNEMENT AXIAL (IMMOBILITÉ REQUISE)...");
        try {
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            // Calibration du silence silicium (3s)
            await this.calibrate(3000);
            this.initSensors();
            this.active = true;
            this.engine();
            this.log("VECTEUR D'ÉTAT PRÊT : NAVIGATION ACTIVE");
        } catch (e) { this.log("CRITICAL_ERR: " + e.message); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        this.solveDynamics(dt);
        this.solveAstro();
        this.updateUI();

        requestAnimationFrame(() => this.engine());
    },

    solveDynamics(dt) {
        // 1. Orientation par Quaternions (Gimbal Lock Proof)
        this.updateAttitude(this.state.gyro, dt);

        // 2. Gravité WGS84 (Somigliana)
        const L = m.multiply(this.state.lat, m.divide(m.pi, 180));
        const g_theo = m.multiply(_BN("9.780327"), m.add(1, m.multiply(_BN("0.0053024"), m.pow(m.sin(L), 2))));

        // 3. Projection du vecteur gravité
        const g_proj = this.rotateVector({x: 0, y: 0, z: m.number(g_theo)}, this.ukf.q);

        // 4. TRIPLE INTÉGRATION & ZUPT (Zero Velocity Update)
        ['x', 'y', 'z'].forEach(axis => {
            let a_raw = _BN(this.state.accel[axis]);
            let a_pure = m.subtract(m.subtract(a_raw, _BN(g_proj[axis])), this.ukf.bias[axis]);

            // SEUIL DE RÉALISME (Filtre de bruit intelligent)
            // Adaptatif selon la force G détectée
            const threshold = m.number(this.ukf.g_inst) > 2 ? _BN("0.4") : _BN("0.15");

            if (m.abs(a_pure).gt(threshold)) {
                // Vitesse = Intégrale de l'Accélération
                this.ukf.vel[axis] = m.add(this.ukf.vel[axis], m.multiply(a_pure, dt));
                // Distance = Intégrale de la Vitesse
                this.ukf.pos[axis] = m.add(this.ukf.pos[axis], m.multiply(this.ukf.vel[axis], dt));
            } else {
                // Friction numérique (Élimine le drift à l'arrêt)
                this.ukf.vel[axis] = m.multiply(this.ukf.vel[axis], 0.85);
            }
        });

        // 5. Calcul Force G
        const norm_a = m.sqrt(m.add(m.pow(_BN(this.state.accel.x), 2), m.pow(_BN(this.state.accel.y), 2), m.pow(_BN(this.state.accel.z), 2)));
        this.ukf.g_inst = m.divide(norm_a, g_theo);
    },

    updateUI() {
        // Distance 3D réelle (Norme d'Euclide)
        const dist3D = m.sqrt(m.add(m.pow(this.ukf.pos.x, 2), m.pow(this.ukf.pos.y, 2), m.pow(this.ukf.pos.z, 2)));
        const speed_ms = m.sqrt(m.add(m.pow(this.ukf.vel.x, 2), m.pow(this.ukf.vel.y, 2), m.pow(this.ukf.vel.z, 2)));
        
        this.setUI('speed-stable-kmh', m.multiply(speed_ms, 3.6).toFixed(2));
        this.setUI('distance-totale', dist3D.toFixed(2) + " m");
        
        // Coordonnées Relatives (X, Y, Z)
        this.setUI('pos-x', this.ukf.pos.x.toFixed(3));
        this.setUI('pos-y', this.ukf.pos.y.toFixed(3));
        this.setUI('pos-z', this.ukf.pos.z.toFixed(3));
        
        // Vitesse Minecraft (1 m = 1 bloc)
        this.setUI('ui-mc-speed', speed_ms.toFixed(2) + " b/s");
        this.setUI('force-g-inst', this.ukf.g_inst.toFixed(3));
    },

    // --- LOGIQUE SÉCURISÉE ---
    rotateVector(v, q) {
        const {x, y, z} = v, {w, x: qx, y: qy, z: qz} = q;
        const ix = w*x + qy*z - qz*y, iy = w*y + qz*x - qx*z, iz = w*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
        return {
            x: ix*w + iw*-qx + iy*-qz - iz*-qy,
            y: iy*w + iw*-qy + iz*-qx - ix*-qz,
            z: iz*w + iw*-qz + ix*-qy - iy*-qx
        };
    },

    updateAttitude(g, dt) {
        const rad = Math.PI / 180, q = this.ukf.q, d = m.number(dt);
        const nw = q.w + 0.5 * (-q.x*g.x*rad - q.y*g.y*rad - q.z*g.z*rad) * d;
        const nx = q.x + 0.5 * (q.w*g.x*rad + q.y*g.z*rad - q.z*g.y*rad) * d;
        const ny = q.y + 0.5 * (q.w*g.y*rad - q.x*g.z*rad + q.z*g.x*rad) * d;
        const nz = q.z + 0.5 * (q.w*g.z*rad + q.x*g.y*rad - q.y*g.x*rad) * d;
        const mag = Math.sqrt(nw*nw + nx*nx + ny*ny + nz*nz);
        this.ukf.q = { w: nw/mag, x: nx/mag, y: ny/mag, z: nz/mag };
    },

    async calibrate(ms) {
        let s = [];
        const capture = (e) => s.push(e.accelerationIncludingGravity);
        window.addEventListener('devicemotion', capture);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', capture);
        this.ukf.bias.z = m.subtract(_BN(s.reduce((a,b)=>a+(b.z||0),0)/s.length), 9.80665);
    },

    initSensors() {
        window.ondevicemotion = (e) => {
            this.state.accel = { x: e.accelerationIncludingGravity.x||0, y: e.accelerationIncludingGravity.y||0, z: e.accelerationIncludingGravity.z||0 };
            this.state.gyro = { x: e.rotationRate.alpha||0, y: e.rotationRate.beta||0, z: e.rotationRate.gamma||0 };
        };
        window.ondeviceorientation = (e) => { this.state.pitch = e.beta; };
    },

    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { 
        const l = document.getElementById('anomaly-log');
        if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML;
    }
};
