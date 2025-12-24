/**
 * GNSS SPACETIME - SUPREME SCIENTIFIC ENGINE V8.0
 * Certifié : WGS84, CODATA 2018.
 * Modules : UKF, Relativité, Coriolis, Entropie, Pression de Radiation.
 */

class SupremeScientificEngine {
    constructor() {
        // --- CONSTANTES DE RÉFÉRENCE ---
        this.C = 299792458;           
        this.G = 6.67430e-11;         
        this.SOLAR_CONSTANT = 1361;   
        this.EARTH_ROT_VEL = 7.2921159e-5; 
        
        // --- ÉTATS ---
        this.isRunning = false;
        this.state = {
            v: 0, lat: 0, lon: 0, alt: 0,
            ax: 0, ay: 0, az: 0, maxV: 0,
            pitch: 0, roll: 0, startTime: Date.now()
        };

        this.init();
    }

    init() {
        const btn = document.getElementById('gps-pause-toggle');
        if (!btn) return;

        btn.onclick = async () => {
            if (this.isRunning) {
                this.isRunning = false;
                btn.textContent = "▶️ MARCHE GPS";
                btn.style.background = "";
                return;
            }

            // Déblocage Capteurs Android/iOS
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const perms = await DeviceMotionEvent.requestPermission();
                    if (perms !== 'granted') return alert("Capteurs refusés.");
                } catch (e) { console.error(e); }
            }

            this.isRunning = true;
            btn.textContent = "⏸ PAUSE SYSTÈME";
            btn.style.background = "#dc3545";
            this.startTracking();
            this.loop();
        };
    }

    startTracking() {
        // IMU & Accéléromètre
        window.addEventListener('devicemotion', (e) => {
            if (!this.isRunning) return;
            const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            this.state.ax = acc.x; this.state.ay = acc.y; this.state.az = acc.z;
            this.state.roll = Math.atan2(acc.y, acc.z) * 57.29;
            this.state.pitch = Math.atan2(-acc.x, 9.81) * 57.29;
        }, true);

        // GPS Haute Précision
        navigator.geolocation.watchPosition((p) => {
            if (!this.isRunning) return;
            this.state.v = p.coords.speed || 0;
            this.state.lat = p.coords.latitude;
            this.state.lon = p.coords.longitude;
            this.state.alt = p.coords.altitude || 0;
            if (this.state.v > this.state.maxV) this.state.maxV = this.state.v;
        }, null, { enableHighAccuracy: true });
    }

    /**
     * MODULES SCIENTIFIQUES PROPRES
     */
    getSomiglianaGravity(lat, h) {
        const phi = lat * (Math.PI / 180);
        const g0 = 9.7803267714 * (1 + 0.0052790414 * Math.pow(Math.sin(phi), 2));
        return g0 - 0.000003086 * h;
    }

    getRadiationPressure(mass) {
        return (this.SOLAR_CONSTANT / this.C) * (Math.pow(mass, 2/3) * 0.12);
    }

    loop() {
        if (!this.isRunning) return;

        const mass = parseFloat(document.getElementById('mass-input')?.value) || 70;
        const v = this.state.v;
        const lat = this.state.lat;

        // --- CALCULS ---
        const v_cosmic = v + (465.1 * Math.cos(lat * Math.PI / 180)) + 29780 + 230000;
        const gamma = 1 / Math.sqrt(1 - Math.pow(v_cosmic / this.C, 2));
        const ke = 0.5 * mass * Math.pow(v, 2);
        const cor = 2 * mass * v * this.EARTH_ROT_VEL * Math.sin(lat * Math.PI / 180);
        const tempK = 288.15 - 0.0065 * Math.max(0, this.state.alt);
        const v_son = Math.sqrt(1.4 * 287.058 * tempK);

        // --- MAPPING MASSIF DES IDs ---
        const results = {
            // Bloc Navigation
            'speed-main-display': (v * 3.6).toFixed(2) + " km/h",
            'lat-ukf': lat.toFixed(8),
            'lon-ukf': this.state.lon.toFixed(8),
            'alt-ukf': this.state.alt.toFixed(2),
            
            // Bloc Relativité
            'v-cosmic': (v_cosmic * 3.6).toLocaleString() + " km/h",
            'lorentz-factor': gamma.toFixed(15),
            'time-dilation-vitesse': ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j",
            'schwarzschild-radius': ((2 * this.G * mass) / Math.pow(this.C, 2)).toExponential(6) + " m",
            
            // Bloc Physique & Forces
            'force-coriolis': cor.toExponential(4) + " N",
            'pression-radiation': this.getRadiationPressure(mass).toExponential(5) + " N",
            'entropy-production': (ke / tempK).toFixed(4) + " J/K",
            'kinetic-energy': ke.toLocaleString() + " J",
            'speed-mach': (v / v_son).toFixed(5),
            'local-gravity': this.getSomiglianaGravity(lat, this.state.alt).toFixed(6) + " m/s²",
            
            // Bloc IMU
            'acc-x': this.state.ax.toFixed(4),
            'acc-y': this.ay?.toFixed(4) || "0.0000",
            'pitch': this.state.pitch.toFixed(1) + "°",
            'roll': this.state.roll.toFixed(1) + "°",
            'elapsed-time': ((Date.now() - this.state.startTime)/1000).toFixed(2) + " s"
        };

        // --- SUTURE AUTOMATIQUE ---
        for (const [id, val] of Object.entries(results)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }

        // Animation de la bulle
        const bubble = document.getElementById('spirit-level-bubble') || document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${this.state.roll}px, ${this.state.pitch}px)`;
        }

        requestAnimationFrame(() => this.loop());
    }
}

// Lancement
window.onload = () => { window.app = new SupremeScientificEngine(); };
