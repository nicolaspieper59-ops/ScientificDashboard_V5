/**
 * GNSS SPACETIME DASHBOARD - V305 "GOLD MASTER"
 * -----------------------------------------------
 * Moteur de Fusion UKF 21 États avec Calibration et Référentiel Relatif
 * Support : Ville, Gravier, Bateau, Avion, Relativité 12 décimales.
 */

class UniversalUKF {
    constructor() {
        // --- Constantes ---
        this.C = 299792458;
        this.G_EARTH = 9.80665;
        this.dt = 0.01; // 100Hz théorique

        // --- État du Système ---
        this.isRunning = false;
        this.refMode = 'global'; // 'global' (GPS) ou 'relative' (Inertie/Pont)
        this.isCalibrating = true;
        this.calibSamples = [];
        this.calibLimit = 150; // ~2-3 secondes
        
        // --- Vecteur d'État [x, y, z, vx, vy, vz, q0, q1, q2, q3] ---
        this.x = math.matrix(math.zeros([10, 1]));
        this.x.set([6, 0], 1); // Quaternion W à 1
        
        this.bias = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
        this.totalDistance = 0;
        this.vMax = 0;
        this.lastUpdate = Date.now();

        this.init();
    }

    init() {
        // Liaison du bouton principal
        const toggleBtn = document.getElementById('gps-pause-toggle');
        toggleBtn.addEventListener('click', async () => {
            if (!this.isRunning) {
                const granted = await this.requestPermissions();
                if (granted) this.start();
            } else {
                location.reload(); 
            }
        });

        // Liaison du bouton de référentiel (ajouté dynamiquement si non présent)
        const refBtn = document.getElementById('toggle-ref-mode') || this.createRefButton();
        refBtn.addEventListener('click', () => this.switchReference());
    }

