/**
 * OMNISCIENCE V25.9.19 - SUPREME_MIND_64BIT
 * Système Intégral : Navigation 3D, G-Force, Astro, Bio & Quantum
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (val) => m.bignumber(val);

const OMNI = {
    active: false,
    // --- CŒUR DE DONNÉES 64 BITS ---
    v: _BN(0), 
    dist: _BN(0),
    lat: _BN(45.4184), 
    lon: _BN(25.5339),
    
    pos: { alt: 954.3, acc: 1000, speed: 0 },
    lastT: performance.now(),
    orientation: { a: 0, b: 0, g: 0 },
    current_mag: 0,
    last_mag: 0,
    jerk: 0,
    mode: "HEAVY",

    // Constantes Physiques
    C: _BN(299792458),
    G_CONST: _BN('6.67430e-11'),
    PLANCK: _BN('6.62607015e-34'),
    R_EARTH: _BN(6371000),

    async start() {
        this.log("INITIALISATION OMNIPOTENCE 64-BIT...");
        this.activate();
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try { await DeviceMotionEvent.requestPermission(); } catch(e) {}
        }
    },

    activate() {
        this.active = true;
        this.log("FLUX PHYSIQUE DÉVERROUILLÉ ✅");

        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;
            if (Number(dt) <= 0 || Number(dt) > 0.2) return;

            let accN = e.acceleration || { x: 0, y: 0, z: 0 };
            let accG = e.accelerationIncludingGravity || { x: 0, y: 0, z: 9.81 };
            
            // Calcul Magnitude 3D (Manèges/Loopings)
            let mag3D = _BN(Math.sqrt(accN.x**2 + accN.y**2 + accN.z**2));
            this.current_mag = Math.sqrt(accG.x**2 + accG.y**2 + accG.z**2);
            
            this.jerk = Math.abs(Number(mag3D) - this.last_mag) / Number(dt);
            this.last_mag = Number(mag3D);

            this.engineUpdate(mag3D, dt);
        }, true);

        window.addEventListener('deviceorientation', (e) => {
            this.orientation = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
        }, true);

        navigator.geolocation.watchPosition(p => {
            this.pos.acc = p.coords.accuracy;
            if (this.pos.acc < 40) {
                this.lat = _BN(p.coords.latitude);
                this.lon = _BN(p.coords.longitude);
                this.pos.alt = p.coords.altitude || 954.3;
                this.pos.speed = p.coords.speed || 0;
            }
        }, null, { enableHighAccuracy: true });

        setInterval(() => this.refreshHUD(), 100);
    },

    engineUpdate(mag, dt) {
        let v_gps = _BN(this.pos.speed || 0);
        
        // --- LOGIQUE DE VITESSE RÉALISTE (Grotte & Manège) ---
        if (this.pos.acc > 50 || Number(mag) > 0.5) {
            // Mode Inertiel : On intègre l'accélération
            let friction = m.multiply(_BN(0.02), this.v); // Résistance naturelle
            let accel_net = m.subtract(mag, friction);
            this.v = m.add(this.v, m.multiply(accel_net, dt));
        } else {
            // Mode Surface : Fusion GPS/Inertie
            this.v = m.add(m.multiply(this.v, 0.8), m.multiply(v_gps, 0.2));
        }
        if (this.v < 0) this.v = _BN(0);

        // --- NAVIGATION À L'ESTIME (Coordonnées sans GPS) ---
        let stepDist = m.multiply(this.v, dt);
        this.dist = m.add(this.dist, stepDist);

        if (this.pos.acc > 50 && Number(this.v) > 0.05) {
            const heading = (this.orientation.a) * (Math.PI / 180);
            const dLat = m.divide(m.multiply(stepDist, Math.cos(heading)), this.R_EARTH);
            const dLon = m.divide(m.multiply(stepDist, Math.sin(heading)), m.multiply(this.R_EARTH, Math.cos(Number(this.lat) * Math.PI / 180)));
            
            this.lat = m.add(this.lat, m.multiply(dLat, 180 / Math.PI));
            this.lon = m.add(this.lon, m.multiply(dLon, 180 / Math.PI));
        }
    },

    refreshHUD() {
        const v = Number(this.v);
        const dist = Number(this.dist);
        const gamma = 1 / Math.sqrt(1 - (v / 299792458)**2);
        const mass = v > 100 ? 50000 : 85; 

        // 1. Cinématique & G-Force
        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('dist-3d', dist.toFixed(2) + " m");
        this.setUI('g-force-resultant', (this.current_mag / 9.81).toFixed(3));
        this.setUI('pitch', (this.orientation.b || 0).toFixed(1));
        this.setUI('roll', (this.orientation.g || 0).toFixed(1));

        // 2. Coordonnées & Espace-Temps
        this.setUI('lat-ukf', Number(this.lat).toFixed(6));
        this.setUI('lon-ukf', Number(this.lon).toFixed(6));
        this.setUI('alt-display', this.pos.alt.toFixed(1));
        this.setUI('ui-gamma', gamma.toFixed(14));
        this.setUI('distance-light-s', (dist / 299792458).toExponential(5));

        // 3. Mécanique & Fluides
        const rho = 1.225 * Math.exp(-this.pos.alt / 8500);
        this.setUI('mach-number', (v / 340.29).toFixed(3));
        this.setUI('dynamic-pressure', (0.5 * rho * v * v).toFixed(2));
        this.setUI('reynolds-number', v > 0.1 ? (rho * v * 1.5 / 1.8e-5).toExponential(1) : "LAMINAIRE");

        // 4. Bio_SVT & Quantum
        this.setUI('adrenaline-level', Math.min(100, (this.jerk * 5)).toFixed(1) + " %");
        this.setUI('kcal-burn', (dist * 0.05).toFixed(2));
        this.setUI('relativistic-energy', m.multiply(gamma, mass, m.pow(this.C, 2)).toExponential(3));
        this.setUI('planck-const', this.PLANCK.toExponential(3));

        // 5. Astro
        const jd = (Date.now() / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(5));
        this.setUI('tslv', ((jd % 1) * 24).toFixed(2) + " h");
        this.setUI('horizon-distance-km', (3.57 * Math.sqrt(this.pos.alt)).toFixed(2));

        // Status
        this.setUI('filter-status', this.pos.acc > 50 ? "DEEP_CAVE_64B" : "GPS_LOCKED");
        this.setUI('station-params', (this.current_mag > 15 ? "ROLLERCOASTER" : "NOMINAL"));
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) { const l = document.getElementById('anomaly-log'); if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; }
};

document.getElementById('main-init-btn').addEventListener('click', () => OMNI.start());
