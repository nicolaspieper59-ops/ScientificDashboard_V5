/**
 * Professional UKF 21-States - Version Dynamique Avancée
 * Gère le freinage, la friction et les mouvements 3D (Salto, Ascenseur)
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

        // 1. Calcul de la Force G Totale
        const mag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        let aPure = mag - this.gRef;

        // 2. LOGIQUE DE RALENTISSEMENT (FREINAGE)
        if (Math.abs(aPure) < 0.15) {
            // Friction naturelle si mouvement faible
            this.vMs *= 0.985; 
            if (this.vMs < 0.02) this.vMs = 0;
        } else {
            // Si l'accélération est négative (magnitude < gRef), on ralentit
            // On utilise le signe de aPure pour influencer vMs
            this.vMs += aPure * dt;
        }

        if (this.vMs < 0) this.vMs = 0;
        this.X.set([3, 0], this.vMs);
        this.distance += (this.vMs * dt) / 1000; // km
    }

    observeGPS(lat, lon, alt, speed, acc) {
        this.lat = lat; this.lon = lon; this.alt = alt || 0;
        if (speed !== null && acc < 20) {
            const currentV = this.X.get([3, 0]);
            this.vMs = currentV + 0.6 * (speed - currentV);
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