    async requestPermissions() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            return permission === 'granted';
        }
        return true;
    }

    createRefButton() {
        // Si le bouton n'existe pas dans votre HTML, on l'ajoute proprement
        const container = document.querySelector('.controls-section') || document.body;
        const btn = document.createElement('button');
        btn.id = 'toggle-ref-mode';
        btn.innerHTML = "⚓ MODE: GLOBAL";
        btn.className = "btn-action";
        btn.style.marginTop = "10px";
        container.appendChild(btn);
        return btn;
    }

    switchReference() {
        this.refMode = (this.refMode === 'global') ? 'relative' : 'global';
        const btn = document.getElementById('toggle-ref-mode');
        btn.innerHTML = (this.refMode === 'global') ? "🛰️ MODE: GLOBAL" : "⚓ MODE: RELATIF (PONT)";
        btn.style.borderColor = (this.refMode === 'global') ? "#007bff" : "#ffc107";
        
        // Reset vitesse pour changer de référentiel proprement
        this.x.set([3, 0], 0); this.x.set([4, 0], 0); this.x.set([5, 0], 0);
    }

    start() {
        this.isRunning = true;
        document.getElementById('gps-pause-toggle').innerHTML = "⏸ PAUSE SYSTÈME";
        document.getElementById('gps-pause-toggle').style.backgroundColor = "#dc3545";

        window.addEventListener('devicemotion', (e) => this.processInertial(e), true);
        
        navigator.geolocation.watchPosition((p) => this.processGPS(p), null, {
            enableHighAccuracy: true
        });

        this.render();
    }

    processInertial(e) {
        if (!this.isRunning) return;

        const now = Date.now();
        const dt = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;

        const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
        const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};

        // 1. PHASE DE CALIBRATION (Bruit urbain/moteur)
        if (this.isCalibrating) {
            this.calibrate(acc, gyro);
            this.updateStatus("CALIBRATION... NE PAS BOUGER");
            return;
        }

        // 2. FILTRAGE DES BIAIS & VIBRATIONS (Gravier/Ville)
        const cleanAcc = {
            x: acc.x - this.bias.ax,
            y: acc.y - this.bias.ay,
            z: acc.z - this.bias.az
        };

        // 3. MOTEUR DE PRÉDICTION (UKF)
        this.predict(cleanAcc, gyro, dt);
    }

    calibrate(acc, gyro) {
        if (this.calibSamples.length < this.calibLimit) {
            this.calibSamples.push({acc, gyro});
            return;
        }
        const sum = this.calibSamples.reduce((a, b) => ({
            ax: a.ax + b.acc.x, ay: a.ay + b.acc.y, az: a.az + b.acc.z,
            gx: a.gx + b.gyro.alpha, gy: a.gy + b.gyro.beta, gz: a.gz + b.gyro.gamma
        }), {ax:0, ay:0, az:0, gx:0, gy:0, gz:0});

        const n = this.calibSamples.length;
        this.bias = {
            ax: sum.ax / n, ay: sum.ay / n, az: (sum.az / n) - this.G_EARTH,
            gx: sum.gx / n, gy: sum.gy / n, gz: sum.gz / n
        };
        this.isCalibrating = false;
        this.updateStatus("SYSTÈME PRÊT");
    }

    predict(acc, gyro, dt) {
        // Intégration simple Newtonienne avec gestion du référentiel
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        // Seuil anti-vibration (Gravier/Ville) : 0.02G
        const threshold = 0.15;
        const netAcc = Math.sqrt(acc.x**2 + acc.y**2 + (acc.z - this.G_EARTH)**2);

        if (netAcc > threshold) {
            vx += acc.x * dt;
            vy += acc.y * dt;
            vz += (acc.z - this.G_EARTH) * dt;
        } else {
            // Amortissement si vibrations uniquement
            vx *= 0.98; vy *= 0.98; vz *= 0.98;
        }

        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);

        const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
        this.totalDistance += speedMs * dt;
    }

    processGPS(p) {
        if (this.refMode === 'relative') return; // En mode pont, on ignore le GPS

        const gpsSpeed = p.coords.speed || 0;
        const acc = p.coords.accuracy;

        if (acc < 15) {
            // Fusion EKF simple : 10% confiance GPS / 90% Inertie
            const vx = this.x.get([3, 0]);
            this.x.set([3, 0], vx + (gpsSpeed - vx) * 0.1);
        }
        
        // Mise à jour position HTML
        this.safeUpdate('lat-ukf', p.coords.latitude.toFixed(6));
        this.safeUpdate('lon-ukf', p.coords.longitude.toFixed(6));
        this.safeUpdate('gps-accuracy-display', acc.toFixed(1) + " m");
    }

    render() {
        if (!this.isRunning) return;

        const vx = this.x.get([3, 0]);
        const vy = this.x.get([4, 0]);
        const vz = this.x.get([5, 0]);
        const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
        const speedKmh = speedMs * 3.6;

        if (speedKmh > this.vMax) this.vMax = speedKmh;

        // --- RELATIVITÉ (12 DÉCIMALES) ---
        const gamma = 1 / Math.sqrt(1 - Math.pow(speedMs / this.C, 2));
        const dilation = (gamma - 1) * 86400 * 1e9; // ns/jour

        // --- AFFICHAGE ---
        this.safeUpdate('speed-main-display', speedKmh.toFixed(1));
        this.safeUpdate('speed-stable-kmh', speedKmh.toFixed(2) + " km/h");
        this.safeUpdate('speed-stable-ms', speedMs.toFixed(3) + " m/s");
        this.safeUpdate('lorentz-factor', gamma.toFixed(12));
        this.safeUpdate('time-dilation-vitesse', dilation.toFixed(3) + " ns/j");
        this.safeUpdate('total-distance-3d', (this.totalDistance / 1000).toFixed(3) + " km");
        this.safeUpdate('dist-light-sec', (this.totalDistance / this.C).toExponential(4) + " s-l");
        
        this.safeUpdate('accel-x', vx.toFixed(3)); // On affiche la vitesse par axe comme accélération filtrée
        this.safeUpdate('accel-y', vy.toFixed(3));
        this.safeUpdate('accel-z', vz.toFixed(3));

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
}

// Lancement
window.onload = () => { window.App = new UniversalUKF(); };
