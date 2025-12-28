class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.mass = 70;
        this.c = 299792458;
    }

    // Traitement DeviceMotion
    updatePhysics(event) {
        if (!this.isRunning) return;

        const acc = event.accelerationIncludingGravity;
        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;

        // 1. Calcul de la Force G Linéaire (on retire la gravité de Z)
        const gZ = z - 9.80665;
        const totalG = Math.sqrt(x*x + y*y + gZ*gZ) / 9.80665;

        // 2. Mise à jour des IDs Scientifiques
        this.setDOM('acc-x', x.toFixed(2));
        this.setDOM('acc-z', z.toFixed(2));
        this.setDOM('force-g-vertical', totalG.toFixed(3));
        
        // 3. Relativité via math.min.js
        const beta = math.divide(this.vMs, this.c);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.pow(beta, 2))));
        this.setDOM('lorentz-factor', lorentz.toFixed(14));
        
        // E = mc² (Relativiste)
        const energy = math.multiply(lorentz, this.mass, math.pow(this.c, 2));
        this.setDOM('relativistic-energy', energy.toExponential(3) + " J");
    }

    setDOM(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
