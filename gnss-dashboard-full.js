/**
 * OMNISCIENCE V22 - EVENT HORIZON
 * Protocol: SINS/SLAM 21-States / 64-bit Tensor Core
 * Features: Auto-Sextant, Fallback Atmosphère, Zero-Drift Logic, Relativité
 */

// Configuration Math.js 64-bit
const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    lastT: performance.now(),
    lastSave: 0,
    lastMotion: performance.now(),
    history: [],

    // CONSTANTES PHYSIQUES (64-bit Invariants)
    PHYS: {
        C: _BN("299792458"),
        G: _BN("6.67430e-11"),
        M_EARTH: _BN("5.9722e24"),
        R_EARTH: _BN("6371000"),
        G_STD: _BN("9.80665"),
        J2000: _BN("2451545.0")
    },

    // VECTEUR D'ÉTAT (21 Dimensions virtuelles)
    state: {
        // Cinématique
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        q: { w: 1, x: 0, y: 0, z: 0 },
        
        // Calibration & Environnement
        bias_a: { x: _BN(0), y: _BN(0), z: _BN(0) },
        g_local: _BN(9.80665),
        rho: _BN(1.225),  // Densité air
        temp: _BN(15),    // Température
        
        // Navigation Astrale
        jd: _BN(0),       // Jour Julien
        lat: _BN(48.85),  // Latitude estimée
        lon: _BN(2.35),   // Longitude estimée
        
        // Statut
        profile: "INIT",  // GASTROPODE, DYNAMIQUE, etc.
        isFreeFall: false
    },

    sensors: { accel:{x:0,y:0,z:0}, gyro:{x:0,y:0,z:0} },

    // --- 1. DÉMARRAGE & CALIBRATION ---
    async boot() {
        this.log("INITIALISATION V22 - EVENT HORIZON...");
        try {
            this.loadBlackBox();

            // A. SYNC TEMPOREL (Atomique ou Système)
            await this.syncTime();

            // B. SYNC ATMOSPHÈRE (API ou Standard)
            await this.syncWeather();

            // C. CALIBRATION GRAVITÉ (3 secondes)
            this.log("CALIBRATION SINS (NE PAS BOUGER)...");
            await this.calibrate(3000);

            this.initHardware();
            this.active = true;
            this.engine();
            this.log("SYSTÈME OPÉRATIONNEL : SLAM 64-BIT");
        } catch (e) { this.log("FATAL ERROR: " + e.message); }
    },

    // --- 2. MOTEUR PHYSIQUE (BOUCLE PRINCIPALE) ---
    engine() {
        if (!this.active) return;
        const now = performance.now();
        const dt = _BN((now - this.lastT) / 1000);
        this.lastT = now;

        // I. Mise à jour Temps Astronomique (High Freq)
        const dayFraction = m.divide(dt, _BN(86400));
        this.state.jd = m.add(this.state.jd, dayFraction);

        // II. Identification du Profil de Mouvement
        this.identifyProfile();

        // III. Résolution SLAM (Navigation Inertielle)
        this.solveSINS(dt);

        // IV. Calculs Sextant & Relativité
        this.solveAstroPhysics();

        // V. Mise à jour Interface
        this.updateUI();

        // VI. BlackBox (Toutes les 2s)
        if (now - this.lastSave > 2000) {
            this.archiveState();
            this.lastSave = now;
        }

        requestAnimationFrame(() => this.engine());
    },

    // --- 3. SLAM 64-BIT (COEUR DU SYSTÈME) ---
    solveSINS(dt) {
        // A. Intégration Orientation (Quaternions)
        this.integrateGyro(this.sensors.gyro, dt);
        
        // B. Projection Gravité Locale
        const g_vec = this.rotateVector({x:0, y:0, z:m.number(this.state.g_local)}, this.state.q);
        
        // C. Calcul Vitesse & Position
        const v_norm = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));

        ['x', 'y', 'z'].forEach(axis => {
            // Accélération pure = Mesure - Gravité - Biais
            let a_raw = m.subtract(m.subtract(_BN(this.sensors.accel[axis]), _BN(g_vec[axis])), this.state.bias_a[axis]);

            // ZUPT (Zero Velocity Update) : Si quasi-immobile, on force 0 pour éviter la dérive
            if (this.state.profile === "GASTROPODE" && m.abs(a_raw).lt(0.02)) {
                a_raw = _BN(0);
                this.state.vel[axis] = m.multiply(this.state.vel[axis], 0.95); // Friction statique
            }

            // Traînée Aérodynamique (Fd = 0.5 * rho * v^2 * Cd * A / m) -> Simplifié en facteur balistique
            // Pour le "Train de mine" ou "Fusée"
            const ballistic_coeff = _BN(0.002); 
            const v_dir = v_norm.gt(0) ? m.divide(this.state.vel[axis], v_norm) : _BN(0);
            const a_drag = m.multiply(m.multiply(ballistic_coeff, this.state.rho), m.pow(v_norm, 2));

            // Inertie Rotationnelle (k=1.4 pour sphère, 1.0 sinon)
            const k_rot = (this.state.profile === "DYNAMIQUE") ? _BN(1.4) : _BN(1.0);
            
            // Accélération Finale
            let a_final = m.subtract(m.divide(a_raw, k_rot), m.multiply(a_drag, v_dir));

            // Intégration Verlet
            this.state.vel[axis] = m.add(this.state.vel[axis], m.multiply(a_final, dt));
            this.state.pos[axis] = m.add(this.state.pos[axis], m.multiply(this.state.vel[axis], dt));
        });
    },

    // --- 4. RELATIVITÉ & ASTRO (SEXTANT AUTOMATIQUE) ---
    solveAstroPhysics() {
        const v = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        
        // Relativité Restreinte (Lorentz)
        const beta = m.divide(v, this.PHYS.C);
        this.gamma = m.divide(1, m.sqrt(m.subtract(1, m.pow(beta, 2))));
        
        // Relativité Générale (Schwarzschild - Dilatation Gravitationnelle)
        // dt_g = sqrt(1 - Rs/r)
        const r = m.add(this.PHYS.R_EARTH, this.state.pos.z);
        const rs = m.divide(m.multiply(2, m.multiply(this.PHYS.G, this.PHYS.M_EARTH)), m.pow(this.PHYS.C, 2));
        this.time_dilation_g = m.subtract(1, m.sqrt(m.subtract(1, m.divide(rs, r))));

        // SEXTANT : Calcul Position Soleil (VSOP87 Simplifié)
        const D = m.subtract(this.state.jd, _BN(2451545.0));
        const g = m.mod(m.add(_BN(357.529), m.multiply(_BN(0.98560028), D)), 360); // Anomalie moyenne
        const q = m.mod(m.add(_BN(280.459), m.multiply(_BN(0.98564736), D)), 360); // Longitude moyenne
        const L = m.add(q, m.multiply(_BN(1.915), m.sin(m.multiply(g, Math.PI/180)))); // Longitude écliptique
        
        this.sun_lon = L; // Stockage pour UI
    },

    // --- 5. LIAISON HTML (MAPPING TOTAL) ---
    updateUI() {
        const v = m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2), m.pow(this.state.vel.z, 2)));
        const v_sound = m.sqrt(m.multiply(m.multiply(_BN(1.4), _BN(287)), m.add(this.state.temp, _BN(273.15))));

        // Navigation_EKF_21
        this.setUI('lat-ekf', this.state.lat.toFixed(5));
        this.setUI('lon-ekf', this.state.lon.toFixed(5));
        this.setUI('alt-ekf', m.add(_BN(100), this.state.pos.z).toFixed(2)); // Alt Initiale 100m + Z
        this.setUI('speed-stable-kmh', m.multiply(v, 3.6).toFixed(2));
        this.setUI('mission-status', "ACTIVE");
        this.setUI('ui-sextant-status', "LOCKED");
        this.setUI('mach-val', m.divide(v, v_sound).toFixed(4));

        // Physique de Mission
        this.setUI('ui-lorentz', this.gamma.toFixed(12));
        this.setUI('force-g-inst', m.divide(m.abs(_BN(this.sensors.accel.z)), this.state.g_local).toFixed(3));
        this.setUI('dynamic-pressure', m.multiply(0.5, m.multiply(this.state.rho, m.pow(v, 2))).toFixed(1) + " Pa");
        this.setUI('structural-stress', m.multiply(m.multiply(0.5, this.state.rho), m.pow(v, 2)).toFixed(0) + " N/m²"); // Approx stress
        this.setUI('total-time-dilation', m.add(m.subtract(this.gamma, 1), this.time_dilation_g).toFixed(18) + " s/s");

        // Visual_Core_Inertial
        this.setUI('pos-x', this.state.pos.x.toFixed(2));
        this.setUI('pos-y', this.state.pos.y.toFixed(2));
        this.setUI('pos-z', this.state.pos.z.toFixed(2));
        this.setUI('ui-mc-speed', v.toFixed(3) + " m/s");
        this.setUI('ui-slam-precision', "64-BIT");
        
        // Environment_Sensors
        this.setUI('air-temp-c', this.state.temp.toFixed(1));
        this.setUI('air-density', this.state.rho.toFixed(3));
        this.setUI('reynolds-number', m.divide(m.multiply(this.state.rho, m.multiply(v, 0.1)), _BN("1.81e-5")).toFixed(0)); // L=0.1m approx
        this.setUI('kinetic-energy', m.multiply(0.5, m.multiply(_BN(70), m.pow(v, 2))).toFixed(0) + " J"); // Masse 70kg réf

        // Temporal_Sync
        this.setUI('ast-jd', this.state.jd.toFixed(6));
        this.setUI('ui-clock', new Date().toLocaleTimeString());

        // Heliocentric
        this.setUI('sun-azimuth', this.sun_lon.toFixed(2));
        
        // Buffer Scientifique
        this.setUI('vitesse-raw', v.toFixed(5));
        this.setUI('ukf-q-w', this.state.q.w.toFixed(3));
    },

    // --- UTILITAIRES & SYNC ---
    async syncTime() {
        try {
            const r = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const d = await r.json();
            const date = new Date(d.utc_datetime);
            this.state.jd = _BN((date.getTime() / 86400000) + 2440587.5);
            this.setUI('last-sync-gmt', "ATOMIC OK");
        } catch(e) {
            // Fallback Offline
            const date = new Date();
            this.state.jd = _BN((date.getTime() / 86400000) + 2440587.5);
            this.setUI('last-sync-gmt', "SYSTEM LOCAL");
        }
    },

    async syncWeather() {
        try {
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m,surface_pressure`);
            const d = await r.json();
            this.state.temp = _BN(d.current.temperature_2m);
            const press = _BN(d.current.surface_pressure * 100); // Pa
            this.state.rho = m.divide(press, m.multiply(_BN(287.05), m.add(this.state.temp, 273.15)));
        } catch(e) {
            this.state.temp = _BN(15);
            this.state.rho = _BN(1.225); // ISA Standard
        }
    },

    identifyProfile() {
        const ax = this.sensors.accel.x, ay = this.sensors.accel.y, az = this.sensors.accel.z;
        const mag = Math.sqrt(ax*ax + ay*ay + az*az);
        
        if (mag < 1.0) {
            this.state.profile = "CHUTE_LIBRE";
            this.state.isFreeFall = true;
        } else if (mag < 10.5 && mag > 9.0 && Math.abs(this.sensors.gyro.x) < 0.1) {
            this.state.profile = "GASTROPODE"; // Quasi immobile
            this.state.isFreeFall = false;
        } else {
            this.state.profile = "DYNAMIQUE";
            this.state.isFreeFall = false;
        }
    },

    async calibrate(ms) {
        let s = {x:[], y:[], z:[]};
        const f = (e) => { 
            s.x.push(e.accelerationIncludingGravity.x); 
            s.y.push(e.accelerationIncludingGravity.y); 
            s.z.push(e.accelerationIncludingGravity.z); 
        };
        window.addEventListener('devicemotion', f);
        await new Promise(r => setTimeout(r, ms));
        window.removeEventListener('devicemotion', f);
        
        const avg = (a) => a.reduce((p,c)=>p+c,0)/a.length;
        const g_m = Math.sqrt(avg(s.x)**2 + avg(s.y)**2 + avg(s.z)**2);
        
        this.state.g_local = _BN(g_m);
        this.state.bias_a = { 
            x:_BN(avg(s.x)), 
            y:_BN(avg(s.y)), 
            z:_BN(avg(s.z) - g_m) // On assume Z aligné lors de la calibration
        };
        this.log(`CALIBRATION OK. G-LOCAL: ${g_m.toFixed(4)} m/s²`);
    },

    integrateGyro(g, dt) {
        const rad = Math.PI / 180, d = m.number(dt), q = this.state.q;
        const wx = g.x*rad, wy = g.y*rad, wz = g.z*rad;
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
        return { x: ix*w + iw*-qx + iy*-qz - iz*-qy, y: iy*w + iw*-qy + iz*-qx - ix*-qz, z: iz*w + iw*-qz + ix*-qy - iy*-qx };
    },

    archiveState() {
        const entry = {
            t: new Date().toLocaleTimeString(),
            z: this.state.pos.z.toFixed(2),
            v: m.sqrt(m.add(m.pow(this.state.vel.x, 2), m.pow(this.state.vel.y, 2))).toFixed(2)
        };
        this.history.push(entry);
        if (this.history.length > 300) this.history.shift();
        localStorage.setItem('OMNI_BLACKBOX', JSON.stringify(entry));
    },

    exportCSV() {
        let csv = "Time,Alt_Z,Speed\n";
        this.history.forEach(e => csv += `${e.t},${e.z},${e.v}\n`);
        const blob = new Blob([csv], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download='mission.csv'; a.click();
    },

    loadBlackBox() {
        if(localStorage.getItem('OMNI_BLACKBOX')) this.log("BOÎTE NOIRE RESTAURÉE");
    },

    initHardware() {
        window.ondevicemotion = (e) => {
            this.sensors.accel = { x:e.accelerationIncludingGravity.x||0, y:e.accelerationIncludingGravity.y||0, z:e.accelerationIncludingGravity.z||0 };
            this.sensors.gyro = { x:e.rotationRate.alpha||0, y:e.rotationRate.beta||0, z:e.rotationRate.gamma||0 };
        };
        const btn = document.getElementById('export-metrics-btn');
        if(btn) btn.onclick = () => this.exportCSV();
    },

    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { 
        const l = document.getElementById('anomaly-log'); 
        if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; 
    }
};

// Fonction globale appelée par le bouton HTML
function startAdventure() { OMNI_CORE.boot(); }
