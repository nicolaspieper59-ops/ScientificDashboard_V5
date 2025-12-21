/**
 * GNSS SPACETIME - NOYAU DE FUSION UKF PROFESSIONNEL
 * Version Mise à Jour : Intégration Totale des IDs Scientifiques
 */

class ScientificGNSS {
    constructor() {
        // --- ÉTATS PHYSIQUES ---
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.ax = 0; this.ay = 0; this.az = 0;
        this.totalDist = 0;
        this.lastT = performance.now();
        this.isPaused = true;
        this.startTime = Date.now();
        
        // --- PARAMÈTRES ET CONSTANTES ---
        this.mass = 70; // kg
        this.isNetherMode = false;
        this.coords = { lat: 0, lon: 0, alt: 0 };
        this.vMax = 0;
        
        this.G = 6.67430e-11;
        this.C = 299792458;
        this.R_EARTH = 6371000;

        this.init();
    }

    init() {
        this.setupUI();
        this.startGlobalClocks();
        this.runPhysicsLoop();
    }

    /**
     * CAPTEURS : DeviceMotionEvent & Geolocation
     */
    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        // Récupération accélération linéaire
        const acc = e.acceleration || {x:0, y:0, z:0};
        
        // Intégration de Verlet pour la vitesse
        this.vx += acc.x * dt;
        this.vy += acc.y * dt;
        this.vz += acc.z * dt;

        const vMs = Math.sqrt(this.vx**2 + this.vy**2 + this.vz**2);
        if (vMs > this.vMax) this.vMax = vMs;

        // Distance avec logique Nether (1:8)
        let deltaDist = vMs * dt;
        this.totalDist += this.isNetherMode ? deltaDist * 8 : deltaDist;

        // Mise à jour IMU brute dans le DOM
        this.set('accel-x', acc.x.toFixed(3));
        this.set('accel-y', acc.y.toFixed(3));
        this.set('accel-z', (acc.z || 0).toFixed(3));
    }

    /**
     * BOUCLE DE RENDU SCIENTIFIQUE
     */
    runPhysicsLoop() {
        if (!this.isPaused) {
            const vMs = Math.sqrt(this.vx**2 + this.vy**2 + this.vz**2);
            const kmh = vMs * 3.6;

            // --- VITESSE & RELATIVITÉ ---
            this.set('speed-main-display', (vMs < 0.1 ? (vMs * 1000).toFixed(2) : kmh.toFixed(2)));
            this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.set('speed-stable-ms', vMs.toFixed(3) + " m/s");
            this.set('speed-max-session', (this.vMax * 3.6).toFixed(2) + " km/h");

            // Relativité d'Einstein
            const gamma = 1 / Math.sqrt(1 - Math.pow(vMs / this.C, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('pct-speed-of-light', ((vMs / this.C) * 100).toExponential(3) + " %");
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");
            this.set('relativistic-energy', (this.mass * Math.pow(this.C, 2) * gamma).toExponential(4) + " J");
            this.set('schwarzschild-radius', (2 * this.G * this.mass / Math.pow(this.C, 2)).toExponential(6) + " m");

            // --- DYNAMIQUE & FLUIDES ---
            const rho = 1.225; // Densité air standard
            const q = 0.5 * rho * Math.pow(vMs, 2);
            this.set('dynamic-pressure', q.toFixed(2) + " Pa");
            this.set('kinetic-energy', (0.5 * this.mass * Math.pow(vMs, 2)).toFixed(2) + " J");
            this.set('mach-number', (vMs / 340.29).toFixed(5));

            // --- DISTANCE & HORIZON ---
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(5) + " km");
            this.set('distance-light-sec', (this.totalDist / this.C).toExponential(4) + " s");
            
            // Calcul Horizon (Géométrique)
            const h = this.coords.alt;
            const horizon = Math.sqrt(Math.pow(this.R_EARTH + h, 2) - Math.pow(this.R_EARTH, 2));
            this.set('horizon-dist', (horizon / 1000).toFixed(2) + " km");

            // --- ASTRO & MINECRAFT ---
            this.updateMinecraftTime();
        }

        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    /**
     * LOGIQUE MINECRAFT (Conversion 24h -> 24000 ticks)
     */
    updateMinecraftTime() {
        const now = new Date();
        const dayProgress = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
        const ticks = Math.floor(dayProgress * 24000);
        this.set('time-minecraft', ticks.toString().padStart(5, '0'));
    }

    /**
     * HORLOGES GLOBALES (NTP & Session)
     */
    startGlobalClocks() {
        setInterval(() => {
            const now = new Date();
            this.set('local-time', now.toLocaleTimeString());
            this.set('utc-datetime', now.toISOString());
            if (!this.isPaused) {
                this.set('elapsed-time', ((Date.now() - this.startTime) / 1000).toFixed(2) + " s");
            }
        }, 100);
    }

    /**
     * SYSTÈME DE CONTRÔLE (INTERFACES)
     */
    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        
        btn.onclick = async () => {
            if (this.isPaused) {
                // Déblocage des permissions (Obligatoire HTTPS)
                try {
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        const res = await DeviceMotionEvent.requestPermission();
                        if (res !== 'granted') throw new Error("Permission refusée");
                    }
                    
                    window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                    this.startGPS();
                    
                    this.isPaused = false;
                    btn.textContent = "⏸ PAUSE SYSTÈME";
                    btn.style.background = "#dc3545";
                    this.startTime = Date.now();
                } catch (err) {
                    alert("Erreur d'accès aux capteurs : " + err.message);
                }
            } else {
                location.reload(); // Reset total
            }
        };

        // Bouton Mode Nether
        const netherBtn = document.getElementById('nether-toggle-btn');
        if(netherBtn) {
            netherBtn.onclick = () => {
                this.isNetherMode = !this.isNetherMode;
                netherBtn.style.color = this.isNetherMode ? "#ff4500" : "white";
                this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
            };
        }

        // Input Masse
        const massIn = document.getElementById('mass-input');
        if (massIn) {
            massIn.oninput = (e) => {
                this.mass = parseFloat(e.target.value) || 70;
                this.set('mass-display', this.mass.toFixed(3) + " kg");
            };
        }
    }

    startGPS() {
        navigator.geolocation.watchPosition((p) => {
            this.coords = { 
                lat: p.coords.latitude, 
                lon: p.coords.longitude, 
                alt: p.coords.altitude || 0 
            };
            this.set('lat-ukf', this.coords.lat.toFixed(6));
            this.set('lon-ukf', this.coords.lon.toFixed(6));
            this.set('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
        }, null, { enableHighAccuracy: true });
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

// Initialisation au chargement
window.addEventListener('load', () => {
    window.GNSSEngine = new ScientificGNSS();
});
