/** * PROFESSIONAL UKF ENGINE - Physique multi-mobile & Relativité Micro
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.mass = 70;
        this.c = 299792458;
        this.gBase = 9.80665;
    }

    // Gestion automatique : Avion, Train, Voiture, Insecte, etc.
    processMotion(event) {
        if (!this.isRunning) return;

        const acc = event.accelerationIncludingGravity;
        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;

        // 1. Accélération Efficace (Soustraction vectorielle de la gravité)
        const totalRaw = Math.sqrt(x*x + y*y + z*z);
        const effectiveA = totalRaw - this.gBase;

        // 2. Principe de Newton : Détection du mode dynamique
        const status = Math.abs(effectiveA) < 0.1 ? "STABLE" : (effectiveA > 0 ? "ACCÉLÉRATION" : "DÉCÉLÉRATION INVERSÉE");
        
        // 3. Bascule Scientifique pour Lorentz (Vitesse Micro)
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
        
        // Bascule automatique en notation scientifique pour les vitesses micro (ex: 1 + 5.89e-16)
        if (this.vMs > 0 && this.vMs < 1000) {
            const diff = math.subtract(lorentz, 1);
            el.innerHTML = `1 + ${math.format(diff, {notation: 'exponential', precision: 3})}`;
        } else {
            el.textContent = math.format(lorentz, {precision: 15});
        }

        const energy = math.multiply(lorentz, math.bignumber(this.mass), math.pow(c, 2));
        document.getElementById('relativistic-energy').textContent = math.format(energy, {notation: 'exponential', precision: 2}) + " J";
    }

    updateUI(x, y, z, eff, status) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        set('acc-x', x.toFixed(2));
        set('acc-y', y.toFixed(2));
        set('acc-z', z.toFixed(2));
        set('accel-long-filtered', eff.toFixed(4) + " m/s²");
        set('dynamic-master-mode', status);
        set('force-g-vertical', (Math.abs(z)/9.806).toFixed(3) + " G");
    }
}
window.ProfessionalUKF = ProfessionalUKF;/** * PROFESSIONAL UKF ENGINE - Physique multi-mobile & Relativité Micro
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.mass = 70;
        this.c = 299792458;
        this.gBase = 9.80665;
    }

    // Gestion automatique : Avion, Train, Voiture, Insecte, etc.
    processMotion(event) {
        if (!this.isRunning) return;

        const acc = event.accelerationIncludingGravity;
        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;

        // 1. Accélération Efficace (Soustraction vectorielle de la gravité)
        const totalRaw = Math.sqrt(x*x + y*y + z*z);
        const effectiveA = totalRaw - this.gBase;

        // 2. Principe de Newton : Détection du mode dynamique
        const status = Math.abs(effectiveA) < 0.1 ? "STABLE" : (effectiveA > 0 ? "ACCÉLÉRATION" : "DÉCÉLÉRATION INVERSÉE");
        
        // 3. Bascule Scientifique pour Lorentz (Vitesse Micro)
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
        
        // Bascule automatique en notation scientifique pour les vitesses micro (ex: 1 + 5.89e-16)
        if (this.vMs > 0 && this.vMs < 1000) {
            const diff = math.subtract(lorentz, 1);
            el.innerHTML = `1 + ${math.format(diff, {notation: 'exponential', precision: 3})}`;
        } else {
            el.textContent = math.format(lorentz, {precision: 15});
        }

        const energy = math.multiply(lorentz, math.bignumber(this.mass), math.pow(c, 2));
        document.getElementById('relativistic-energy').textContent = math.format(energy, {notation: 'exponential', precision: 2}) + " J";
    }

    updateUI(x, y, z, eff, status) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        set('acc-x', x.toFixed(2));
        set('acc-y', y.toFixed(2));
        set('acc-z', z.toFixed(2));
        set('accel-long-filtered', eff.toFixed(4) + " m/s²");
        set('dynamic-master-mode', status);
        set('force-g-vertical', (Math.abs(z)/9.806).toFixed(3) + " G");
    }
}
window.ProfessionalUKF = ProfessionalUKF;
