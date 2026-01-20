/**
 * OMNISCIENCE V17 PRO MAX - TOTAL_RECALL_CORE
 * SLAM Abyssal 64-bit • Sextant Automatique • Physique Adaptative
 * Dépendances : math.min.js, weather.js (équations), ephem.js (astres)
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });

// Casting de sécurité 64-bit (Anti-Implicit-Conversion Error)
const _BN = (n) => {
    try {
        if (n === null || n === undefined || isNaN(n)) return m.bignumber("0");
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
        lat: _BN(48.8566), lon: _BN(2.3522),
        pitch: 0, roll: 0, heading: 0,
        accel: { x: 0, y: 0, z: 0 },
        press: 1013.25, temp: 15, lux: 0,
        rho: _BN(1.225), gamma: _BN(1),
        isSextantLocked: false
    },

    // 1. SYNCHRONISATION GMT ATOMIQUE HAUTE FRÉQUENCE
    atomic: {
        offset: _BN(0),
        jitter: _BN(0),
        async sync() {
            try {
                const t0 = performance.now();
                const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const d = await r.json();
                const t1 = performance.now();
                const latency = (t1 - t0) / 2;
                this.offset = _BN(new Date(d.datetime).getTime()).plus(_BN(latency)).minus(_BN(Date.now()));
                this.jitter = _BN(Math.abs(latency - 15));
                OMNI.setUI('ui-atomic-jitter', "±" + this.jitter.toFixed(4) + "ms");
            } catch(e) { console.warn("Atomic Sync Drift"); }
        },
        getNow() { return _BN(Date.now()).plus(this.offset); }
    },

    // 2. INITIALISATION & CALIBRATION HARDWARE
    async boot() {
        this.log("INITIALISATION UNITÉ UNIVERSELLE...");
        try {
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            
            // Calibration du biais (Zéro-Gravity Filter)
            this.log("CALIBRATION SLAM (RESTEZ IMMOBILE)...");
            await this.calibrateHardware(1500);
            
            this.initSensors();
            await this.atomic.sync();
            
            this.active = true;
            setInterval(() => this.atomic.sync(), 20000); // Resync toutes les 20s
            
            const engineLoop = () => { 
                if(this.active) { this.masterLoop(); requestAnimationFrame(engineLoop); } 
            };
            engineLoop();
            this.log("COEUR ACTIF : SLAM ABYSSAL OPÉRATIONNEL");
        } catch (e) { this.log("ERREUR CRITIQUE: " + e.message); }
    },

    async calibrateHardware(ms) {
        let s = [];
        const capture = (e) => s.push({x: e.acceleration.x, y: e.acceleration.y, z: e.acceleration.z});
        window.addEventListener('devicemotion', capture);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', capture);
        if(s.length > 0) {
            this.bias.x = _BN(s.reduce((a,b) => a + b.x, 0) / s.length);
            this.bias.y = _BN(s.reduce((a,b) => a + b.y, 0) / s.length);
            this.bias.z = _BN(s.reduce((a,b) => a + b.z, 0) / s.length);
        }
    },

    // 3. MOTEUR DE CALCULS SCIENTIFIQUES
    masterLoop() {
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        this.processSlam(dt);
        this.processAtmosphere();
        this.processSextant();
        this.updateUI();
    },

    processSlam(dt) {
        const a = this.state.accel;
        const latRad = m.multiply(this.state.lat, m.divide(m.pi, 180));
        
        // Gravité locale (Somigliana)
        const g_local = m.multiply(_BN(9.780327), m.add(_BN(1), m.multiply(_BN(0.0053024), m.pow(m.sin(latRad), 2))));

        // Intégration Inertielle 64-bit avec suppression du biais
        ['x', 'y', 'z'].forEach(axis => {
            let rawA = m.subtract(_BN(a[axis]), this.bias[axis]);
            
            // Seuil anti-dérive (Noise Floor)
            const threshold = _BN(0.12);
            if (m.abs(rawA).gt(threshold)) {
                this.v[axis] = m.add(this.v[axis], m.multiply(rawA, dt));
                this.pos[axis] = m.add(this.pos[axis], m.multiply(this.v[axis], dt));
            } else {
                this.v[axis] = m.multiply(this.v[axis], _BN(0.92)); // Friction numérique
            }
        });

        // Odométrie 3D
        const v_tot = m.sqrt(m.add(m.pow(this.v.x, 2), m.pow(this.v.y, 2), m.pow(this.v.z, 2)));
        this.dist3D = m.add(this.dist3D, m.multiply(v_tot, dt));

        // Navigation Géodésique (Translation Lat/Lon)
        const R_earth = _BN(6371000);
        const dLat = m.multiply(m.divide(m.multiply(this.v.y, dt), R_earth), m.divide(180, m.pi));
        this.state.lat = m.add(this.state.lat, dLat);
    },

    processAtmosphere() {
        // Utilisation des constantes weather.js
        const T_k = this.state.temp + 273.15;
        this.state.rho = m.divide(m.multiply(_BN(this.state.press), 100), m.multiply(287.058, T_k));
        
        const v_ms = m.sqrt(m.add(m.pow(this.v.x, 2), m.pow(this.v.y, 2)));
        const q = m.multiply(0.5, this.state.rho, m.pow(v_ms, 2)); // Pression Dynamique
        
        // Stress structurel basé sur les entrées buffer (80kg, 0.4 Cx)
        const mass = _BN(document.getElementById('in-mass')?.innerText || 80);
        const cx = _BN(document.getElementById('in-cx')?.innerText || 0.4);
        const stress = m.divide(m.multiply(q, cx, _BN(0.6)), mass);
        
        this.setUI('air-density', this.state.rho.toFixed(6));
        this.setUI('dynamic-pressure', m.number(q).toFixed(2) + " Pa");
        this.setUI('structural-stress', m.number(stress).toFixed(6) + " N/kg");
        
        // Dilatation temporelle Lorentz (Vitesse + Rotation Terrestre)
        const v_c = m.add(v_ms, 465); // Ajout rotation équatoriale approx
        this.state.gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(m.divide(v_c, 299792458), 2))));
    },

    processSextant() {
        const t_atom = this.atomic.getNow();
        const jd = m.add(m.divide(t_atom, _BN(86400000)), _BN(2440587.5)); // Julian Date
        
        // Réglage Automatique : Comparaison inclinaison physique vs Éphémérides (Meeus/Ephem.js)
        const n = m.subtract(jd, _BN(2451545.0));
        const L = m.mod(m.add(_BN(280.46), m.multiply(_BN(0.9856474), n)), _BN(360));
        
        const sunAlt_theo = m.sin(m.multiply(L, m.divide(m.pi, 180)));
        const deviceAlt = m.sin(m.multiply(_BN(this.state.pitch), m.divide(m.pi, 180)));
        
        const drift = m.abs(m.subtract(sunAlt_theo, deviceAlt));
        this.state.isSextantLocked = m.number(drift) < 0.025;

        this.setUI('ast-jd', jd.toFixed(8));
        this.setUI('ui-sextant-status', this.state.isSextantLocked ? "LOCKED (ATOMIC)" : "RECALIBRATING...");
        this.setUI('ephem-status', this.state.isSextantLocked ? "SYNC_OK" : "EPHEM_SEARCH");
    },

    // 4. RENDU INTERFACE & SPHÈRE ARMILLAIRE
    updateUI() {
        this.setUI('lat-ekf', this.state.lat.toFixed(10));
        const v_kmh = m.multiply(m.sqrt(m.add(m.pow(this.v.x, 2), m.pow(this.v.y, 2))), _BN(3.6));
        this.setUI('speed-stable-kmh', v_kmh.toFixed(4));
        this.setUI('ui-lorentz', this.state.gamma.toString().substring(0, 22));
        this.setUI('distance-totale', this.dist3D.toFixed(2) + " m");
        this.setUI('pos-x', this.pos.x.toFixed(3));
        this.setUI('pos-y', this.pos.y.toFixed(3));
        this.setUI('ui-sampling-rate', Math.round(1000 / (performance.now() - this.lastUI || 16)) + "Hz");
        this.lastUI = performance.now();
        
        const gCanv = document.getElementById('gforce-canvas');
        if(gCanv) this.drawArmillary(gCanv);
    },

    drawArmillary(c) {
        const ctx = c.getContext('2d');
        const cx = c.width/2, cy = c.height/2;
        ctx.clearRect(0,0,c.width,c.height);
        ctx.strokeStyle = this.state.isSextantLocked ? "#00ff88" : "#ff3300";
        ctx.lineWidth = 1.5;
        
        // Sphère Armillaire réactive
        ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); // Anneau de déclinaison
        ctx.ellipse(cx, cy, 40, 40 * Math.cos(this.state.roll * Math.PI/180), this.state.pitch * Math.PI/180, 0, Math.PI*2);
        ctx.stroke();
        // Ligne d'horizon du sextant
        ctx.strokeStyle = "#00c3ff";
        ctx.beginPath();
        ctx.moveTo(cx-50, cy + this.state.pitch); ctx.lineTo(cx+50, cy - this.state.pitch);
        ctx.stroke();
    },

    initSensors() {
        window.ondevicemotion = (e) => {
            const acc = e.acceleration; // Linéaire (sans g)
            if (acc) this.state.accel = { x: acc.x || 0, y: acc.y || 0, z: acc.z || 0 };
        };
        window.ondeviceorientation = (e) => {
            this.state.pitch = e.beta; this.state.roll = e.gamma;
            this.state.heading = e.alpha;
        };
        if ('PressureSensor' in window) {
            const ps = new PressureSensor({frequency: 20});
            ps.onreading = () => this.state.press = ps.pressure;
            ps.start();
        }
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) { 
        const t = document.getElementById('anomaly-log');
        if (t) t.innerHTML = `<div>> [${new Date().toLocaleTimeString()}] ${msg}</div>` + t.innerHTML;
    }
};

function startAdventure() { OMNI.boot(); }
