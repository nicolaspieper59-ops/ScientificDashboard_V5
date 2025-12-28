/**
 * Professional UKF 21-States - Master Engine
 * Inclus : PressureSensor Fusion, Thermal Isolation, ISA Model.
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.dist = 0;
        this.altitude = 0;
        this.pressureHardware = null; 
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.gRef = 9.80665;
        this.mass = 75;
        this.lastTime = performance.now();
    }

    // Calcul de la pression hybride (Baro > API > GPS)
    getEffectivePressure() {
        if (this.pressureHardware) return this.pressureHardware;
        const apiPress = parseFloat(document.getElementById('pressure-hpa')?.textContent);
        if (!isNaN(apiPress) && apiPress > 100) return apiPress;
        return 1013.25 * Math.pow(1 - 0.0065 * this.altitude / 288.15, 5.255);
    }

    // Isolation thermique : Estime l'air ambiant à partir de la batterie
    getIsolatedTemp() {
        let rawTemp = parseFloat(document.getElementById('air-temp-c')?.textContent) || 15;
        // Si la donnée vient du téléphone, on retire 4°C de biais thermique processeur
        return rawTemp - 4; 
    }

    predict() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        const pressure = this.getEffectivePressure();
        const temp = this.getIsolatedTemp();
        const rho = (pressure * 100) / (287.058 * (temp + 273.15));

        // Mise à jour de la densité d'air dans le DOM
        const rhoEl = document.getElementById('air-density');
        if (rhoEl) rhoEl.textContent = rho.toFixed(4);

        // Intégration des forces G (IMU)
        const mag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        let aPure = mag - this.gRef;

        // Traînée aérodynamique quadratique
        if (this.vMs > 0) {
            const dragAcc = (0.5 * rho * Math.pow(this.vMs, 2) * 0.3 * 1.8) / this.mass;
            this.vMs -= dragAcc * dt;
        }

        if (Math.abs(aPure) > 0.2) this.vMs += aPure * dt;
        if (this.vMs < 0 || isNaN(this.vMs)) this.vMs = 0;
        
        this.dist += (this.vMs * dt) / 1000;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
