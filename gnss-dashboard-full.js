/**
 * GNSS SPACETIME ENGINE - V450 "SYMMETRIC-OMEGA"
 * -----------------------------------------------
 * - Conservation de l'Inertie Symétrique (Trapézoïdale)
 * - Ancrage Intelligent : IMU Maître si GPS Acc > 5m
 * - Détection Micro-Vitesse (> 0.002 m/s)
 * - Physique 4D/5D & Dimension Fractale
 */

class UniversalUKF {
    constructor() {
        this.C = 299792458;
        this.G_EARTH = 9.80665;
        
        this.isRunning = false;
        this.refMode = 'global'; 
        this.isCalibrating = true;
        this.lastTimestamp = performance.now();
        
        // États du mouvement
        this.vx = 0; // Vitesse linéaire interne
        this.lastAx = 0; // Mémoire pour intégration trapézoïdale
        this.estimatedRadius = Infinity; 
        this.totalDistance = 0;
        this.gpsAccuracy = 100;

        // État UKF [pos, vel, orientation]
        this.x = math.matrix(math.zeros([10, 1]));
        this.x.set([6, 0], 1); 
        this.bias = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };

        this.init();
    }

    init() {
        const btn = document.getElementById('gps-pause-toggle');
        if (btn) btn.onclick = () => this.toggleSystem();
        
        const refBtn = document.getElementById('toggle-ref-mode') || this.createRefButton();
        refBtn.onclick = () => this.switchReference();
    }

    async toggleSystem() {
        if (!this.isRunning) {
            const granted = await this.requestPermissions();
            if (granted) this.start();
        } else {
            location.reload();
        }
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
        document.getElementById('gps-pause-toggle').innerHTML = "⏸ SYSTÈME ACTIF";

        // Capteurs haute fréquence
        window.addEventListener('devicemotion', (e) => this.predict(e), true);
        navigator.geolocation.watchPosition((p) => this.fuseGPS(p), null, {enableHighAccuracy: true});

        this.render();
    }

    predict(e) {
        if (!this.isRunning) return;

        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000;
        this.lastTimestamp = now;
        if (dt <= 0 || dt > 0.2) return;

        // Accélération pure (sans gravité si disponible)
        const acc = e.acceleration || {x:0, y:0, z:0};
        const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};

        if (this.isCalibrating && Math.abs(acc.x) > 0) {
            this.bias.ax = acc.x; 
            this.isCalibrating = false;
        }

        let ax_raw = acc.x - this.bias.ax;
        let ay_raw = acc.y;
        let gz_rad = (gyro.gamma || 0) * (Math.PI / 180);

        // --- 1. CONSERVATION DE L'INERTIE SYMÉTRIQUE ---
        // Intégration trapézoïdale pour que l'accélération = -décélération
        const avgAcc = (ax_raw + this.lastAx) / 2;
        this.lastAx = ax_raw;

        const microThreshold = 0.002; // Sensibilité microscopique
        if (Math.abs(avgAcc) > microThreshold) {
            this.vx += avgAcc * dt;
        } else {
            this.vx *= 0.99; // Stabilisation naturelle à l'arrêt
        }

        // --- 2. GESTION DU RAYON & FORCE CENTRIFUGE ---
        if (Math.abs(gz_rad) > 0.001 && Math.abs(this.vx) > 0.5) {
            const r = Math.abs(this.vx) / Math.abs(gz_rad);
            this.estimatedRadius = (this.estimatedRadius === Infinity) ? r : (this.estimatedRadius * 0.95) + (r * 0.05);
        }

        // Correction centrifuge (Métro/Attractions)
        if (Math.abs(ax_raw) < 0.05 && Math.abs(ay_raw) > 0.1 && this.estimatedRadius !== Infinity) {
            const vC = Math.sqrt(Math.abs(ay_raw) * this.estimatedRadius);
            this.vx = (this.vx * 0.9) + (vC * 0.1);
        }

        this.x.set([3, 0], this.vx);
        if (Math.abs(this.vx) > 0.001) this.totalDistance += Math.abs(this.vx) * dt;
    }

    fuseGPS(p) {
        this.gpsAccuracy = p.coords.accuracy;
        const gpsSpeed = p.coords.speed || 0;

        // --- 3. ANCRAGE INTELLIGENT ---
        // Si GPS précis (<5m), il corrige l'IMU. Sinon, l'IMU conserve l'inertie.
        if (this.gpsAccuracy <= 5.0) {
            this.vx = gpsSpeed; 
            this.updateStatus("🛰️ ANCRAGE : GPS (MAÎTRE)");
        } else {
            // Le GPS est flou, on l'utilise seulement pour limiter la dérive de l'IMU
            const driftWeight = 0.01; 
            this.vx = this.vx + (gpsSpeed - this.vx) * driftWeight;
            this.updateStatus("⚓ ANCRAGE : IMU (INERTIE)");
        }
    }

    render() {
        if (!this.isRunning) return;

        const speedMs = Math.abs(this.vx);
        const speedKmh = speedMs * 3.6;

        // Calculs Relativistes 4D/5D
        const gamma = (speedMs >= this.C) ? Infinity : 1 / Math.sqrt(1 - Math.pow(speedMs / this.C, 2));
        const dFractale = 1 + (Math.abs(this.lastAx) / (Math.abs(this.lastAx) + 10));

        // Affichage Haute Précision
        this.safeUpdate('speed-main-display', speedKmh < 1 ? (speedMs * 1000).toFixed(2) + " mm/s" : speedKmh.toFixed(1));
        this.safeUpdate('speed-stable-kmh', speedKmh.toFixed(3) + " km/h");
        this.safeUpdate('total-distance-3d', (this.totalDistance / 1000).toFixed(4) + " km");
        this.safeUpdate('radius-rotation', (this.estimatedRadius === Infinity) ? "∞" : this.estimatedRadius.toFixed(1) + " m");
        this.safeUpdate('lorentz-factor', (gamma === Infinity) ? "∞" : gamma.toFixed(12));
        this.safeUpdate('total-d-index', dFractale.toFixed(6));
        
        // Vecteur Force (Visuel)
        this.drawForceVector(this.lastAx);

        requestAnimationFrame(() => this.render());
    }

    drawForceVector(acc) {
        const el = document.getElementById('force-vector');
        if (!el) return;
        const width = Math.min(Math.abs(acc) * 50, 100);
        el.style.width = width + "%";
        el.style.backgroundColor = acc > 0 ? "#00ff00" : "#ff0000";
        el.style.marginLeft = acc > 0 ? "50%" : (50 - width) + "%";
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
        const btn = document.createElement('button');
        btn.id = 'toggle-ref-mode';
        btn.innerHTML = "🛰️ MODE: GLOBAL";
        btn.className = "btn-action";
        document.body.appendChild(btn);
        return btn;
    }
}

window.onload = () => { window.App = new UniversalUKF(); };
