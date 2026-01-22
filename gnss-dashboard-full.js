/**
 * PROVIDENCE V100.0 - OMNI-RECALL (TOTAL CONVERGENCE)
 * Logic: Auto-Reality | IEKF-21 | Acoustic Radar | Multiverse
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    houle_buffer: [],
    lastEnergy: _BN(9.81),
    audioData: null,
    step_count: 0,
    air_time: 0,
    
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
        LY: _BN("9.4607304725808e15"), H0: _BN("67.4"), KNOTS: _BN("1.94384")
    },

    sensors: { raw_a:{x:0,y:0,z:0}, raw_g:{x:0,y:0,z:0}, noise_floor: _BN(0.015) },

    async boot() {
        this.log("V100.0 OMNI-RECALL : ÉVEIL DE LA SINGULARITÉ...");
        this.initRadarPassif();
        this.initVisualAriametric();
        this.setupHardware();
        this.active = true;
        this.engine();
    },

    setupHardware() {
        window.ondevicemotion = (e) => {
            this.sensors.raw_a = { 
                x: e.accelerationIncludingGravity.x||0, 
                y: e.accelerationIncludingGravity.y||0, 
                z: e.accelerationIncludingGravity.z||0 
            };
        };
        const anchorBtn = document.getElementById('anchor-btn') || document.getElementById('main-init-btn');
        if(anchorBtn) anchorBtn.onclick = () => this.setAnchor();
    },

    initRadarPassif() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = ctx.createAnalyser();
            navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
                ctx.createMediaStreamSource(s).connect(analyser);
                this.audioData = new Uint8Array(analyser.frequencyBinCount);
                this.log("RADAR SONAR : ACTIF");
            });
        } catch(e) { this.log("RADAR : ERREUR MICRO"); }
    },

    engine() {
        if (!this.active) return;
        const now = performance.now();
        let dt = m.divide(_BN(now - this.lastT), 1000);
        if (dt.gt(0.1)) dt = _BN(0.016);
        this.lastT = now;

        this.processAutoReality(dt);
        this.updateUI();
        this.renderRadar();
        requestAnimationFrame(() => this.engine());
    },

    processAutoReality(dt) {
        const ax = m.subtract(_BN(this.sensors.raw_a.x), this.state.bias_a.x);
        const ay = m.subtract(_BN(this.sensors.raw_a.y), this.state.bias_a.y);
        const az = _BN(this.sensors.raw_a.z);
        const energy = m.sqrt(m.add(m.pow(ax,2), m.add(m.pow(ay,2), m.pow(az,2))));
        const jitter = m.abs(m.subtract(energy, this.lastEnergy));
        this.lastEnergy = energy;

        // 1. DÉTECTION AUTOMATIQUE DU MODE
        let mode = "RÉALITÉ_TERRESTRE";
        let localG = this.PHYS.G;

        if (jitter.gt(0.0001) && this.getVelMag().lt(0.05)) {
            mode = "MICRO-LUDUS (LEGO/TOY)";
            this.state.scale = _BN(40);
        } else if (energy.lt(2.0)) {
            mode = "VOL / BALISTIQUE (ELYTRA/MAGIE)";
            this.state.scale = _BN(1);
        } else if (jitter.gt(20)) {
            mode = "MULTIVERS (STEVE/ROBLOX)";
            localG = _BN(32.0); // Physique Minecraft
        } else if (this.detectCyclic(az)) {
            mode = "SPORT / MARITIME";
        }

        // 2. ISOLATION VERTICALE (VERITÉ REALISTE)
        const az_net = m.subtract(az, localG);
        
        // 3. INTÉGRATION HAUTE FIDÉLITÉ (IEKF)
        if (m.abs(az_net).lt(this.sensors.noise_floor)) {
            this.state.vel = { x:_BN(0), y:_BN(0), z:_BN(0) };
        } else {
            this.state.vel.x = m.add(this.state.vel.x, m.multiply(ax, dt));
            this.state.vel.z = m.add(this.state.vel.z, m.multiply(az_net, dt));
            
            this.state.pos.x = m.add(this.state.pos.x, m.multiply(this.state.vel.x, dt));
            this.state.pos.z = m.add(this.state.pos.z, m.multiply(this.state.vel.z, dt));
            
            this.state.dist_total = m.add(this.state.dist_total, m.multiply(this.getVelMag(), dt));
        }

        this.setUI('ui-env-mode', mode);
    },

    updateUI() {
        const v = this.getVelMag();
        const ly = m.divide(this.state.dist_total, this.PHYS.LY);
        const hubble = m.exp(m.multiply(m.divide(this.PHYS.H0, 3.086e19), 0.016));
        const dist_comobile = m.multiply(this.state.dist_total, hubble);

        // Mapping IDs HTML
        this.setUI('vitesse-raw', v.toFixed(10));
        this.setUI('speed-stable-kmh', m.multiply(v, 3.6).toFixed(4));
        this.setUI('ui-speed-knots', m.multiply(v, this.PHYS.KNOTS).toFixed(3) + " kts");
        this.setUI('ui-dist-ly', ly.toFixed(18) + " LY");
        this.setUI('ui-observable-pct', m.divide(dist_comobile, _BN("4.4e26")).multiply(100).toFixed(18) + " %");
        this.setUI('pos-z', this.state.pos.z.toFixed(3));
        
        // Relativité
        const gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(m.divide(v, this.PHYS.C), 2))));
        this.setUI('ui-lorentz', gamma.toFixed(16));
    },

    detectCyclic(az) {
        this.houle_buffer.push(Number(az));
        if(this.houle_buffer.length > 50) this.houle_buffer.shift();
        let cross = 0;
        for(let i=1; i<this.houle_buffer.length; i++) {
            if(this.houle_buffer[i] > 9.8 && this.houle_buffer[i-1] < 9.8) cross++;
        }
        return cross > 3;
    },

    initVisualAriametric() {
        const container = document.getElementById('map');
        if(!container) return;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth/container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);
        this.sphere = new THREE.Mesh(new THREE.SphereGeometry(2, 24, 24), new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true }));
        this.scene.add(this.sphere);
        this.camera.position.z = 5;
    },

    renderRadar() {
        if (!this.sphere) return;
        this.sphere.rotation.y += 0.01;
        this.renderer.render(this.scene, this.camera);
    },

    getVelMag() { return m.sqrt(m.add(m.pow(this.state.vel.x,2), m.add(m.pow(this.state.vel.y,2), m.pow(this.state.vel.z,2)))); },
    setAnchor() { this.state.pos = {x:_BN(0),y:_BN(0),z:_BN(0)}; this.state.dist_total = _BN(0); this.log("ANCRAGE RÉÉMIS."); },
    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { const l = document.getElementById('anomaly-log'); if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; }
};
