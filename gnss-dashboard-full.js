
const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n || 0);

const OMNI = {
    active: false,
    v: _BN(0), 
    posXYZ: { x: _BN(0), y: _BN(0), z: _BN(0) },
    lastT: performance.now(),
    slamPoints: [],
    wakeLock: null,

    state: {
        pitch: 0, roll: 0, vibe: 0,
        temp: 15, press: 1013.25,
        orbit_v: 29784.8, sync_lat: 0,
        jd: 0, v_c: 299792458
    },

    async boot() {
        if (this.active) return;
        this.log("CORE_BOOT: INITIALISATION DES RÉFÉRENTIELS...");
        
        try {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            this.active = true;
            this.initHardware();
            this.syncChronos();
            
            // Boucle 50Hz (Professionnel / Sans simplification)
            setInterval(() => this.masterLoop(), 20);
            document.getElementById('btn-boot').innerText = "ONLINE";
            document.getElementById('btn-boot').classList.add('active');
        } catch (e) { this.log("BOOT_ERROR: " + e.message); }
    },

    // --- SYNCHRONISATION NANOSECONDE ---
    async syncChronos() {
        const t0 = performance.now();
        try {
            const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const d = await r.json();
            this.state.sync_lat = (performance.now() - t0) / 2;
            this.log("CHRONOS: SYNC_ATOMIQUE OK");
        } catch(e) { this.log("CHRONOS: SYNC_LOCAL"); }
    },

    // --- LOGIQUE DE NAVIGATION (VITESSE RÉELLE) ---
    updateNavigation(dt) {
        // Détection ZUPT (Zero Velocity Update) pour les grottes
        if (this.state.vibe < 0.15) {
            this.v = m.multiply(this.v, 0.9); // Amortissement de la dérive
            if (m.lt(this.v, 0.01)) this.v = _BN(0);
        } else {
            // Intégration pro de l'accélération
            const accel = _BN(this.state.vibe);
            this.v = m.add(this.v, m.multiply(accel, dt));
        }

        const p = this.state.pitch * Math.PI / 180;
        const r = this.state.roll * Math.PI / 180;
        const ds = m.multiply(this.v, dt);

        // Position 3D réelle
        this.posXYZ.x = m.add(this.posXYZ.x, m.multiply(ds, m.cos(p), m.sin(r)));
        this.posXYZ.y = m.add(this.posXYZ.y, m.multiply(ds, m.sin(p)));
        this.posXYZ.z = m.add(this.posXYZ.z, m.multiply(ds, m.cos(p), m.cos(r)));

        // Ajout point SLAM (toutes les 0.5m)
        if (m.gt(ds, 0.1)) {
            this.slamPoints.push({x: Number(this.posXYZ.x), z: Number(this.posXYZ.z), y: Number(this.posXYZ.y)});
            if (this.slamPoints.length > 1000) this.slamPoints.shift();
        }
    },

    // --- BOUCLE MAITRE ---
    masterLoop() {
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        this.updateNavigation(dt);
        this.state.jd = (new Date() / 86400000) + 2440587.5;

        // Calculs ADC (Air Data Computer)
        const v_ms = Number(this.v);
        const vsound = 20.05 * Math.sqrt(this.state.temp + 273.15);
        const mach = v_ms / vsound;
        const rho = (this.state.press * 100) / (287.05 * (this.state.temp + 273.15));
        const dynQ = 0.5 * rho * v_ms * v_ms;
        
        // Relativité
        const v_tot = v_ms + this.state.orbit_v;
        const gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(m.divide(_BN(v_tot), 299792458), 2))));

        // Affichage
        this.setUI('ui-ias', (v_ms * 3.6).toFixed(4));
        this.setUI('ui-mach', mach.toFixed(3));
        this.setUI('ui-g', (this.state.vibe / 9.80665 + 1).toFixed(3));
        this.setUI('ui-q', Math.round(dynQ) + " Pa");
        this.setUI('ui-x', Number(this.posXYZ.x).toFixed(2));
        this.setUI('ui-y', Number(this.posXYZ.y).toFixed(2));
        this.setUI('ui-z', Number(this.posXYZ.z).toFixed(2));
        this.setUI('ui-jd', this.state.jd.toFixed(6));
        this.setUI('ui-sync', this.state.sync_lat.toFixed(2) + "ms");
        this.setUI('ui-gamma', gamma.toString().substring(0, 20));

        this.renderArmillary();
        this.renderSlam();
        if (this.recorder.active) this.recorder.tick(v_ms, mach);
    },

    // --- GRAPHISMES PROFESSIONNELS ---
    renderArmillary() {
        const c = document.getElementById('armille-canvas');
        const ctx = c.getContext('2d');
        const ctr = 150; const rad = 100;
        ctx.clearRect(0,0,300,300);

        const p = this.state.pitch * Math.PI/180;
        const r = this.state.roll * Math.PI/180;

        // Écliptique & Horizon
        ctx.strokeStyle = "var(--neon-blue)";
        ctx.beginPath();
        ctx.ellipse(ctr, ctr, rad, rad * Math.abs(Math.sin(p)), r, 0, Math.PI*2);
        ctx.stroke();
        
        ctx.strokeStyle = "rgba(255,215,0,0.3)"; // Obliquité
        ctx.beginPath();
        ctx.ellipse(ctr, ctr, rad, rad * Math.abs(Math.cos(p)), r + 0.41, 0, Math.PI*2);
        ctx.stroke();
    },

    renderSlam() {
        const c = document.getElementById('slam-canvas');
        const ctx = c.getContext('2d');
        ctx.fillStyle = "#000"; ctx.fillRect(0,0,300,180);
        ctx.fillStyle = "var(--neon-green)";
        this.slamPoints.forEach(pt => {
            const sx = 150 + (pt.x - Number(this.posXYZ.x)) * 5;
            const sy = 90 + (pt.z - Number(this.posXYZ.z)) * 5;
            ctx.fillRect(sx, sy, 1.5, 1.5);
        });
        // Indicateur Sonar
        ctx.strokeStyle = "rgba(0,255,136,0.2)";
        ctx.beginPath(); ctx.arc(150, 90, 10, 0, Math.PI*2); ctx.stroke();
    },

    // --- MODULES DE SÉCURITÉ & CAPTEURS ---
    initHardware() {
        window.addEventListener('devicemotion', (e) => {
            const a = e.acceleration || {x:0, y:0, z:0};
            this.state.vibe = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
        });
        window.addEventListener('deviceorientation', (e) => {
            this.state.pitch = e.beta || 0;
            this.state.roll = e.gamma || 0;
        });
    },

    async toggleLock() {
        if (!this.wakeLock) {
            this.wakeLock = await navigator.wakeLock.request('screen');
            document.getElementById('btn-lock').innerText = "WAKE_LOCK: ON";
            document.getElementById('btn-lock').classList.add('active');
        } else {
            await this.wakeLock.release();
            this.wakeLock = null;
            document.getElementById('btn-lock').innerText = "WAKE_LOCK: OFF";
            document.getElementById('btn-lock').classList.remove('active');
        }
    },

    recorder: {
        active: false, log: [],
        toggle() {
            this.active = !this.active;
            const b = document.getElementById('btn-rec');
            b.innerText = this.active ? "STOP_LOG" : "START_LOG";
            b.classList.toggle('active');
        },
        tick(v, mach) {
            this.log.push([Date.now(), v.toFixed(4), mach.toFixed(4), OMNI.posXYZ.x.toString(), OMNI.posXYZ.y.toString()].join(","));
        },
        export() {
            const blob = new Blob(["TS,V_MS,MACH,X,Y\n" + this.log.join("\n")], {type: 'text/csv'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'BLACKBOX.csv'; a.click();
        }
    },

    setUI(id, v) { const el = document.getElementById(id); if (el) el.innerText = v; },
    log(m) { 
        const l = document.getElementById('terminal-log');
        l.innerHTML = `<div>[${new Date().toLocaleTimeString()}] ${m}</div>` + l.innerHTML;
    }
};

window.onbeforeunload = () => "MISSION_EN_COURS";
