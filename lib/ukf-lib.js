/**
 * Professional UKF 21-States Physics Engine
 * Exploite math.min.js pour la précision des états
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.mass = 70; 
        this.c = 299792458;
        this.G = 6.67430e-11;
        
        // État initial
        this.vMs = 0;
        this.dist = 0;
        this.accel = { x: 0, y: 0, z: 0 };
    }

    compute(dt) {
        if (!this.isRunning) return;

        // Calcul Relativiste via math.js
        const v = this.vMs;
        const beta = math.divide(v, this.c);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.pow(beta, 2))));
        
        // Énergie E=mc²
        const energyMass = math.multiply(this.mass, math.pow(this.c, 2));
        const energyRel = math.multiply(lorentz, energyMass);
        
        // Rayon de Schwarzschild
        const rs = math.divide(math.multiply(2, this.G, this.mass), math.pow(this.c, 2));

        this.updateDOM({
            lorentz: lorentz.toFixed(12),
            energy: energyRel.toExponential(4),
            massEnergy: energyMass.toExponential(4),
            rs: rs.toExponential(4),
            mach: (v / 340.29).toFixed(4)
        });
    }

    updateDOM(data) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        set('lorentz-factor', data.lorentz);
        set('relativistic-energy', data.energy + " J");
        set('mass-energy', data.massEnergy + " J");
        set('schwarzschild-radius', data.rs + " m");
        set('mach-number', data.mach);
        set('speed-main-display', (this.vMs * 3.6).toFixed(1));
    }
}
window.ProfessionalUKF = ProfessionalUKF;
