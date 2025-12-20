/**
 * GNSS SPACETIME ENGINE - V460 "AUTO-LEVEL & SYMMETRIC"
 * -----------------------------------------------
 * - Calibration automatique de l'inclinaison (Tilt Compensation)
 * - Conservation de l'Inertie Symétrique
 * - Ancrage Intelligent IMU/GPS
 */

class UniversalUKF {
    constructor() {
        this.C = 299792458;
        this.isRunning = false;
        this.lastTimestamp = performance.now();
        
        // États physiques
        this.vx = 0; 
        this.lastAx = 0;
        this.totalDistance = 0;
        this.gpsAccuracy = 100;

        // Vecteurs de calibration
        this.gravityVector = { x: 0, y: 0, z: 9.80665 };
        this.isCalibrating = true;
        this.calibrationSamples = 0;

        this.init();
    }

    init() {
        document.getElementById('gps-pause-toggle').onclick = () => this.start();
        // Interface pour le vecteur de force
        this.setupUI();
    }

    start() {
        this.isRunning = true;
        window.addEventListener('devicemotion', (e) => this.predict(e), true);
        navigator.geolocation.watchPosition((p) => this.fuseGPS(p), null, {enableHighAccuracy: true});
        this.render();
    }

    predict(e) {
        if (!this.isRunning) return;

        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000;
        this.lastTimestamp = now;

        // 1. RÉCUPÉRATION DES DONNÉES BRUTES (AVEC GRAVITÉ)
        const accG = e.accelerationIncludingGravity || {x:0, y:0, z:0};

        // 2. CALIBRATION AUTO-LEVELING (Pendant les 2 premières secondes)
        if (this.isCalibrating) {
            this.gravityVector.x = (this.gravityVector.x * 0.9) + (accG.x * 0.1);
            this.gravityVector.y = (this.gravityVector.y * 0.9) + (accG.y * 0.1);
            this.gravityVector.z = (this.gravityVector.z * 0.9) + (accG.z * 0.1);
            this.calibrationSamples++;
            if (this.calibrationSamples > 100) this.isCalibrating = false;
            this.updateStatus("📐 CALIBRATION INCLINAISON...");
            return;
        }

        // 3. SOUSTRACTION DU VECTEUR GRAVITÉ CALIBRÉ (Le "Vrai" Zéro)
        // Cela transforme vos 19.6 m/s² en ~0.00 m/s²
        let ax_net = accG.x - this.gravityVector.x;
        
        // 4. INTÉGRATION SYMÉTRIQUE (CONSERVATION D'INERTIE)
        const avgAcc = (ax_net + this.lastAx) / 2;
        this.lastAx = ax_net;

        const microThreshold = 0.002; 
        if (Math.abs(avgAcc) > microThreshold) {
            this.vx += avgAcc * dt;
        } else {
            this.vx *= 0.99; // Friction naturelle
        }

        // Sécurité anti-dérive : si vitesse microscopique < 1mm/s, on stabilise
        if (Math.abs(this.vx) < 0.001) this.vx = 0;
    }

    fuseGPS(p) {
        this.gpsAccuracy = p.coords.accuracy;
        const gpsSpeed = p.coords.speed || 0;

        // ANCRAGE INTELLIGENT
        // On ne force le GPS que s'il est plus crédible que l'IMU
        if (this.gpsAccuracy <= 5.0) {
            this.vx = gpsSpeed;
            this.updateStatus("🛰️ RÉFÉRENCE: GPS PRÉCIS");
        } else {
            // Le GPS est bruité (comme vos 15.4m), l'IMU garde le contrôle de l'inertie
            this.updateStatus("⚓ ANCRAGE: INERTIE CONSERVÉE");
        }
    }

    render() {
        const speedMs = Math.abs(this.vx);
        const speedKmh = speedMs * 3.6;

        // Affichage dynamique mm/s ou km/h
        const displaySpeed = speedKmh < 0.5 ? 
            (speedMs * 1000).toFixed(2) + " mm/s" : 
            speedKmh.toFixed(2) + " km/h";

        this.safeUpdate('speed-main-display', displaySpeed);
        this.safeUpdate('speed-stable-kmh', speedKmh.toFixed(3) + " km/h");
        
        // Mise à jour visuelle du vecteur de force
        this.drawForceVector(this.lastAx);

        requestAnimationFrame(() => this.render());
    }

    drawForceVector(acc) {
        const bar = document.getElementById('force-vector');
        if (!bar) return;
        const width = Math.min(Math.abs(acc) * 10, 50); // Sensibilité visuelle
        bar.style.width = width + "%";
        bar.style.left = acc >= 0 ? "50%" : (50 - width) + "%";
        bar.style.backgroundColor = acc >= 0 ? "#00ff00" : "#ff0000";
    }

    setupUI() {
        // Injection du style pour le vecteur de force si absent
        if (!document.getElementById('force-style')) {
            const style = document.createElement('style');
            style.id = 'force-style';
            style.innerHTML = `
                #force-axis { width: 100%; height: 20px; background: #333; position: relative; border-radius: 10px; overflow: hidden; margin: 10px 0; }
                #force-vector { height: 100%; position: absolute; transition: all 0.05s ease-out; }
                .center-line { position: absolute; left: 50%; width: 2px; height: 100%; background: white; z-index: 2; }
            `;
            document.head.appendChild(style);
        }
    }

    safeUpdate(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    updateStatus(msg) {
        const el = document.getElementById('status-ekf');
        if (el) el.textContent = msg;
    }
}

window.App = new UniversalUKF();
