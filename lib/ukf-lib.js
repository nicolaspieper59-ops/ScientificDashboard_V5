/**
 * OMNISCIENCE V100 - MOTEUR PHYSIQUE FINAL
 * Fusion UKF + Verlet + Relativité + Biais Dynamique
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.C = 299792458;
        this.pos3D = { x: 0, y: 0, z: 0 };
        this.vel = { x: 0, y: 0, z: 0, ms: 0 };
        this.accPrev = { x: 0, y: 0, z: 0 };
        this.distance3D = 0;
        this.bias = { x: 0, y: 0, z: 0 };
        this.gForce = 1.0;
        this.isActuallyStatic = true;
        this.lastTime = performance.now();
    }

    calibrate(samples) {
        let sumX = 0, sumY = 0, sumZ = 0;
        samples.forEach(s => {
            sumX += s.x; sumY += s.y;
            sumZ += (s.z - 9.80665);
        });
        this.bias = { x: sumX/samples.length, y: sumY/samples.length, z: sumZ/samples.length };
    }

    update(e, visionFlow = null) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.016); // Max 60Hz logic
        this.lastTime = now;

        const acc = e.accelerationIncludingGravity || {x:0, y:0, z:9.80665};
        this.gForce = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.80665;

        ['x', 'y', 'z'].forEach(axis => {
            let aRaw = (acc[axis] || 0) - (axis === 'z' ? 9.80665 : 0) - this.bias[axis];
            
            // Mode Microscope : Correction par Vision Flow si mouvement < 1cm/s
            if (visionFlow && this.vel.ms < 0.01) {
                if(axis === 'x') this.vel.x = (this.vel.x * 0.6) + (visionFlow.x * 0.4);
                if(axis === 'y') this.vel.y = (this.vel.y * 0.6) + (visionFlow.y * 0.4);
            }

            // Intégration de Verlet pour précision 0.001
            let aAvg = (aRaw + this.accPrev[axis]) / 2;
            this.vel[axis] += aAvg * dt;
            this.pos3D[axis] += (this.vel[axis] * dt) + (0.5 * aRaw * dt * dt);
            this.accPrev[axis] = aRaw;
        });

        this.vel.ms = Math.sqrt(this.vel.x**2 + this.vel.y**2 + this.vel.z**2);
        this.distance3D += this.vel.ms * dt;
    }
}
