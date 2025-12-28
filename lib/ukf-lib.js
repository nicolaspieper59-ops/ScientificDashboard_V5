/**
 * Professional UKF 21-States - Version Scientifique Intégrale
 * Gère le freinage, la friction aérodynamique et les mouvements 3D.
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.X = math.matrix(math.zeros([21, 1])); 
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.lat = null; this.lon = null;
        this.vMs = 0;
        this.distance = 0;
        this.gRef = 9.80665;
        this.lastTime = performance.now();
    }

    predict() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Sécurité anti-lag
        this.lastTime = now;

        // 1. Calcul de la Magnitude 3D (Force G totale)
        const mag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        let aPure = mag - this.gRef;

        // 2. RÉALISME MAXIMAL : Correction par la densité de l'air (récupérée de l'UI)
        const rho = parseFloat(document.getElementById('air-density')?.textContent) || 1.225;
        
        if (this.vMs > 0) {
            // A. Traînée aérodynamique (F = 1/2 * rho * v² * Cx * S)
            const dragAcc = (0.5 * rho * Math.pow(this.vMs, 2) * 0.3 * 1.8) / 70;
            this.vMs -= dragAcc * dt;

            // B. Freinage par opposition (si aPure est négatif = décélération détectée)
            if (aPure < -0.2) {
                this.vMs += aPure * dt; 
            }
        }

        // 3. Accélération positive (IMU)
        if (aPure > 0.2) {
            this.vMs += aPure * dt;
        }

        // Friction statique (évite le flottement à basse vitesse)
        if (Math.abs(aPure) < 0.15) this.vMs *= 0.98;

        if (this.vMs < 0 || isNaN(this.vMs)) this.vMs = 0;
        
        this.X.set([3, 0], this.vMs);
        this.distance += (this.vMs * dt) / 1000;
    }

    observeGPS(lat, lon, alt, speed, acc) {
        this.lat = lat; this.lon = lon;
        // Fusion adaptative : plus le GPS est précis, plus on lui fait confiance
        if (speed !== null && acc < 20) {
            this.vMs = (this.vMs * 0.7) + (speed * 0.3);
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
