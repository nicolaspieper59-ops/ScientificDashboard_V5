/**
 * OMNISCIENCE V17 PRO MAX - TOTAL_RECALL_CORE
 * Script de Contrôle Métrologique Universel
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(n || 0);

const OMNI = {
    active: false,
    v: _BN(0),
    posXYZ: { x: _BN(0), y: _BN(0), z: _BN(0) },
    distTotale: _BN(0),
    lastT: performance.now(),
    
    // 1. ÉTAT DU SYSTÈME (PRÉCISION 64-BIT)
    state: {
        lat: _BN(48.8566), lon: _BN(2.3522), alt: _BN(0),
        pitch: 0, roll: 0, heading: 0,
        accel: { x: 0, y: 0, z: 0 },
        press: 1013.25, temp: 15, hum: 45, lux: 0,
        rho: _BN(1.225), gamma: _BN(1),
        sun: { alt: 0, az: 0 }, moon: { alt: 0, az: 0 },
        isSextantLocked: false,
        jitter: _BN(0), offset: _BN(0)
    },

    // 2. CONFIGURATION DES MISSIONS
    profiles: {
        "VOITURE":  { mass: 1500,   cx: 0.3,   area: 2.2 },
        "FUSÉE":    { mass: 500000, cx: 0.15,  area: 15 },
        "INSECTE":  { mass: 0.0001, cx: 0.8,   area: 0.001 },
        "WAGONNET": { mass: 600,    cx: 0.5,   area: 2.1 }
    },
    activeProfile: "VOITURE",

    // 3. BOOT & SYNC ATOMIQUE
    async boot() {
        this.log("INITIALISATION SYSTÈME ATOMIQUE...");
        try {
            await this.syncAtomic();
            await this.initHardware();
            this.active = true;
            this.engine();
            setInterval(() => this.syncAtomic(), 30000); 
            this.log("COEUR OPÉRATIONNEL - MODE 64-BIT");
        } catch (e) { this.log("FAILURE: " + e.message); }
    },

    async syncAtomic() {
        const t0 = performance.now();
        const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
        const d = await r.json();
        const t1 = performance.now();
        const latence = (t1 - t0) / 2;
        this.state.offset = _BN(new Date(d.datetime).getTime()).plus(latence).minus(Date.now());
        this.state.jitter = _BN(Math.abs(latence - 15)); // 15ms base ref
        this.setUI('tslv', this.state.jitter.toFixed(2) + "ms");
    },

    // 4. BOUCLE MAÎTRESSE (MOTEUR PHYSIQUE)
    engine() {
        if(!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        this.processNavigation(dt);
        this.processAero();
        this.processAstro();
        this.updateAllHTML();

        requestAnimationFrame(() => this.engine());
    },

    processNavigation(dt) {
        // Intégration Inertielle 64-bit
        const a = this.state.accel;
        const gMag = m.sqrt(m.add(m.pow(_BN(a.x),2), m.pow(_BN(a.y),2), m.pow(_BN(a.z),2)));
        const gNet = m.abs(m.subtract(gMag, _BN(9.80665)));

        // Vitesse et Distance (ZUPT inclus)
        if (gNet.gt(0.1)) {
            this.v = m.add(this.v, m.multiply(gNet, dt));
        } else {
            this.v = m.multiply(this.v, _BN(0.95)); // Friction
        }

        const d = m.multiply(this.v, dt);
        this.distTotale = m.add(this.distTotale, d);

        // Déplacement Géodésique (Lat/Lon BN)
        const R = _BN(6371000);
        this.state.lat = m.add(this.state.lat, m.multiply(m.divide(d, R), m.divide(180, m.pi)));
        
        // Lorentz (Relativité)
        const v_c = m.add(this.v, 29784); // + Orbite Terre
        const beta = m.divide(v_c, 299792458);
        this.state.gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(beta, 2))));
    },

    processAero() {
        // Densité de l'air ρ = P / (R*T)
        const T_k = this.state.temp + 273.15;
        this.state.rho = m.divide(m.multiply(this.state.press, 100), m.multiply(287.058, T_k));
        
        // Stress structurel
        const p = this.profiles[this.activeProfile];
        const drag = m.multiply(0.5, this.state.rho, m.pow(this.v, 2), p.cx, p.area);
        this.setUI('structural-stress', m.divide(drag, p.mass).toFixed(4) + " N/kg");
        this.setUI('dynamic-pressure', drag.toFixed(2) + " Pa");
    },

    processAstro() {
        const jd = _BN(Date.now()).plus(this.state.offset).divide(86400000).plus(2440587.5);
        this.state.jd = jd;
        
        // Calcul simplifié de l'altitude solaire pour le Sextant
        const sunAlt = Math.sin((jd % 1) * Math.PI * 2); 
        this.state.isSextantLocked = Math.abs(sunAlt - Math.sin(this.state.pitch * Math.PI/180)) < 0.05;
    },

    // 5. MISE À JOUR DE TOUS LES IDS DU HTML
    updateAllHTML() {
        // Bloc Navigation
        this.setUI('lat-ekf', this.state.lat.toFixed(8));
        this.setUI('lon-ekf', this.state.lon.toFixed(8));
        this.setUI('speed-stable-kmh', m.multiply(this.v, 3.6).toFixed(2));
        this.setUI('ui-lorentz', this.state.gamma.toString().substring(0, 15));
        this.setUI('force-g-inst', m.divide(m.sqrt(m.add(m.pow(_BN(this.state.accel.x),2), m.pow(_BN(this.state.accel.y),2))), 9.8).toFixed(3));
        
        // Bloc Visual SLAM
        this.setUI('pos-x', this.posXYZ.x.toFixed(2));
        this.setUI('pos-y', this.state.alt.toFixed(2));
        this.setUI('distance-totale', this.distTotale.toFixed(2) + " m");
        this.setUI('v-cosmic', m.add(this.v, 29784).toFixed(0) + " m/s");
        
        // Bloc Environnement
        this.setUI('air-temp-c', this.state.temp + "°C");
        this.setUI('pressure-hpa', this.state.press.toFixed(1));
        this.setUI('air-density', this.state.rho.toFixed(4));
        this.setUI('ambient-light', this.state.lux + " lx");
        
        // Bloc Temps & Astro
        this.setUI('ast-jd', this.state.jd.toFixed(6));
        this.setUI('ui-clock', new Date().toLocaleTimeString());
        this.setUI('ui-sextant-status', this.state.isSextantLocked ? "LOCKED" : "SEARCHING");
        
        this.drawArmillary();
    },

    drawArmillary() {
        const c = document.getElementById('gforce-canvas');
        if(!c) return;
        const ctx = c.getContext('2d');
        ctx.clearRect(0,0,c.width,c.height);
        ctx.strokeStyle = this.state.isSextantLocked ? "#00ff88" : "#ff3300";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.width/2, c.height/2, 40, 0, Math.PI*2);
        ctx.stroke();
        // Ligne d'horizon mobile
        ctx.moveTo(20, c.height/2 + this.state.pitch);
        ctx.lineTo(c.width - 20, c.height/2 - this.state.pitch);
        ctx.stroke();
    },

    // 6. HARDWARE & PERMISSIONS
    async initHardware() {
        window.ondevicemotion = (e) => {
            this.state.accel = e.accelerationIncludingGravity || {x:0, y:0, z:0};
        };
        window.ondeviceorientation = (e) => {
            this.state.pitch = e.beta; this.state.heading = e.alpha;
        };
        if ('PressureSensor' in window) {
            const s = new PressureSensor({frequency: 10});
            s.onreading = () => this.state.press = s.pressure;
            s.start();
        }
    },

    setUI(id, val) { 
        const el = document.getElementById(id); 
        if(el) el.innerText = val; 
    },
    
    log(msg) {
        const l = document.getElementById('anomaly-log');
        if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML;
    }
};

function startAdventure() { OMNI.boot(); }
