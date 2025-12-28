/**
 * GNSS SpaceTime - Professional UKF Engine
 * Dépendance: math.min.js
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.dist = 0;
        this.mass = 70; // kg
        this.c = 299792458;
        this.G = 6.67430e-11;
    }

    // Calcul de la physique à chaque frame
    update(dt, accelX) {
        if (!this.isRunning) return;

        // Intégration de la vitesse (v = v0 + at)
        // On simule une petite traînée pour le réalisme
        const drag = 0.5 * 1.225 * Math.pow(this.vMs, 2) * 0.3 * 1.8;
        const aNet = accelX - (drag / this.mass);
        
        this.vMs += aNet * dt;
        if (this.vMs < 0) this.vMs = 0;
        this.dist += this.vMs * dt;

        // Calculs Relativistes avec Math.js
        const beta = math.divide(this.vMs, this.c);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.pow(beta, 2))));
        const energy = math.multiply(lorentz, this.mass, math.pow(this.c, 2));

        this.refreshDOM(lorentz, energy, aNet);
    }

    refreshDOM(lorentz, energy, aNet) {
        const set = (id, val) => { 
            const el = document.getElementById(id); 
            if(el) el.textContent = val; 
        };

        set('speed-main-display', (this.vMs * 3.6).toFixed(1));
        set('speed-stable-kmh', (this.vMs * 3.6).toFixed(2));
        set('speed-stable-ms', this.vMs.toFixed(3));
        set('accel-long-filtered', aNet.toFixed(3));
        set('total-distance-3d', (this.dist / 1000).toFixed(4));
        set('lorentz-factor', lorentz.toFixed(12));
        set('relativistic-energy', energy.toExponential(4));
        
        // Rayon de Schwarzschild
        const rs = (2 * this.G * this.mass) / Math.pow(this.c, 2);
        set('schwarzschild-radius', rs.toExponential(4));
    }
}
window.ProfessionalUKF = ProfessionalUKF;
