/** * PROFESSIONAL UKF ENGINE - Multi-Mobile & Relativité Micro
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.mass = 70;
        this.c = 299792458;
        this.gBase = 9.80665;
    }

    // Gestion automatique Newtonienne pour Avion, Train, Gastéropode...
    processMotion(event) {
        if (!this.isRunning) return;

        const acc = event.accelerationIncludingGravity;
        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;

        // 1. Accélération Efficace (Net de gravité)
        const totalRaw = Math.sqrt(x*x + y*y + z*z);
        const effectiveA = totalRaw - this.gBase;

        // 2. Détection Automatique du sens (Accélération vs Décélération Inversée)
        const status = effectiveA > 0.1 ? "ACCÉLÉRATION" : (effectiveA < -0.1 ? "DÉCÉLÉRATION" : "STABLE");
        
        // 3. Calcul Relativiste Micro avec math.js
        this.computeRelativity();

        // 4. Mise à jour Interface
        this.updateUI(x, y, z, effectiveA, status);
    }

    computeRelativity() {
        const v = math.bignumber(this.vMs);
        const c = math.bignumber(this.c);
        const betaSq = math.divide(math.multiply(v, v), math.multiply(c, c));
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, betaSq)));

        const el = document.getElementById('lorentz-factor');
        // Bascule automatique en notation scientifique pour les vitesses micro
        if (this.vMs > 0.001 && this.vMs < 1000) {
            const diff = math.subtract(lorentz, 1);
            el.innerHTML = `1 + ${math.format(diff, {notation: 'exponential', precision: 4})}`;
        } else {
            el.textContent = math.format(lorentz, {precision: 15});
        }

        const energy = math.multiply(lorentz, math.bignumber(this.mass), math.pow(c, 2));
        document.getElementById('relativistic-energy').textContent = math.format(energy, {notation: 'exponential', precision: 3}) + " J";
    }

    updateUI(x, y, z, eff, status) {
        document.getElementById('acc-x').textContent = x.toFixed(2);
        document.getElementById('acc-y').textContent = y.toFixed(2);
        document.getElementById('acc-z').textContent = z.toFixed(2);
        document.getElementById('accel-long-filtered').textContent = eff.toFixed(4);
        document.getElementById('dynamic-master-mode').textContent = status;
        document.getElementById('force-g-vertical').textContent = (Math.abs(z)/9.806).toFixed(3);
    }
}
window.ProfessionalUKF = ProfessionalUKF;
