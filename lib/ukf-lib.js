/** * PROFESSIONAL UKF - Newton & Einstein (CODATA 2024) */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.mass = 70; 
        this.c = 299792458; 
        this.gRef = 9.80665; 
    }

    // Cette fonction est appelée par l'écouteur d'événement
    processMotion(event) {
        if (!this.isRunning) return;

        // Récupération des données brutes de l'accéléromètre
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;

        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;

        // 1. Principe de Newton : Soustraction de la pesanteur
        // On calcule la force G totale et on retire la constante terrestre
        const totalRaw = Math.sqrt(x**2 + y**2 + z**2);
        const effectiveA = totalRaw - this.gRef;
        
        // Détermination du statut dynamique
        const status = Math.abs(effectiveA) < 0.2 ? "STABLE" : (effectiveA > 0 ? "ACCÉLÉRATION" : "DÉCÉLÉRATION");

        // 2. Relativité (Calcul haute précision avec Math.js)
        const v = math.bignumber(this.vMs);
        const betaSq = math.divide(math.multiply(v, v), math.pow(this.c, 2));
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, betaSq)));

        this.updateUI(x, y, z, effectiveA, status, lorentz);
    }

    updateUI(x, y, z, effA, status, lorentz) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        
        set('acc-x', x.toFixed(2));
        set('acc-y', y.toFixed(2));
        set('acc-z', z.toFixed(2));
        set('accel-long-filtered', effA.toFixed(4) + " m/s²");
        set('dynamic-master-mode', status);
        set('force-g-vertical', (Math.abs(z)/9.806).toFixed(3) + " G");

        // Bascule scientifique pour le facteur de Lorentz
        const elL = document.getElementById('lorentz-factor');
        if (this.vMs > 0 && this.vMs < 1000) {
            const diff = math.subtract(lorentz, 1);
            elL.innerHTML = `1 + ${math.format(diff, {notation: 'exponential', precision: 3})}`;
        } else {
            elL.textContent = math.format(lorentz, {precision: 15});
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
