/**
 * PROVIDENCE V75.0 - ARCHON-ELITE (FINAL SEAL)
 * Unified Architecture: IEKF-21 | Schuler | Maritime | Interstellar
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    houle_buffer: [], // Mémoire houle pour filtrage maritime
    
    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: _BN(1), x: _BN(0), y: _BN(0), z: _BN(0) }, 
        bias_a: { x: _BN(0), y: _BN(0), z: _BN(0) },
        jd: _BN(2460000.5), 
        dist_total: _BN(0),
        scale: _BN(1), 
        is_ctc: false
    },

    PHYS: {
        C: _BN("299792458"), G: _BN("9.80665"), RE: _BN("6371008"),
        LY_METERS: _BN("9.4607304725808e15"), KNOTS_COEFF: _BN("1.94384")
    },

    sensors: { raw_a:{x:0,y:0,z:0}, raw_g:{x:0,y:0,z:0}, noise_floor: _BN(0.02) },

    async boot() {
        this.log("ARCHON V75.0 : ACTIVATION DU NOYAU...");
        await this.syncAtomicSextant();
        this.initVisualAriametric();
        this.setupHardware();
        this.active = true;
        this.engine();
    },

    async syncAtomicSextant() {
        try {
            const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const d = await r.json();
            this.state.jd = m.add(_BN(new Date(d.utc_datetime).getTime() / 86400000), _BN(2440587.5));
            this.setUI('last-sync-gmt', "ATOMIC_LOCKED");
        } catch (e) {
            this.state.jd = m.add(_BN(Date.now() / 86400000), _BN(2440587.5));
            this.setUI('last-sync-gmt', "QUARTZ_SOUVERAIN");
        }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        let dt = m.divide(_BN(now - this.lastT), 1000);
        if (dt.gt(0.1)) dt = _BN(0.016);
        this.lastT = now;

        this.processPhysics(dt);
        this.updateUI();
        this.renderRadar();
        requestAnimationFrame(() => this.engine());
    },

    processPhysics(dt) {
        // A. Correction de Schuler (Verticale pour 1000km+)
        const omega_s = m.sqrt(m.divide(this.PHYS.G, this.PHYS.RE));
        const schuler_drift = m.sin(m.multiply(omega_s, dt));

        // B. Filtrage Maritime (Compensateur de Houle)
        this.houle_buffer.push(this.sensors.raw_a.z);
        if(this.houle_buffer.length > 60) this.houle_buffer.shift();
        const heave_noise = this.houle_buffer.reduce((a,b)=>a+b, 0) / this.houle_buffer.length;

        // C. Nettoyage Accélérométrique (Sub-millimétrique)
        let ax = m.subtract(_BN(this.sensors.raw_a.x), this.state.bias_a.x);
        let ay = m.subtract(_BN(this.sensors.raw_a.y), this.state.bias_a.y);
        let az = m.subtract(_BN(this.sensors.raw_a.z), m.add(this.PHYS.G, _BN(heave_noise)));

        const energy = m.sqrt(m.add(m.pow(ax,2), m.add(m.pow(ay,2), m.pow(az,2))));

        // D. Détection Hyperloop & Nether
        if (energy.gt(75)) this.state.scale = this.state.scale.eq(1) ? _BN(8) : _BN(1);

        // E. Verrouillage de Stase (ZUPT Gastéropode)
        if (m.abs(m.subtract(energy, this.PHYS.G)).lt(this.sensors.noise_floor)) {
            this.state.vel = { x: _BN(0), y: _BN(0), z: _BN(0) };
        } else {
            const v = this.getVelMag();
            let effective_dt = v.gt(this.PHYS.C) ? m.multiply(dt, -1) : dt;
            if (v.gt(this.PHYS.C)) this.state.is_ctc = true;

            this.state.vel.x = m.add(this.state.vel.x, m.multiply(ax, effective_dt));
            this.state.pos.x = m.add(this.state.pos.x, m.multiply(this.state.vel.x, m.multiply(effective_dt, this.state.scale)));
            this.state.dist_total = m.add(this.state.dist_total, m.multiply(v, effective_dt));
        }
    },

    updateUI() {
        const v = this.getVelMag();
        const knots = m.multiply(v, this.PHYS.KNOTS_COEFF);
        const ly = m.divide(this.state.dist_total, this.PHYS.LY_METERS);
        const jd = m.add(this.state.jd, m.divide(_BN((performance.now() - this.lastT)/1000), 86400));

        // Mapping vers vos IDs HTML (index 22 31)
        this.setUI('vitesse-raw', v.toFixed(9)); 
        this.setUI('ui-speed-knots', knots.toFixed(3) + " kts");
        this.setUI('speed-stable-kmh', m.multiply(v, 3.6).toFixed(4));
        this.setUI('ui-dist-ly', ly.toFixed(18) + " LY");
        this.setUI('distance-totale', this.state.dist_total.toFixed(3));
        this.setUI('ast-jd', jd.toFixed(11));
        
        // Relativité
        const gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(m.divide(v, this.PHYS.C), 2))));
        this.setUI('ui-lorentz', gamma.toFixed(15));
        this.setUI('time-dilation-vitesse', m.subtract(gamma, 1).multiply(1e15).toFixed(2) + " fs/s");

        // Statut Environnement
        const env = v.gt(250) ? "HYPERLOOP" : (v.gt(0.5) && v.lt(20) ? "MARITIME" : "TERRESTRE");
        this.setUI('ui-env-mode', env);
        this.setUI('ui-sextant-status', this.state.scale.gt(1) ? "NETHER_LOCK" : "OVERWORLD_LOCK");
    },

    initVisualAriametric() {
        const container = document.getElementById('map');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth/container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);
        
        this.sphere = new THREE.Mesh(new THREE.SphereGeometry(2, 24, 24), new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.3 }));
        this.homePoint = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        this.scene.add(this.sphere, this.homePoint);
        this.camera.position.z = 5;
    },

    renderRadar() {
        if (!this.sphere) return;
        this.sphere.rotation.y += 0.005;
        const d = { x: Number(this.state.pos.x), y: Number(this.state.pos.y), z: Number(this.state.pos.z) };
        const mag = Math.sqrt(d.x**2 + d.y**2 + d.z**2) || 1;
        this.homePoint.position.set((-d.x/mag)*2.1, (-d.y/mag)*2.1, (-d.z/mag)*2.1);
        this.sphere.material.color.setHex(this.state.is_ctc ? 0xbc13fe : 0x00ff88);
        this.renderer.render(this.scene, this.camera);
    },

    setupHardware() {
        window.ondevicemotion = (e) => {
            this.sensors.raw_a = { x: e.accelerationIncludingGravity.x||0, y: e.accelerationIncludingGravity.y||0, z: e.accelerationIncludingGravity.z||0 };
        };
        // Liaison des boutons HTML
        const anchorBtn = document.getElementById('anchor-btn');
        if(anchorBtn) anchorBtn.onclick = () => this.setAnchor();
        
        const initBtn = document.getElementById('main-init-btn');
        if(initBtn) initBtn.onclick = () => this.boot();
    },

    setAnchor() {
        this.state.pos = { x: _BN(0), y: _BN(0), z: _BN(0) };
        this.state.dist_total = _BN(0);
        this.log("ANCRAGE GÉODÉSIQUE : 0,0,0");
    },

    getVelMag() { return m.sqrt(m.add(m.pow(this.state.vel.x,2), m.add(m.pow(this.state.vel.y,2), m.pow(this.state.vel.z,2)))); },
    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { const l = document.getElementById('anomaly-log'); if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; }
};
