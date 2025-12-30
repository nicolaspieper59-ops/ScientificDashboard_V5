/** * OMNISCIENCE V100 - ENGINE CORE
 * Physique : Einsteinienne & Newtonienne
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.C = 299792458; // Vitesse lumière m/s
        this.G_CONST = 6.67430e-11;
        this.pos3D = { x: 0, y: 0, z: 0 };
        this.vel = { x: 0, y: 0, z: 0, ms: 0 };
        this.accPrev = { x: 0, y: 0, z: 0 };
        this.distance3D = 0;
        this.bias = { x: 0, y: 0, z: 0 };
        this.gForce = 1.0;
        this.lastTime = performance.now();
    }

    calibrate(samples) {
        let sumX = 0, sumY = 0, sumZ = 0;
        samples.forEach(s => {
            sumX += s.x; sumY += s.y;
            sumZ += (s.z - 9.80665); // Calibration par rapport au référentiel terrestre
        });
        this.bias = { x: sumX/samples.length, y: sumY/samples.length, z: sumZ/samples.length };
    }

    update(e) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        const acc = e.accelerationIncludingGravity || {x:0, y:0, z:9.80665};
        
        // Math : Norme Euclidienne pour G-Force
        this.gForce = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.80665;

        // Algorithme d'Intégration Semi-Implicite (Verlet modifiée)
        ['x', 'y', 'z'].forEach(axis => {
            let aRaw = (acc[axis] || 0) - (axis === 'z' ? 9.80665 : 0) - this.bias[axis];
            
            // Filtre de seuil (ZUPT) pour éliminer la dérive au repos
            if (Math.abs(aRaw) < 0.05) aRaw = 0; 

            this.vel[axis] += aRaw * dt;
            
            // Correction de friction artificielle pour stabilité (si quasi immobile)
            if (this.vel.ms < 0.001) this.vel[axis] *= 0.9;

            this.pos3D[axis] += this.vel[axis] * dt;
            this.accPrev[axis] = aRaw;
        });

        this.vel.ms = Math.sqrt(this.vel.x**2 + this.vel.y**2 + this.vel.z**2);
        this.distance3D += this.vel.ms * dt;
    }
                }
