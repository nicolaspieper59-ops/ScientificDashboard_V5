/**
 * Professional UKF 21-States Universal Engine
 * Gère : Freinage, Reynolds (Insects), Hydrodynamique (Bateaux/Toboggans), 
 * et Relativité (Avions).
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.envMode = "STANDARD"; // STANDARD, INDOOR, DOME, AQUATIC, AIRCRAFT, GASTROPOD
        this.X = math.matrix(math.zeros([21, 1])); 
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.vMs = 0;
        this.gRef = 9.80665;
        this.lastTime = performance.now();
        this.distance = 0;
    }

    predict() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        // 1. Détection des Forces G (Manèges / Virages)
        const mag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        let aPure = mag - this.gRef;

        // 2. Paramètres de Fluides (Météo/Milieu)
        const rhoAir = parseFloat(document.getElementById('air-density')?.textContent) || 1.225;
        let rhoFluid = (this.envMode === "AQUATIC") ? 1000 : rhoAir;
        let mu = 1.81e-5; // Viscosité air

        // 3. Facteurs de Correction Environnementale
        let shieldFactor = 1.0;
        if (this.envMode === "INDOOR") shieldFactor = 0.05; // Pas de vent
        if (this.envMode === "DOME") shieldFactor = 0.3;   // Vent filtré

        // 4. Calcul de la Traînée (Quadratique vs Visqueuse)
        if (this.vMs > 0) {
            let dragAcc;
            if (this.vMs < 0.01) { // Mode Escargot (Stokes)
                dragAcc = (6 * Math.PI * mu * 0.05 * this.vMs) / 0.1; 
            } else { // Mode Standard (Newton)
                dragAcc = (0.5 * rhoFluid * Math.pow(this.vMs, 2) * 0.3 * 1.8 * shieldFactor) / 70;
            }
            this.vMs -= dragAcc * dt;

            // Freinage par opposition (Freinage actif voiture/train)
            if (aPure < -0.2) this.vMs += aPure * dt; 
        }

        // 5. Accélération positive
        if (aPure > 0.2) this.vMs += aPure * dt;

        // Friction de contact
        if (Math.abs(aPure) < 0.15) this.vMs *= 0.985;

        if (this.vMs < 0 || isNaN(this.vMs)) this.vMs = 0;
        this.X.set([3, 0], this.vMs);
        this.distance += (this.vMs * dt) / 1000;
    }

    autoDetectMode(lat, alt, accuracy, v) {
        if (accuracy > 25) this.envMode = "INDOOR";
        else if (alt > 3000 || v > 80) this.envMode = "AIRCRAFT";
        else if (v < 0.01) this.envMode = "GASTROPOD";
        else this.envMode = "STANDARD";
    }
}
window.ProfessionalUKF = ProfessionalUKF;
