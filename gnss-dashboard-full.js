/**
 * GNSS SPACETIME ENGINE - V410 "ULTIMATE-OMEGA"
 * -----------------------------------------------
 * Navigation Inertielle, Relativité 4D/5D & Géométrie Fractale
 * Gestion des Singularités et Distances Astronomiques
 */

class UniversalUKF {
    constructor() {
        this.C = 299792458;
        this.G_EARTH = 9.80665;
        
        this.isRunning = false;
        this.refMode = 'global'; 
        this.isCalibrating = true;
        this.firstRun = true; 
        this.lastTimestamp = performance.now();
        
        this.estimatedRadius = Infinity; 
        this.totalDistance = 0; // Distance physique (m)
        this.totalDistance4D = 0; // Distance espace-temps
        this.vMax = 0;

        this.x = math.matrix(math.zeros([10, 1]));
        this.x.set([6, 0], 1); 
        this.bias = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };

        this.init();
    }

    init() {
        const toggleBtn = document.getElementById('gps-pause-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', async () => {
                if (!this.isRunning) {
                    if (await this.requestPermissions()) this.start();
                } else { location.reload(); }
            });
        }
        
        const refBtn = document.getElementById('toggle-ref-mode') || this.createRefButton();
        refBtn.onclick = () => this.switchReference();
    }

    async requestPermissions() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            return await DeviceMotionEvent.requestPermission() === 'granted';
        }
        return true;
    }

    start() {
        this.isRunning = true;
        this.lastTimestamp = performance.now();
        if (document.getElementById('gps-pause-toggle')) {
            document.getElementById('gps-pause-toggle').innerHTML = "⏸ SYSTÈME ACTIF";
        }

        window.addEventListener('devicemotion', (e) => this.predict(e), true);
        navigator.geolocation.watchPosition((p) => this.fuseGPS(p), null, {enableHighAccuracy: true});

        this.render();
    }

    switchReference() {
        this.refMode = (this.refMode === 'global') ? 'relative' : 'global';
        const btn = document.getElementById('toggle-ref-mode');
        btn.innerHTML = (this.refMode === 'global') ? "🛰️ MODE: GLOBAL" : "⚓ MODE: RELATIF (PONT)";
        this.x.set([3, 0], 0); this.x.set([4, 0], 0);
    }

    predict(e) {
        if (!this.isRunning) return;

        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000;
        this.lastTimestamp = now;
        if (dt <= 0 || dt > 0.2) return;

        const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
        const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};

        if (this.isCalibrating) {
            this.bias.ax = acc.x; this.bias.ay = acc.y; 
            this.bias.az = acc.z - this.G_EARTH;
            this.bias.gz = gyro.gamma || 0;
            this.isCalibrating = false;
            return;
        }

        let ax_net = acc.x - this.bias.ax; 
        let ay_net = acc.y - this.bias.ay; 
        let gz_net = (gyro.gamma || 0) - this.bias.gz; 

        // 1. AUTO-APPRENTISSAGE DU RAYON 3D/4D
        let vx = this.x.get([3, 0]);
        let omega = Math.abs(gz_net) * (Math.PI / 180); 

        if (omega > 0.001 && Math.abs(vx) > 0.5) {
            const currentR = Math.abs(vx) / omega;
            this.estimatedRadius = (this.estimatedRadius === Infinity) ? currentR : (this.estimatedRadius * 0.98) + (currentR * 0.02);
        } else if (omega < 0.0001) {
            this.estimatedRadius = Infinity; 
        }

        // 2. LOGIQUE NEWTONIENNE & DISTANCE
        if (Math.abs(ax_net) < 0.1 && Math.abs(ay_net) > 0.2 && this.estimatedRadius !== Infinity) {
            const vCentrifuge = Math.sqrt(Math.abs(ay_net) * this.estimatedRadius);
            vx = (vx * 0.98) + (vCentrifuge * 0.02); 
        } else {
            vx += ax_net * dt; 
        }

        this.x.set([3, 0], vx);
        
        // Calcul de distance filtrée (Seuil 0.01 m/s pour le bruit)
        const speedMs = Math.abs(vx);
        if (speedMs > 0.01) {
            this.totalDistance += speedMs * dt;
        }
        
        this.lastAccMag = Math.sqrt(ax_net**2 + ay_net**2 + (acc.z-this.bias.az)**2);
    }

    fuseGPS(p) {
        if (this.refMode === 'relative') return;
        const gpsSpeed = p.coords.speed || 0;
        const accuracy = p.coords.accuracy;

        if (this.firstRun && accuracy < 20) {
            this.x.set([3, 0], gpsSpeed);
            this.firstRun = false;
            this.updateStatus("⚓ ANCRAGE RÉUSSI");
            return;
        }

        if (accuracy < 15) {
            const vx = this.x.get([3, 0]);
            this.x.set([3, 0], vx + (gpsSpeed - vx) * 0.05);
        }
    }

    render() {
        if (!this.isRunning) return;

        const vx = this.x.get([3, 0]);
        const speedMs = Math.abs(vx);
        const speedKmh = speedMs * 3.6;
        if (speedKmh > this.vMax) this.vMax = speedKmh;

        // --- CALCULS RELATIVISTES & DIMENSIONNELS ---
        let gamma = (speedMs >= this.C) ? Infinity : 1 / Math.sqrt(1 - Math.pow(speedMs / this.C, 2));
        const radius4D = (this.estimatedRadius === Infinity) ? Infinity : this.estimatedRadius * Math.pow(gamma, 2);
        const radius5D = (radius4D === Infinity) ? Infinity : radius4D / Math.sin(1.618 / gamma);
        const dTotal = 1 + (this.lastAccMag / (this.lastAccMag + 10)) + (gamma - 1);

        // --- AFFICHAGE DES DISTANCES ---
        this.safeUpdate('speed-main-display', speedKmh.toFixed(1));
        this.safeUpdate('speed-stable-kmh', speedKmh.toFixed(2) + " km/h");
        this.safeUpdate('lorentz-factor', (gamma === Infinity) ? "∞" : gamma.toFixed(12));
        
        // Distance 3D / 4D
        this.safeUpdate('total-distance-3d', (this.totalDistance / 1000).toFixed(4) + " km");
        this.safeUpdate('dist-light-sec', (this.totalDistance / this.C).toExponential(6) + " s-l");
        
        // Géométrie
        this.safeUpdate('radius-rotation', (this.estimatedRadius === Infinity) ? "∞ (LINÉAIRE)" : this.estimatedRadius.toFixed(1) + " m");
        this.safeUpdate('radius-4d', (radius4D === Infinity) ? "∞" : radius4D.toExponential(3));
        this.safeUpdate('radius-5d', (radius5D === Infinity) ? "∞" : radius5D.toExponential(3));
        this.safeUpdate('total-d-index', dTotal.toFixed(6));

        requestAnimationFrame(() => this.render());
    }

    safeUpdate(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    updateStatus(msg) {
        const el = document.getElementById('status-ekf');
        if (el) el.textContent = msg;
    }

    createRefButton() {
        const container = document.querySelector('.controls-section') || document.body;
        const btn = document.createElement('button');
        btn.id = 'toggle-ref-mode';
        btn.innerHTML = "🛰️ MODE: GLOBAL";
        btn.style.padding = "10px";
        btn.style.backgroundColor = "#007bff";
        btn.style.color = "white";
        btn.style.border = "none";
        btn.style.borderRadius = "5px";
        btn.style.marginTop = "10px";
        container.appendChild(btn);
        return btn;
    }
}

window.onload = () => { window.App = new UniversalUKF(); };
