/**
 * Professional UKF Engine - DeviceMotion Integration
 * Utilise math.min.js pour les calculs d'inclinaison et de forces
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.dist = 0;
        this.mass = 70;
        this.c = 299792458;
    }

    // Traitement des données du capteur DeviceMotion
    processMotion(event) {
        if (!this.isRunning) return;

        // Accélération avec gravité (pour l'inclinaison)
        const ag = event.accelerationIncludingGravity;
        const x = ag.x || 0;
        const y = ag.y || 0;
        const z = ag.z || 0;

        // Calcul Pitch & Roll avec Math.js (en degrés)
        const pitch = math.unit(math.atan2(-x, z), 'rad').to('deg').value;
        const roll = math.unit(math.atan2(y, z), 'rad').to('deg').value;

        // Mise à jour de la vitesse (basée sur l'accélération linéaire sans gravité)
        const al = event.acceleration;
        if (al && al.x) {
            this.vMs += (al.x * 0.016); // Estimation dt = 60Hz
            if (this.vMs < 0) this.vMs = 0;
        }

        this.updateUI(x, y, z, pitch, roll);
    }

    updateUI(x, y, z, p, r) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        set('acc-x', x.toFixed(2));
        set('acc-y', y.toFixed(2));
        set('acc-z', z.toFixed(2));
        set('pitch', p.toFixed(1) + "°");
        set('roll', r.toFixed(1) + "°");
        
        // Calcul Relativiste via Math.js
        const beta = math.divide(this.vMs, this.c);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.pow(beta, 2))));
        set('lorentz-factor', lorentz.toFixed(14));
        
        const energy = math.multiply(lorentz, this.mass, math.pow(this.c, 2));
        set('relativistic-energy', energy.toExponential(3) + " J");
    }
}
window.ProfessionalUKF = ProfessionalUKF;
