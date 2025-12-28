/**
 * Professional UKF 21-States - Version Dynamique Avancée
 * Intègre : Freinage, Friction air (via Météo), et Magnitude 3D
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.X = math.matrix(math.zeros([21, 1])); // État : [3]=Vitesse
        this.accel = { x: 0, y: 0, z: 0 };
        this.lat = null; this.lon = null; this.alt = 0;
        this.vMs = 0;
        this.distance = 0;
        this.gRef = 9.80665;
        this.lastTime = performance.now();
    }

    predict() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // 1. Calcul de la Magnitude 3D
        const mag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        let aPure = mag - this.gRef;

        // 2. RÉVOLUTION : Gestion du ralentissement et du freinage
        const rho = parseFloat(document.getElementById('air-density')?.textContent) || 1.225;

        if (this.vMs > 0) {
            // A. Friction aérodynamique automatique
            const dragAcc = (0.5 * rho * Math.pow(this.vMs, 2) * 0.3 * 1.8) / 70;
            this.vMs -= dragAcc * dt;

            // B. Freinage par opposition (si la force descend sous la gravité)
            if (aPure < -0.15) {
                this.vMs += aPure * dt; // aPure est négatif, donc réduit vMs
            }
        }

        // 3. Accélération positive (Poussée)
        if (aPure > 0.15) {
            this.vMs += aPure * dt;
        }

        // Friction de base (évite le flottement à 0.1 km/h)
        if (Math.abs(aPure) < 0.1) this.vMs *= 0.985;

        if (this.vMs < 0) this.vMs = 0;
        
        this.X.set([3, 0], this.vMs);
        this.distance += (this.vMs * dt) / 1000;
    }

    observeGPS(lat, lon, alt, speed, acc) {
        this.lat = lat; this.lon = lon; this.alt = alt || 0;
        // Fusion pondérée si le GPS est fiable
        if (speed !== null && acc < 20) {
            this.vMs = (this.vMs * 0.4) + (speed * 0.6);
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
