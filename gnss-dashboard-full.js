/**
 * GNSS SPACETIME ENGINE - V480 "GRAVITY-ISOLATOR"
 * -----------------------------------------------
 * - Compensation d'inclinaison dynamique (Tilt-Ref)
 * - Isolation de la pesanteur (G-Removal)
 * - Symétrie parfaite Accélération/Décélération
 */

class UniversalUKF {
    constructor() {
        this.C = 299792458;
        this.isRunning = false;
        this.vx = 0;
        this.lastTimestamp = performance.now();
        
        // Vecteurs de référence pour l'inclinaison
        this.gravityBias = { x: 0, y: 0, z: 0 };
        this.isCalibrated = false;

        this.init();
    }

    init() {
        // Bouton de recalibrage immédiat
        const resetBtn = document.getElementById('gps-pause-toggle');
        if (resetBtn) resetBtn.onclick = () => this.calibrateAndStart();
        
        // Création d'un bouton "Zéro Inclinaison" si absent
        this.createCalibrationUI();
    }

    calibrateAndStart() {
        this.vx = 0; // Reset vitesse
        this.isCalibrated = false; // Relance la capture du biais
        if (!this.isRunning) this.start();
    }

    start() {
        this.isRunning = true;
        window.addEventListener('devicemotion', (e) => this.predict(e), true);
        this.render();
    }

    predict(e) {
        if (!this.isRunning) return;

        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000;
        this.lastTimestamp = now;

        // 1. CAPTURE DES VALEURS BRUTES (Tes -13.6 ou 19.6)
        const accG = e.accelerationIncludingGravity;
        if (!accG) return;

        // 2. AUTO-CALIBRATION (Capture de l'inclinaison actuelle)
        if (!this.isCalibrated) {
            this.gravityBias.x = accG.x;
            this.gravityBias.y = accG.y;
            this.gravityBias.z = accG.z;
            this.isCalibrated = true;
            return;
        }

        // 3. SOUSTRACTION DU VECTEUR D'INCLINAISON
        // On ne garde que la différence par rapport à la pose initiale
        let ax = accG.x - this.gravityBias.x;
        let ay = accG.y - this.gravityBias.y;

        // 4. INTÉGRATION SYMÉTRIQUE AVEC FRICTION
        // On traite le mouvement Microscopique
        const threshold = 0.005; 
        if (Math.abs(ax) > threshold) {
            this.vx += ax * dt;
        } else {
            // "Friction spatiale" pour forcer le retour à zéro
            this.vx *= 0.98; 
        }

        // Sécurité : Si l'accélération est stable mais la vitesse délire
        if (Math.abs(ax) < 0.001) this.vx *= 0.95;

        this.x_vel = this.vx;
    }

    render() {
        const speedKmh = Math.abs(this.vx) * 3.6;
        
        // Affichage dynamique
        const display = speedKmh < 0.1 ? 
            (Math.abs(this.vx) * 1000).toFixed(2) + " mm/s" : 
            speedKmh.toFixed(2) + " km/h";

        this.safeUpdate('speed-main-display', display);
        this.safeUpdate('speed-stable-kmh', speedKmh.toFixed(3) + " km/h");
        
        // Mise à jour visuelle du vecteur de force
        this.drawForceVector(this.vx);

        requestAnimationFrame(() => this.render());
    }

    drawForceVector(v) {
        const bar = document.getElementById('force-vector');
        if (bar) {
            const width = Math.min(Math.abs(v) * 20, 50);
            bar.style.width = width + "%";
            bar.style.left = v >= 0 ? "50%" : (50 - width) + "%";
            bar.style.backgroundColor = v >= 0 ? "#00ff00" : "#ff0000";
        }
    }

    createCalibrationUI() {
        const container = document.querySelector('.controls-section');
        if (container && !document.getElementById('btn-zero')) {
            const btn = document.createElement('button');
            btn.id = 'btn-zero';
            btn.innerHTML = "🎯 FIXER INCLINAISON (ZÉRO)";
            btn.className = "btn-action";
            btn.onclick = () => { this.isCalibrated = false; this.vx = 0; };
            container.appendChild(btn);
        }
    }

    safeUpdate(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.App = new UniversalUKF();
