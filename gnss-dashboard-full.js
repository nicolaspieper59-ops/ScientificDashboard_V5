/**
 * OMNISCIENCE V25.9.24 - ULTIMATE_COMMAND_CENTER
 * Système 64-bit : Vitesse 3D, Astro-Éphémérides & Baromètre
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (val) => m.bignumber(val);

const OMNI = {
    active: false,
    v: _BN(0),
    dist: _BN(0),
    lat: _BN(45.419322), 
    lon: _BN(25.533150),
    pos: { alt: 957.5, acc: 100, speed: 0, press: 1013.25 },
    
    lastT: performance.now(),
    orientation: { a: 0, b: 0, g: 0 },
    current_mag: 0,
    last_mag: 0,
    jerk: 0,

    // Constantes Physiques
    C: _BN(299792458),
    R_EARTH: _BN(6371000),
    G_CONST: _BN('6.67430e-11'),
    PLANCK: _BN('6.62607015e-34'),

    async start() {
        this.log("INITIALISATION ASTRO-PHYSIQUE...");
        this.activate();
    },

    activate() {
        this.active = true;

        // 1. CAPTEURS DE MOUVEMENT & PRESSION
        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;
            if (Number(dt) <= 0 || Number(dt) > 0.2) return;

            let acc = e.acceleration || { x: 0, y: 0, z: 0 };
            let mag3D = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
            this.current_mag = mag3D;
            this.jerk = Math.abs(mag3D - this.last_mag) / Number(dt);
            this.last_mag = mag3D;

            this.engineUpdate(_BN(mag3D), dt);
        }, true);

        // Baromètre (si disponible sur mobile)
        if ('RelativeOrientationSensor' in window) {
            window.addEventListener('devicepressure', (e) => {
                this.pos.press = e.pressure;
            });
        }

        window.addEventListener('deviceorientation', (e) => {
            this.orientation = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
        }, true);

        // 2. GPS AVEC FILTRE ANTI-BRUIT
        navigator.geolocation.watchPosition(p => {
            this.pos.acc = p.coords.accuracy;
            if (this.pos.acc < 40) {
                let alpha = 0.2; // Lissage
                this.lat = m.add(m.multiply(this.lat, (1 - alpha)), m.multiply(_BN(p.coords.latitude), alpha));
                this.lon = m.add(m.multiply(this.lon, (1 - alpha)), m.multiply(_BN(p.coords.longitude), alpha));
                this.pos.alt = p.coords.altitude || 957.5;
            }
        }, null, { enableHighAccuracy: true });

        setInterval(() => this.refreshHUD(), 100);
    },

    engineUpdate(mag, dt) {
        if (Number(mag) > 0.01) {
            this.v = m.add(this.v, m.multiply(mag, dt));
        } else {
            this.v = m.multiply(this.v, 0.98); 
        }

        let stepDist = m.multiply(this.v, dt);
        this.dist = m.add(this.dist, stepDist);

        // Navigation Inertielle
        if (this.pos.acc > 50 && Number(this.v) > 0.1) {
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
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/299792458, 2));

        // --- CINÉMATIQUE ---
        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('dist-3d', dist.toFixed(2) + " m");
        this.setUI('g-force-resultant', (this.current_mag / 9.81 + 1).toFixed(3));

        // --- POSITION & BARO ---
        this.setUI('lat-ukf', Number(this.lat).toFixed(6));
        this.setUI('lon-ukf', Number(this.lon).toFixed(6));
        this.setUI('alt-display', this.pos.alt.toFixed(1));
        const altBaro = 44330 * (1 - Math.pow(this.pos.press / 1013.25, 1/5.255));
        this.setUI('alt-baro', altBaro.toFixed(1));

        // --- ASTRO ---
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        this.setUI('ast-jd', jd.toFixed(5));
        this.setUI('tslv', ((jd % 1) * 24).toFixed(2) + " h");
        this.setUI('ast-deltat', "69.2 s"); // Valeur actuelle ΔT
        
        // Phase Lunaire Simplifiée
        const moonCycle = (jd - 2451550.1) / 29.530588853;
        const phase = moonCycle - Math.floor(moonCycle);
        this.setUI('moon-phase-name', phase < 0.5 ? "CROISSANTE" : "DÉCROISSANTE");
        this.setUI('sun-azimuth', ((this.orientation.a + 180) % 360).toFixed(1) + "°");

        // --- PHYSIQUE & QUANTUM ---
        this.setUI('ui-gamma', gamma.toFixed(14));
        this.setUI('planck-const', this.PLANCK.toExponential(3));
        const rho = 1.225 * Math.exp(-this.pos.alt / 8500);
        this.setUI('dynamic-pressure', (0.5 * rho * v * v).toFixed(2));
        this.setUI('reynolds-number', v > 0.1 ? (rho * v / 1.8e-5).toExponential(2) : "LAMINAIRE");

        // --- BIO ---
        this.setUI('adrenaline-level', Math.min(100, (this.jerk * 5)).toFixed(1) + " %");
        this.setUI('kcal-burn', (dist * 0.05).toFixed(2));

        // --- FOOTER ---
        this.setUI('utc-datetime', now.toLocaleTimeString());
        this.setUI('ui-clock-drift', (performance.now() % 1).toFixed(3));
    },

    setUI(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    log(msg) { const l = document.getElementById('anomaly-log'); if (l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; }
};

function startAdventure() { OMNI.start(); }
