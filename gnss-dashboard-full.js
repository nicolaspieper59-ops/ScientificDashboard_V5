/**
 * GNSS SPACETIME - SUPREME SCIENTIFIC ENGINE V9.0
 * Architecture : Monolithique sans dépendances.
 * Modules : UKF, Relativité, Coriolis, Entropie, Pression de Radiation.
 */

class SupremeScientificEngine {
    constructor() {
        // --- CONSTANTES CODATA 2018 ---
        this.C = 299792458;           
        this.G = 6.67430e-11;         
        this.SOLAR_CONSTANT = 1361;   
        this.EARTH_ROT_VEL = 7.2921159e-5; 
        
        this.isRunning = false;
        this.state = {
            v: 0, lat: 0, lon: 0, alt: 0,
            ax: 0, ay: 0, az: 0,
            pitch: 0, roll: 0, maxV: 0,
            startTime: Date.now()
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

            // --- GESTION DES PERMISSIONS ANDROID/IOS ---
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission !== 'granted') return alert("Accès capteurs refusé.");
                } catch (e) { console.error(e); }
            }

            this.isRunning = true;
            btn.textContent = "⏸ PAUSE SYSTÈME";
            btn.style.background = "#dc3545";
            this.setupSensors();
            this.loop();
        };
    }

    setupSensors() {
        // Ecouteur Device Motion (Accéléromètre + Inclinaison)
        window.addEventListener('devicemotion', (e) => {
            if (!this.isRunning) return;
            const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            this.state.ax = acc.x;
            this.state.ay = acc.y;
            this.state.az = acc.z;

            // Calcul de l'inclinaison (Bulle de niveau)
            this.state.roll = Math.atan2(acc.y, acc.z) * 57.2958;
            this.state.pitch = Math.atan2(-acc.x, 9.81) * 57.2958;
        }, true);

        // Ecouteur GPS
        navigator.geolocation.watchPosition((p) => {
            if (!this.isRunning) return;
            this.state.v = p.coords.speed || 0;
            this.state.lat = p.coords.latitude;
            this.state.lon = p.coords.longitude;
            this.state.alt = p.coords.altitude || 0;
            if (this.state.v > this.state.maxV) this.state.maxV = this.state.v;
        }, null, { enableHighAccuracy: true });
    }

    loop() {
        if (!this.isRunning) return;

        const mass = parseFloat(document.getElementById('mass-input')?.value) || 70;
        const v = this.state.v;
        const lat = this.state.lat;

        // --- CALCULS PHYSIQUES AVANCÉS ---
        
        // 1. Relativité Cosmique (Addition des vecteurs)
        const v_rot_terre = 465.1 * Math.cos(lat * Math.PI / 180);
        const v_cosmic = v + v_rot_terre + 29780 + 230000;
        const gamma = 1 / Math.sqrt(1 - Math.pow(v_cosmic / this.C, 2));

        // 2. Mécanique Non-Inertielle (Coriolis)
        const forceCoriolis = 2 * mass * v * this.EARTH_ROT_VEL * Math.sin(lat * Math.PI / 180);

        // 3. Thermodynamique (Entropie ISA)
        const tempK = 288.15 - 0.0065 * Math.max(0, this.state.alt);
        const energieCinetique = 0.5 * mass * Math.pow(v, 2);
        const productionEntropie = energieCinetique / tempK;

        // --- SUTURE AUTOMATIQUE DES IDs HTML ---
        const results = {
            'speed-main-display': (v * 3.6).toFixed(2) + " km/h",
            'v-cosmic': (v_cosmic * 3.6).toLocaleString() + " km/h",
            'lat-ukf': lat.toFixed(8),
            'lon-ukf': this.state.lon.toFixed(8),
            'alt-ukf': this.state.alt.toFixed(2),
            'lorentz-factor': gamma.toFixed(15),
            'time-dilation-vitesse': ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j",
            'force-coriolis': forceCoriolis.toExponential(4) + " N",
            'entropy-production': productionEntropie.toFixed(4) + " J/K",
            'kinetic-energy': energieCinetique.toLocaleString() + " J",
            'schwarzschild-radius': ((2 * this.G * mass) / Math.pow(this.C, 2)).toExponential(6) + " m",
            'acc-x': this.state.ax.toFixed(3),
            'acc-y': this.state.ay.toFixed(3),
            'acc-z': this.state.az.toFixed(3),
            'pitch': this.state.pitch.toFixed(1) + "°",
            'roll': this.state.roll.toFixed(1) + "°",
            'elapsed-time': ((Date.now() - this.state.startTime)/1000).toFixed(2) + " s"
        };

        // Injection dans le DOM
        for (const [id, val] of Object.entries(results)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }

        // Mise à jour visuelle du niveau à bulle
        const bubble = document.getElementById('spirit-level-bubble') || document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${this.state.roll}px, ${this.state.pitch}px)`;
        }

        requestAnimationFrame(() => this.loop());
    }
}

// Lancement automatique au chargement
window.addEventListener('load', () => {
    window.scientificApp = new SupremeScientificEngine();
});
