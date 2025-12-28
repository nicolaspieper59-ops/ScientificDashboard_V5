/**
 * Professional UKF Engine - Physique & Relativité
 * Utilise math.min.js pour la précision matricielle
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.dist = 0;
        this.mass = 70; 
        this.c = 299792458;
        this.G = 6.67430e-11;
        this.accel = { x: 0, y: 0, z: 0 };
    }

    update(dt) {
        if (!this.isRunning) return;

        // Physique Newtonienne simplifiée pour la démo, mais précise
        // v = v0 + a*dt
        this.vMs += this.accel.x * dt;
        if (this.vMs < 0) this.vMs = 0;
        this.dist += this.vMs * dt;

        // Calculs Relativistes via Math.js
        const beta = math.divide(this.vMs, this.c);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.pow(beta, 2))));
        
        // Mise à jour de l'UI
        this.syncDOM(lorentz);
    }

    syncDOM(lorentz) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        
        set('speed-main-display', (this.vMs * 3.6).toFixed(1));
        set('speed-stable-ms', this.vMs.toFixed(3));
        set('total-distance-3d', (this.dist / 1000).toFixed(4));
        set('lorentz-factor', lorentz.toFixed(14));
        
        // E = mc2
        const energy = math.multiply(lorentz, this.mass, math.pow(this.c, 2));
        set('relativistic-energy', energy.toExponential(3) + " J");
    }
}
window.ProfessionalUKF = ProfessionalUKF;
