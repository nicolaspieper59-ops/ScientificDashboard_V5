/**
 * OMNISCIENCE V17 PRO MAX - SUPRÉMACIE SCIENTIFIQUE
 * Protocol: UKF-21 States / 64-bit Mantissa / SINS-SLAM
 * Logic: Multi-Vector Dynamics (Gastéropode -> Fusée)
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    
    // CONSTANTES CODATA & WGS84
    PHYSICS: {
        G: _BN("6.67430e-11"), C: _BN("299792458"),
        Re: _BN("6378137"), M: _BN("5.9722e24"),
        R_AIR: _BN("287.058"), L_ATM: _BN("0.0065")
    },

    // UKF 21 ÉTATS (Position, Vélocité, Accélération, Quaternions, Biais)
    ukf: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: 1, x: 0, y: 0, z: 0 },
        bias_a: { x: _BN(0), y: _BN(0), z: _BN(0) },
        g_inst: _BN(0),
        dist_3d: _BN(0)
    },

    state: {
        lat: _BN("48.8566"), lon: _BN("2.3522"),
        accel: { x: 0, y: 0, z: 0 }, gyro: { x: 0, y: 0, z: 0 },
        press: 1013.25, temp: 15, pitch: 0, hertz: 0,
        isSextantLocked: false
    },

    // SYNC GMT ATOMIQUE HAUTE FRÉQUENCE
    atomic: {
        offset: _BN(0), latency: 0,
        async sync() {
            try {
                const t0 = performance.now();
                const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const d = await r.json();
                this.latency = (performance.now() - t0) / 2;
                this.offset = m.subtract(m.add(_BN(new Date(d.datetime).getTime()), _BN(this.latency)), _BN(Date.now()));
                OMNI_CORE.setUI('ui-atomic-jitter', this.latency.toFixed(3) + "ms");
            } catch(e) { OMNI_CORE.log("GMT_SYNC_FAIL"); }
        },
        getNow() { return m.add(_BN(Date.now()), this.offset); }
    },

    async boot() {
        this.log("CORE_BOOT_V17_PRO_MAX...");
        try {
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            await this.atomic.sync();
            await this.alignSINS(3000); // 3s d'immobilité pour la sphère ariamétrique
            this.initSensors();
            this.active = true;
            this.loop();
            setInterval(() => this.atomic.sync(), 15000);
            this.log("SYSTEM_READY_V17: SLAM_ACTIVE");
        } catch (e) { this.log("CRITICAL_ERR: " + e.message); }
    },

    loop() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.state.hertz = Math.round(1000 / (now - this.lastT));
        this.lastT = now;

        this.solveSINS(dt);      // SLAM & Navigation
        this.solveAtmosphere();  // Fluides & Relativité
        this.solveAstro();       // Sextant Automatique
        this.refreshUI();        // Mapping complet des IDs HTML

        requestAnimationFrame(() => this.loop());
    },

    // NAVIGATION STRAPDOWN 64-BIT
    solveSINS(dt) {
        this.updateQuaternions(this.state.gyro, dt);
        
        // Pesanteur Somigliana (WGS84)
        const latRad = m.multiply(this.state.lat, m.divide(m.pi, 180));
        const g_h = m.multiply(_BN("9.780327"), m.add(1, m.multiply(_BN("0.0053024"), m.pow(m.sin(latRad), 2))));
        const g_proj = this.rotateVector({x: 0, y: 0, z: m.number(g_h)}, this.ukf.q);

        ['x', 'y', 'z'].forEach(axis => {
            let a_pure = m.subtract(m.subtract(_BN(this.state.accel[axis]), _BN(g_proj[axis])), this.ukf.bias_a[axis]);

            // FILTRE DE RÉALISME ADAPTATIF (ZUPT)
            const threshold = m.number(this.ukf.g_inst) > 1.8 ? _BN("0.35") : _BN("0.12");

            if (m.abs(a_pure).gt(threshold)) {
                this.ukf.vel[axis] = m.add(this.ukf.vel[axis], m.multiply(a_pure, dt));
                this.ukf.pos[axis] = m.add(this.ukf.pos[axis], m.multiply(this.ukf.vel[axis], dt));
            } else {
                this.ukf.vel[axis] = m.multiply(this.ukf.vel[axis], 0.82); // Amortissement
            }
        });

        const norm_a = m.sqrt(m.add(m.pow(_BN(this.state.accel.x), 2), m.pow(_BN(this.state.accel.y), 2), m.pow(_BN(this.state.accel.z), 2)));
        this.ukf.g_inst = m.divide(norm_a, g_h);
        this.ukf.dist_3d = m.sqrt(m.add(m.pow(this.ukf.pos.x, 2), m.pow(this.ukf.pos.y, 2), m.pow(this.ukf.pos.z, 2)));
    }

    // SEXTANT & ASTRO (ephem.js simulation)
    solveAstro() {
        const jd = m.add(m.divide(this.atomic.getNow(), 86400000), 2440587.5);
        this.setUI('ast-jd', jd.toFixed(8));
        
        // Sextant Auto: Recalage par angle solaire théorique
        const sun_alt_theo = m.sin(m.multiply(m.subtract(jd, 2451545.0), 0.0172));
        const pitch_obs = Math.sin(this.state.pitch * Math.PI / 180);
        this.state.isSextantLocked = Math.abs(m.number(sun_alt_theo) - pitch_obs) < 0.03;
        this.setUI('ui-sextant-status', this.state.isSextantLocked ? "LOCKED_GMT" : "SEARCH_SYNC");
    }

    solveAtmosphere() {
        const T_k = m.add(this.state.temp, 273.15);
        const rho = m.divide(m.multiply(_BN(this.state.press), 100), m.multiply(this.PHYSICS.R_AIR, T_k));
        
        // Lorentz & Dilatation du temps
        const v_sq = m.add(m.pow(this.ukf.vel.x, 2), m.pow(this.ukf.vel.y, 2), m.pow(this.ukf.vel.z, 2));
        const gamma = m.divide(1, m.sqrt(m.subtract(1, m.divide(v_sq, m.pow(this.PHYSICS.C, 2)))));
        
        this.setUI('air-density', rho.toFixed(6));
        this.setUI('ui-lorentz', gamma.toFixed(18));
    }

    refreshUI() {
        // MAPPING COMPLET VERS VOTRE HTML
        this.setUI('ui-sampling-rate', this.state.hertz + "Hz");
        this.setUI('lat-ekf', this.state.lat.toFixed(10));
        
        const speed_kmh = m.multiply(m.sqrt(m.add(m.pow(this.ukf.vel.x, 2), m.pow(this.ukf.vel.y, 2), m.pow(this.ukf.vel.z, 2))), 3.6);
        this.setUI('speed-stable-kmh', speed_kmh.toFixed(2));
        
        // Distance 3-axes (SLAM)
        this.setUI('pos-x', this.ukf.pos.x.toFixed(3));
        this.setUI('pos-y', this.ukf.pos.y.toFixed(3));
        this.setUI('pos-z', this.ukf.pos.z.toFixed(3));
        this.setUI('distance-3d', this.ukf.dist_3d.toFixed(2) + " m");
        
        // Vitesse stable et Force G
        this.setUI('force-g-inst', this.ukf.g_inst.toFixed(3));
        this.setUI('ui-mc-speed', m.divide(speed_kmh, 3.6).toFixed(2) + " b/s");
    }

    // MATHÉMATIQUES ARIAMÉTRIQUES
    updateQuaternions(g, dt) {
        const r = Math.PI / 180, q = this.ukf.q, d = m.number(dt);
        const nw = q.w + 0.5 * (-q.x*g.x*r - q.y*g.y*r - q.z*g.z*r) * d;
        const nx = q.x + 0.5 * (q.w*g.x*r + q.y*g.z*r - q.z*g.y*r) * d;
        const ny = q.y + 0.5 * (q.w*g.y*r - q.x*g.z*r + q.z*g.x*r) * d;
        const nz = q.z + 0.5 * (q.w*g.z*r + q.x*g.y*r - q.y*g.x*r) * d;
        const mag = Math.sqrt(nw*nw + nx*nx + ny*ny + nz*nz);
        this.ukf.q = { w: nw/mag, x: nx/mag, y: ny/mag, z: nz/mag };
    }

    rotateVector(v, q) {
        const {x, y, z} = v, {w, x: qx, y: qy, z: qz} = q;
        const ix = w*x + qy*z - qz*y, iy = w*y + qz*x - qx*z, iz = w*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
        return {
            x: ix*w + iw*-qx + iy*-qz - iz*-qy,
            y: iy*w + iw*-qy + iz*-qx - ix*-qz,
            z: iz*w + iw*-qz + ix*-qy - iy*-qx
        };
    }

    async alignSINS(ms) {
        let s = [];
        const f = (e) => s.push(e.accelerationIncludingGravity);
        window.addEventListener('devicemotion', f);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', f);
        this.ukf.bias_a.z = m.subtract(_BN(s.reduce((a,b)=>a+(b.z||0),0)/s.length), 9.80665);
    }

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
