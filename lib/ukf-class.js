/**
 * PROFESSIONAL UKF V60 - PLATINUM STRATEGIC (REVISED FOR SPEED STABILITY)
 * - Correction du "Drop à Zéro" prématuré.
 * - Amélioration de la stabilité de l'élan (Inertial Momentum).
 * - Fusion Symétrique 3-Axes.
 */

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 24;
        this.initialized = false;
        this.D2R = Math.PI / 180;
        this.R2D = 180 / Math.PI;
        this.R_MAJOR = 6378137.0;

        this.x = math.matrix(math.zeros([this.n, 1]));
        this.P = math.multiply(math.eye(this.n), 1e-4);
        
        // --- RÉGLAGES DE STABILITÉ (CRITIQUE) ---
        this.momentumFactor = 0.9995; // Augmenté pour éviter le drop à zéro rapide
        this.noiseFloor = 0.002;      // Seuil de détection ultra-fin (m/s²)
        this.totalDistance3D = 0;
    }

    initialize(lat, lon, alt) {
        this.x.set([0, 0], lat);
        this.x.set([1, 0], lon);
        this.x.set([2, 0], alt);
        this.x.set([6, 0], 1.0); // Quaternion W
        for (let i = 16; i <= 21; i++) this.x.set([i, 0], 1.0); // Scale Factors
        this.initialized = true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. Correction Scale & Bias
        const acc = [
            (accRaw.x * this.x.get([19, 0])) - this.x.get([13, 0]),
            (accRaw.y * this.x.get([20, 0])) - this.x.get([14, 0]),
            (accRaw.z * this.x.get([21, 0])) - this.x.get([15, 0])
        ];

        // 2. Calcul Inclinaison (Pitch/Roll) pour projection
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const accNED = this.rotateVector(q, acc);
        
        // Compensation Gravité Somigliana
        const g_loc = this.getGravitySomigliana(this.x.get([0, 0]), this.x.get([2, 0]));
        accNED[2] += g_loc;

        // 3. INTÉGRATION DE LA VITESSE AVEC PERSISTENCE (STABILITÉ)
        const accMag = Math.sqrt(accNED[0]**2 + accNED[1]**2 + accNED[2]**2);
        
        if (accMag > this.noiseFloor) {
            // On intègre l'accélération
            this.x.set([3, 0], this.x.get([3, 0]) + accNED[0] * dt);
            this.x.set([4, 0], this.x.get([4, 0]) + accNED[1] * dt);
            this.x.set([5, 0], this.x.get([5, 0]) + accNED[2] * dt);
        } else {
            // SI AUCUN MOUVEMENT DÉTECTÉ : On garde la vitesse (Élan GPS-Like)
            // On ne coupe pas à zéro, on laisse glisser très lentement
            this.x.set([3, 0], this.x.get([3, 0]) * this.momentumFactor);
            this.x.set([4, 0], this.x.get([4, 0]) * this.momentumFactor);
            this.x.set([5, 0], this.x.get([5, 0]) * this.momentumFactor);
        }

        // 4. Update Position & Distance
        const vx = this.x.get([3,0]), vy = this.x.get([4,0]), vz = this.x.get([5,0]);
        const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        this.totalDistance3D += speed * dt;

        // 5. Mise à jour de l'Attitude (Quaternions)
        this.integrateQuaternions([gyroRaw.x, gyroRaw.y, gyroRaw.z], dt);
    }

    /**
     * Empêche la dérive latérale sans couper la vitesse d'élan
     */
    applyNHC(speed) {
        if (speed < 0.1) return; // Ne pas appliquer à l'arrêt pour laisser le micro-mouvement
        const yaw = this.getEuler().yaw;
        const vn = this.x.get([3, 0]);
        const ve = this.x.get([4, 0]);
        const vLat = -vn * Math.sin(yaw) + ve * Math.cos(yaw);
        this.x.set([3, 0], vn + vLat * Math.sin(yaw) * 0.05);
        this.x.set([4, 0], ve - vLat * Math.cos(yaw) * 0.05);
    }

    // --- Fonctions Physiques ---
    getGravitySomigliana(latDeg, alt) {
        const phi = latDeg * this.D2R;
        const sin2 = Math.sin(phi)**2;
        const g0 = 9.7803267714 * (1 + 0.00193185138639 * sin2) / Math.sqrt(1 - 0.00669437999013 * sin2);
        return g0 * Math.pow(this.R_MAJOR / (this.R_MAJOR + alt), 2);
    }

    rotateVector(q, v) {
        const [qw, qx, qy, qz] = q;
        const [vx, vy, vz] = v;
        return [
            vx*(qw*qw+qx*qx-qy*qy-qz*qz) + vy*2*(qx*qy-qw*qz) + vz*2*(qx*qz+qw*qy),
            vx*2*(qx*qy+qw*qz) + vy*(qw*qw-qx*qx+qy*qy-qz*qz) + vz*2*(qy*qz-qw*qx),
            vx*2*(qx*qz-qw*qy) + vy*2*(qy*qz+qw*qx) + vz*(qw*qw-qx*qx-qy*qy+qz*qz)
        ];
    }

    integrateQuaternions(gyro, dt) {
        let q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const halfDt = 0.5 * dt;
        const qw = q[0], qx = q[1], qy = q[2], qz = q[3];
        const gx = gyro[0], gy = gyro[1], gz = gyro[2];

        this.x.set([6,0], qw + halfDt*(-qx*gx - qy*gy - qz*gz));
        this.x.set([7,0], qx + halfDt*( qw*gx + qy*gz - qz*gy));
        this.x.set([8,0], qy + halfDt*( qw*gy - qx*gz + qz*gx));
        this.x.set([9,0], qz + halfDt*( qw*gz + qx*gy - qy*gx));
        
        // Normalisation
        let norm = Math.sqrt(this.x.get([6,0])**2 + this.x.get([7,0])**2 + this.x.get([8,0])**2 + this.x.get([9,0])**2);
        for(let i=6; i<=9; i++) this.x.set([i,0], this.x.get([i,0])/norm);
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
        const v = [this.x.get([3, 0]), this.x.get([4, 0]), this.x.get([5, 0])];
        return {
            lat: this.x.get([0, 0]), lon: this.x.get([1, 0]), alt: this.x.get([2, 0]),
            speed3D: Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2),
            v_vertical: v[2], pitch: e.pitch * this.R2D, roll: e.roll * this.R2D, yaw: e.yaw * this.R2D,
            distance: this.totalDistance3D
        };
    }
                                   }
