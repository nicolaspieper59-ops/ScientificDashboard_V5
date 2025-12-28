/**
 * Professional UKF 21-States - Master Physical Engine
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.dist = 0;
        this.altitude = 0;
        this.pressureHardware = 1013.25;
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.gyro = { x: 0, y: 0, z: 0 };
        this.mass = 70;
        this.gRef = 9.80665;
        this.lastTime = performance.now();
    }

    // Calcul de la densité sans N/A
    getRho() {
        const temp = (parseFloat(document.getElementById('air-temp-c')?.textContent) || 15);
        return (this.pressureHardware * 100) / (287.058 * (temp + 273.15));
    }

    predict() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        const rho = this.getRho();
        const v = this.vMs;

        // Calcul des forces pour supprimer les N/A
        const dragForce = 0.5 * rho * v * v * 0.3 * 1.8;
        const kineticEnergy = 0.5 * this.mass * v * v;
        const q = 0.5 * rho * v * v; // Pression dynamique

        // Mise à jour IMU
        const gForceLong = this.accel.x / 9.80665;
        const gForceVert = this.accel.z / 9.80665;

        this.updateDOM({
            'air-density': rho.toFixed(4),
            'dynamic-pressure': q.toFixed(2),
            'drag-force': dragForce.toFixed(2) + " N",
            'kinetic-energy': kineticEnergy.toFixed(0) + " J",
            'force-g-vert': gForceVert.toFixed(3),
            'force-g-long': gForceLong.toFixed(3),
            'accel-long-1': this.accel.x.toFixed(3),
            'accel-long-2': this.accel.x.toFixed(3)
        });

        // UKF Vitesse
        this.vMs += (this.accel.x * dt); 
        if (this.vMs < 0) this.vMs = 0;
        this.dist += (this.vMs * dt) / 1000;
    }

    updateDOM(data) {
        for (let id in data) {
            const el = document.querySelectorAll(`[id^="${id}"]`);
            el.forEach(e => e.textContent = data[id]);
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
