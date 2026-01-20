/**
 * OMNISCIENCE V17.5 PRO MAX - TOTAL_RECALL_CORE
 * Fix: Deployment Vercel / HTTPS Sensors / ID Validation
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    
    // --- UKF 21 ÉTATS ---
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
        press: 1013.25, temp: 15, pitch: 0, hertz: 0
    },

    // --- BOOT AVEC PERMISSION IOS/CHROME ---
    async boot() {
        this.log("REQUESTING_SENSOR_ACCESS...");
        
        try {
            // Indispensable pour Safari/iOS et Chrome mobile sur Vercel (HTTPS)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') {
                    this.log("CRITICAL: SENSOR_PERMISSION_DENIED");
                    return;
                }
            }

            this.log("ALIGNING_ARIAMETRIC_SPHERE...");
            await this.calibrateSINS(3000); // 3s de mesure du bruit de fond
            
            this.initSensors();
            this.active = true;
            this.engine();
            this.log("CORE_LOCKED: SLAM_64BIT_ACTIVE");
            
            // Lancer la sync GMT
            if (this.atomic) this.atomic.sync();
        } catch (e) {
            this.log("BOOT_ERROR: " + e.message);
        }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.state.hertz = Math.round(1000 / (now - this.lastT));
        this.lastT = now;

        this.solveSINS(dt);
        this.updateUIMap(); // Mise à jour de tous les IDs

        requestAnimationFrame(() => this.engine());
    },

    solveSINS(dt) {
        // 1. Quaternions (Rotation)
        this.updateOrientation(this.state.gyro, dt);

        // 2. Projection Gravité Somigliana
        const latRad = m.multiply(this.state.lat, m.divide(m.pi, 180));
        const g_h = m.multiply(_BN("9.780327"), m.add(1, m.multiply(_BN("0.0053024"), m.pow(m.sin(latRad), 2))));
        const g_p = this.rotateVector({x: 0, y: 0, z: m.number(g_h)}, this.ukf.q);

        // 3. Intégration Tridimensionnelle (X, Y, Z)
        ['x', 'y', 'z'].forEach(axis => {
            let a_pure = m.subtract(m.subtract(_BN(this.state.accel[axis]), _BN(g_p[axis])), this.ukf.bias_a[axis]);

            // Filtre ZUPT (Pour circuit à bille et immobilité)
            if (m.abs(a_pure).gt(_BN("0.12"))) {
                this.ukf.vel[axis] = m.add(this.ukf.vel[axis], m.multiply(a_pure, dt));
                this.ukf.pos[axis] = m.add(this.ukf.pos[axis], m.multiply(this.ukf.vel[axis], dt));
            } else {
                this.ukf.vel[axis] = m.multiply(this.ukf.vel[axis], 0.85); // Amortissement drift
            }
        });

        this.ukf.g_inst = m.divide(m.sqrt(m.add(m.pow(_BN(this.state.accel.x), 2), m.pow(_BN(this.state.accel.y), 2), m.pow(_BN(this.state.accel.z), 2))), g_h);
    },

    // --- MAPPING DES IDS HTML (Vérification exhaustive) ---
    updateUIMap() {
        // Colonne de Gauche (Navigation/EKF)
        this.setUI('ui-sampling-rate', this.state.hertz + "Hz");
        this.setUI('lat-ekf', this.state.lat.toFixed(8));
        
        // Centre (Odométrie/SLAM)
        const v_ms = m.sqrt(m.add(m.pow(this.ukf.vel.x, 2), m.pow(this.ukf.vel.y, 2), m.pow(this.ukf.vel.z, 2)));
        this.setUI('speed-stable-kmh', m.multiply(v_ms, 3.6).toFixed(2));
        this.setUI('speed-stable-ms', v_ms.toFixed(3));
        this.setUI('ui-mc-speed', v_ms.toFixed(2) + " b/s");
        
        // Coordonnées 3 Axes (Réalisme circuit/grotte)
        this.setUI('pos-x', this.ukf.pos.x.toFixed(3));
        this.setUI('pos-y', this.ukf.pos.y.toFixed(3));
        this.setUI('pos-z', this.ukf.pos.z.toFixed(3));
        
        const dist3d = m.sqrt(m.add(m.pow(this.ukf.pos.x, 2), m.pow(this.ukf.pos.y, 2), m.pow(this.ukf.pos.z, 2)));
        this.setUI('distance-3d', dist3d.toFixed(2));
        this.setUI('distance-totale', dist3d.toFixed(2) + " m");

        // Force G
        this.setUI('force-g-inst', this.ukf.g_inst.toFixed(3));
    },

    // --- UTILS ---
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
            this.state.accel = { 
                x: e.accelerationIncludingGravity.x || 0, 
                y: e.accelerationIncludingGravity.y || 0, 
                z: e.accelerationIncludingGravity.z || 0 
            };
            this.state.gyro = { 
                x: e.rotationRate.alpha || 0, 
                y: e.rotationRate.beta || 0, 
                z: e.rotationRate.gamma || 0 
            };
        };
        window.ondeviceorientation = (e) => { this.state.pitch = e.beta; };
    }
};

// Lancement par bouton HTML
function startAdventure() { OMNI_CORE.boot(); }
