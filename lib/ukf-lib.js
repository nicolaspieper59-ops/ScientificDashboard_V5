/** * PROFESSIONAL UKF - Newton & Einstein (CODATA 2024) */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.mass = 70; 
        this.c = 299792458; 
        this.gRef = 9.80665; 
    }

    processMotion(event) {
        if (!this.isRunning) return;
        const acc = event.accelerationIncludingGravity;
        const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;

        // 1. Newton : Accélération Efficace (Nettoyée de la pesanteur)
        const totalRaw = Math.sqrt(x**2 + y**2 + z**2);
        const effectiveA = totalRaw - this.gRef;
        const status = Math.abs(effectiveA) < 0.15 ? "STABLE" : (effectiveA > 0 ? "ACCÉLÉRATION" : "DÉCÉLÉRATION");

        // 2. Relativité Micro (Précision Math.js)
        const v = math.bignumber(this.vMs);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.pow(math.divide(v, this.c), 2))));

        this.updateUI(x, y, z, effectiveA, status, lorentz);
    }

    updateUI(x, y, z, effA, status, lorentz) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        set('acc-z', z.toFixed(2));
        set('accel-long-filtered', effA.toFixed(4) + " m/s²");
        set('dynamic-master-mode', status);
        set('force-g-vertical', (Math.abs(z)/9.806).toFixed(3) + " G");

        // Bascule Affichage Scientifique (Vitesse Micro)
        const elL = document.getElementById('lorentz-factor');
        if (this.vMs > 0.001 && this.vMs < 1000) {
            const diff = math.subtract(lorentz, 1);
            elL.innerHTML = `1 + ${math.format(diff, {notation: 'exponential', precision: 3})}`;
        } else {
            elL.textContent = math.format(lorentz, {precision: 15});
        }

        const energy = math.multiply(lorentz, this.mass, math.pow(this.c, 2));
        set('relativistic-energy', math.format(energy, {notation: 'exponential', precision: 2}) + " J");
    }
}
window.ProfessionalUKF = ProfessionalUKF;
