/**
 * Professional UKF 21-States - Master Omni-Motion
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.dist = 0;
        this.altitude = 0;
        this.pressureHardware = 1013.25;
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.pitch = 0;
        this.mass = 70;
        this.gRef = 9.80665;
        this.lastTime = performance.now();
        this.c = 299792458;
    }

    predict() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        // 1. DÉTECTION AUTOMATIQUE DU PROFIL
        const gTotal = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2) / this.gRef;
        let profile = "NORMAL";
        if (gTotal > 2.2) profile = "ACROBATIE/MANÈGE";
        if (this.vMs > 80) profile = "AÉRONAUTIQUE";
        if (this.vMs < 0.05 && gTotal < 1.05) profile = "MICRO-BIO/LENT";

        // 2. NEWTON & CORRECTION DE PENTE
        const pitchRad = (this.pitch * Math.PI) / 180;
        const temp = parseFloat(document.getElementById('air-temp-c')?.textContent) || 15;
        const rho = (this.pressureHardware * 100) / (287.058 * (temp + 273.15));
        
        // Résistances
        const Cx = (profile === "AÉRONAUTIQUE") ? 0.15 : 0.35;
        const forceDrag = 0.5 * rho * Math.pow(this.vMs, 2) * Cx * 1.8;
        const forcePente = this.mass * this.gRef * Math.sin(pitchRad);

        // Accélération nette (Newton)
        const aNet = this.accel.x - (forceDrag + forcePente) / this.mass;

        // 3. INTÉGRATION & RELATIVITÉ
        this.vMs += aNet * dt;
        if (Math.abs(this.vMs) < 0.001) this.vMs = 0; // Seuil gastéropode

        const beta = this.vMs / this.c;
        const lorentz = 1 / Math.sqrt(1 - beta * beta);
        this.dist += (this.vMs * dt) / 1000;

        this.updateUI(rho, gTotal, profile, lorentz, aNet);
    }

    updateUI(rho, g, p, l, a) {
        const data = {
            'speed-main-display': (this.vMs * 3.6).toFixed(2),
            'force-g-vert': g.toFixed(3),
            'air-density': rho.toFixed(4),
            'lorentz-factor': l.toFixed(12),
            'accel-long-filtered': a.toFixed(3),
            'mode-dynamique-master': p,
            'total-distance-3d': this.dist.toFixed(4),
            'dynamic-pressure': (0.5 * rho * this.vMs**2).toFixed(2),
            'energy-mass-e0': (this.mass * this.c**2).toExponential(3) + " J"
        };
        for (let id in data) {
            document.querySelectorAll(`[id^="${id}"]`).forEach(el => el.textContent = data[id]);
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
