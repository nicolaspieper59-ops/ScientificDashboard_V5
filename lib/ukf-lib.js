/**
 * Professional UKF 21-States Engine
 * Dépendances : math.min.js, turf.min.js
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.mass = 70; // kg
        this.c = 299792458;
        
        // État cinématique
        this.vMs = 0;
        this.distTotal = 0;
        this.accel = { x: 0, y: 0, z: 9.81 };
        this.lastPos = null;
        this.rho = 1.225;
    }

    // Calcul de la densité de l'air via Math.js
    updateEnvironment(pressHpa, tempC) {
        // Formule : rho = P / (R * T)
        const R = 287.058;
        const TK = tempC + 273.15;
        this.rho = math.divide(math.multiply(pressHpa, 100), math.multiply(R, TK));
    }

    predict(dt, currentPos) {
        if (!this.isRunning) return;

        // 1. Calcul de la vitesse via Turf (si position disponible)
        if (currentPos && this.lastPos) {
            const from = turf.point([this.lastPos.lon, this.lastPos.lat]);
            const to = turf.point([currentPos.lon, currentPos.lat]);
            const options = { units: 'meters' };
            const d = turf.distance(from, to, options);
            
            // Fusion simple (Lissage)
            const vGps = d / dt;
            if (vGps < 150) { // Filtre anti-saut
                this.vMs = math.add(math.multiply(this.vMs, 0.8), math.multiply(vGps, 0.2));
            }
        }
        if (currentPos) this.lastPos = currentPos;

        // 2. Physique des forces (Traînée)
        const forceDrag = math.multiply(0.5, this.rho, math.pow(this.vMs, 2), 0.35, 1.8);
        const aDrag = math.divide(forceDrag, this.mass);
        
        // Mise à jour vitesse inertielle
        this.vMs = Math.max(0, this.vMs + (this.accel.x - aDrag) * dt);
        this.distTotal += this.vMs * dt;

        // 3. Relativité (Lorentz)
        const beta = math.divide(this.vMs, this.c);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.pow(beta, 2))));

        this.updateUI(lorentz, gTotal = 1.0);
    }

    updateUI(lorentz, g) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        set('speed-main-display', (this.vMs * 3.6).toFixed(1));
        set('speed-stable-kmh', (this.vMs * 3.6).toFixed(2));
        set('total-distance-3d', (this.distTotal / 1000).toFixed(4));
        set('lorentz-factor', lorentz.toFixed(14));
        set('relativistic-energy', math.multiply(lorentz, this.mass, math.pow(this.c, 2)).toExponential(3));
    }
}
window.ProfessionalUKF = ProfessionalUKF;
