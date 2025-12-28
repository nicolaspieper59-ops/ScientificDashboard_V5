class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.dist = 0;
        this.accel = { x: 0, y: 0, z: 9.81 };
        this.pitch = 0;
        this.mass = 70;
        this.c = 299792458;
        this.G = 6.67430e-11;
        this.lastTime = performance.now();
    }

    predict(dt) {
        if (!this.isRunning) return;

        const gRef = 9.80665;
        const gTotal = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2) / gRef;
        
        // --- PHYSIQUE DE L'AIR ---
        const press = parseFloat(document.getElementById('pressure-hpa')?.textContent) || 1013.25;
        const temp = parseFloat(document.getElementById('air-temp-c')?.textContent) || 15;
        const rho = (press * 100) / (287.058 * (temp + 273.15));
        
        // --- NEWTON & TRAÎNÉE ---
        const Cx = this.vMs > 80 ? 0.15 : 0.35;
        const forceDrag = 0.5 * rho * Math.pow(this.vMs, 2) * Cx * 1.8;
        const forcePente = this.mass * gRef * Math.sin(this.pitch * Math.PI / 180);
        const aNet = this.accel.x - (forceDrag + forcePente) / this.mass;

        this.vMs += aNet * dt;
        if (this.vMs < 0.0001) this.vMs = 0;
        this.dist += (this.vMs * dt) / 1000;

        // --- RELATIVITÉ ---
        const beta = this.vMs / this.c;
        const lorentz = 1 / Math.sqrt(1 - beta * beta);
        const e0 = this.mass * Math.pow(this.c, 2);

        this.updateUI({ rho, gTotal, lorentz, aNet, e0, press });
    }

    updateUI(d) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        
        set('speed-main-display', (this.vMs * 3.6).toFixed(1) + " km/h");
        set('v-cosmic', (this.vMs * 3.6 + 1670).toFixed(0) + " km/h"); // Vitesse + Rotation Terre
        set('lorentz-factor', d.lorentz.toFixed(12));
        set('rest-mass-energy', d.e0.toExponential(3) + " J");
        set('relativistic-energy', (d.e0 * d.lorentz).toExponential(3) + " J");
        set('air-density', d.rho.toFixed(4) + " kg/m³");
        set('dynamic-pressure', (0.5 * d.rho * Math.pow(this.vMs, 2)).toFixed(2) + " Pa");
        set('reynolds-number', ((d.rho * this.vMs * 1.8) / 1.8e-5).toExponential(2));
        set('schwarzschild-radius', (2 * this.G * this.mass / Math.pow(this.c, 2)).toExponential(3) + " m");
        set('force-g-vert', d.gTotal.toFixed(3));
        set('accel-long-2', d.aNet.toFixed(3) + " m/s²");
        set('total-distance-3d-1', this.dist.toFixed(4) + " km");
    }
}
window.ProfessionalUKF = ProfessionalUKF;
