/**
 * OMNISCIENCE V25.9.11 - X-TREME_ADAPT
 * Spécial : Grande vitesse, Micro-mouvement & Souterrain
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (val) => m.bignumber(val);

const OMNI = {
    active: false,
    v: _BN(0),
    dist: _BN(0),
    pos: { lat: 0, lon: 0, alt: 0, acc: 100, speed: 0 },
    accBuffer: [],
    orientation: { a: 0, b: 0, g: 0 },
    current_mag: 0,
    mode: "NEUTRAL", 

    // --- MOTEURS PHYSIQUES ADAPTATIFS ---
    PHYSICS: {
        "MICRO": { m: 0.001, gate: 0.005, decay: 0.99, label: "GASTÉROPODE/INSECTE" },
        "BIO":   { m: 80,    gate: 0.15,  decay: 0.92, label: "HUMAIN/OISEAU" },
        "HEAVY": { m: 5000,  gate: 0.05,  decay: 0.998, label: "TRAIN/WAGON/MANÈGE" },
        "AERO":  { m: 50000, gate: 0.10,  decay: 1.0,   label: "FUSÉE/AVION/DRONE" }
    },

    async start() {
        this.log("SCANNING ENVIRONMENT...");
        this.activate();
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try { await DeviceMotionEvent.requestPermission(); } catch(e) {}
        }
    },

    activate() {
        this.active = true;
        window.addEventListener('devicemotion', (e) => this.coreLoop(e), true);
        window.addEventListener('deviceorientation', (e) => {
            this.orientation = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
        }, true);

        navigator.geolocation.watchPosition(p => {
            this.pos = { lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude || 0, acc: p.coords.accuracy, speed: p.coords.speed || 0 };
        }, null, { enableHighAccuracy: true });

        setInterval(() => this.autoDetectMode(), 1000); // IA de détection
        setInterval(() => this.refreshHUD(), 100);
    },

    // --- CERVEAU : DÉTECTE SI C'EST UNE FUSÉE OU UN ESCARGOT ---
    autoDetectMode() {
        const avgAcc = this.accBuffer.length > 0 ? math.mean(this.accBuffer) : 0;
        const speedKmh = Number(this.v) * 3.6;
        const gpsLost = this.pos.acc > 60; // Souterrain / Tunnel

        if (speedKmh > 400 || this.pos.alt > 2000) this.mode = "AERO";
        else if (gpsLost && avgAcc < 0.3) this.mode = "HEAVY"; // Wagonnet de mine (roule fluide)
        else if (avgAcc > 0.005 && avgAcc < 0.1 && speedKmh < 1) this.mode = "MICRO"; // Escargot
        else if (avgAcc > 1.2) this.mode = "BIO"; // Secousses (Oiseau/Humain)
        else this.mode = "HEAVY"; // Par défaut (Manège/Toboggan)

        this.accBuffer = []; 
        this.setUI('filter-status', this.PHYSICS[this.mode].label);
    },

    coreLoop(e) {
        if (!this.active) return;
        const dt = 0.05; 
        let acc = e.acceleration || { x: 0, y: 0, z: 0 };
        let mag = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2);
        this.current_mag = mag;
        this.accBuffer.push(mag);

        const P = this.PHYSICS[this.mode];

        // 1. GESTION DE LA VITESSE
        if (this.pos.speed > 0.2 && this.pos.acc < 50) {
            // Fusion GPS (Priorité haute si disponible)
            this.v = _BN(this.pos.speed);
        } else {
            // Inertie pure (Souterrain, Tunnel, Toboggan)
            if (mag > P.gate) {
                // Intégration RK4 adaptée à la masse
                let force = mag; 
                let accel = force - (0.5 * 1.225 * Math.pow(Number(this.v), 2) * 0.3) / P.m;
                this.v = m.add(this.v, accel * dt);
            } else {
                this.v = m.multiply(this.v, P.decay); // Friction selon le milieu
            }
        }
        this.dist = m.add(this.dist, m.multiply(this.v, dt));
    },

    refreshHUD() {
        const v = Number(this.v);
        const dist = Number(this.dist);
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/299792458, 2));

        // Remplissage des champs critiques
        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('speed-stable-ms', v.toFixed(6));
        this.setUI('dist-3d', dist.toFixed(2) + " m");
        
        // Physique avancée
        this.setUI('mach-number', (v / 340.29).toFixed(3));
        this.setUI('g-force-resultant', (this.current_mag / 9.81 + 1).toFixed(3));
        this.setUI('ui-gamma', gamma.toFixed(14));
        this.setUI('relativistic-energy', (gamma * this.PHYSICS[this.mode].m * Math.pow(299792458, 2)).toExponential(3));
        
        // Position & Astro
        this.setUI('lat-ukf', this.pos.lat.toFixed(6));
        this.setUI('lon-ukf', this.pos.lon.toFixed(6));
        this.setUI('alt-display', this.pos.alt.toFixed(1));
        this.setUI('ast-jd', ((new Date() / 86400000) + 2440587.5).toFixed(5));
        this.setUI('horizon-distance-km', (3.57 * Math.sqrt(this.pos.alt || 1.8)).toFixed(2));
        this.setUI('ui-gps-accuracy', this.pos.acc.toFixed(1));
        this.setUI('station-params', this.mode + "_PHYSICS");
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) { const l = document.getElementById('anomaly-log'); if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; }
};

document.getElementById('main-init-btn').addEventListener('click', () => OMNI.start());
