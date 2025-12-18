/**
 * PROFESSIONAL UKF V60 - OMNIPOTENCE ENGINE
 * Synthèse 24 États : Pos(3), Vel(3), Quat(4), Bias(6), Scale(6), Dynamic(2)
 */
class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js requis");
        this.n = 24;
        this.initialized = false;
        this.D2R = Math.PI / 180;
        this.R2D = 180 / Math.PI;

        this.x = math.matrix(math.zeros([this.n, 1]));
        this.P = math.multiply(math.eye(this.n), 1e-6);
        
        // Paramètres de transport
        this.mass = 70.0;
        this.isAeroMode = false;
        this.totalDistance3D = 0;
    }

    // --- CONTRAINTE DE NON-HOLONOMIE (Réalisme Horizontal) ---
    applyNHC() {
        if (!this.initialized) return;
        const { yaw } = this.getEuler();
        const vn = this.x.get([3,0]); // Vitesse Nord
        const ve = this.x.get([4,0]); // Vitesse Est

        // Calcul de la vitesse latérale (Side-slip)
        const vLat = -vn * Math.sin(yaw) + ve * Math.cos(yaw);
        
        // Correction : On force la vitesse latérale vers zéro (le véhicule ne glisse pas)
        // Gain de 0.15 pour une stabilisation fluide entre 0 et 20 km/h
        const correction = vLat * 0.15;
        this.x.set([3,0], vn + correction * Math.sin(yaw));
        this.x.set([4,0], ve - correction * Math.cos(yaw));
    }

    // --- STABILISATION CAP (Magnétomètre Adaptatif) ---
    updateHeading(magX, magY, speed) {
        const { pitch, roll, yaw: currentYaw } = this.getEuler();
        
        // Tilt-compensation pour maintenir le cap malgré l'inclinaison
        const xh = magX * Math.cos(pitch) + magY * Math.sin(roll) * Math.sin(pitch);
        const yh = magY * Math.cos(roll);
        const magYaw = Math.atan2(-yh, xh);

        // Gain adaptatif : plus on va vite, plus on fait confiance à l'inertie
        const alpha = speed > 5 ? 0.95 : 0.70; 
        this.x.set([8, 0], (currentYaw * alpha) + (magYaw * (1 - alpha)));
    }

    getEuler() {
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        return {
            roll: Math.atan2(2*(q[0]*q[1] + q[2]*q[3]), 1 - 2*(q[1]*q[1] + q[2]*q[2])),
            pitch: Math.asin(Math.max(-1, Math.min(1, 2*(q[0]*q[2] - q[3]*q[1])))),
            yaw: Math.atan2(2*(q[0]*q[3] + q[1]*q[2]), 1 - 2*(q[2]*q[2] + q[3]*q[3]))
        };
    }

    getState() {
        const e = this.getEuler();
        const vx = this.x.get([3,0]), vy = this.x.get([4,0]), vz = this.x.get([5,0]);
        return {
            lat: this.x.get([0,0]), lon: this.x.get([1,0]), alt: this.x.get([2,0]),
            pitch: e.pitch * this.R2D, roll: e.roll * this.R2D, yaw: e.yaw * this.R2D,
            speed3D: Math.sqrt(vx*vx + vy*vy + vz*vz)
        };
    }
                             }
