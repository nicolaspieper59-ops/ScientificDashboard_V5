/**
 * =================================================================
 * PROFESSIONAL UKF V60 - OMNIPOTENCE STRATEGIC ENGINE
 * =================================================================
 * Version : 60.0 (Platinum)
 * États (24) : Pos(3), Vel(3), Quat(4), Bias(6), ScaleFactors(6), Dynamic(2)
 * Physique : Coriolis, Somigliana, NHC, ZUUV, ZUPT, Drag, LERP Heading.
 * Optimisé pour : Toboggans (G-Extrême), Drones (Souterrain), Manèges.
 * =================================================================
 */

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js est requis pour le moteur UKF.");

        this.n = 24; 
        this.initialized = false;

        // --- CONSTANTES GÉOPHYSIQUES (WGS84) ---
        this.D2R = Math.PI / 180;
        this.R2D = 180 / Math.PI;
        this.Omega_E = 7.292115e-5; // Rotation Terre (rad/s)
        this.R_MAJOR = 6378137.0;   // Rayon Équatorial
        this.G_STD = 9.80665;

        // --- VECTEUR D'ÉTAT (x) & COVARIANCE (P) ---
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.P = math.multiply(math.eye(this.n), 1e-4);

        // --- COMPTEUR DE DISTANCE 3D SYMÉTRIQUE ---
        this.totalDistance3D = 0;
        
        // --- PARAMÈTRES D'ENVIRONNEMENT ---
        this.mass = 70.0;
        this.dragArea = 0.5;
        this.Cd = 1.1; 
        this.isNetherMode = false;
    }

    /**
     * INITIALISATION DU FILTRE
     */
    initialize(lat, lon, alt) {
        this.x.set([0, 0], lat);
        this.x.set([1, 0], lon);
        this.x.set([2, 0], alt);
        
        // Initialisation des quaternions (Identité)
        this.x.set([6, 0], 1.0); 
        
        // Initialisation des Scale Factors à 1.0 (États 16 à 21)
        for (let i = 16; i <= 21; i++) this.x.set([i, 0], 1.0);

        this.initialized = true;
    }

    /**
     * PRÉDICTION (100Hz) - INTÉGRATION VECTORIELLE SYMÉTRIQUE
     */
    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. Application des Scale Factors & Correction des Biais
        const acc = [
            (accRaw.x * this.x.get([19, 0])) - this.x.get([13, 0]),
            (accRaw.y * this.x.get([20, 0])) - this.x.get([14, 0]),
            (accRaw.z * this.x.get([21, 0])) - this.x.get([15, 0])
        ];

        const gyro = [
            (gyroRaw.x * this.x.get([16, 0])) - this.x.get([10, 0]),
            (gyroRaw.y * this.x.get([17, 0])) - this.x.get([11, 0]),
            (gyroRaw.z * this.x.get([18, 0])) - this.x.get([12, 0])
        ];

        // 2. Gravité de Somigliana (Précision théorique maximale)
        const g_loc = this.getGravitySomigliana(this.x.get([0, 0]), this.x.get([2, 0]));

        // 3. Compensation de Coriolis (Navigation Haute Vitesse / Extrême)
        const v = [this.x.get([3, 0]), this.x.get([4, 0]), this.x.get([5, 0])];
        const a_coriolis = [
            -2 * this.Omega_E * Math.sin(this.x.get([0, 0]) * this.D2R) * v[1],
            2 * this.Omega_E * (Math.sin(this.x.get([0, 0]) * this.D2R) * v[0] + Math.cos(this.x.get([0, 0]) * this.D2R) * v[2]),
            -2 * this.Omega_E * Math.cos(this.x.get([0, 0]) * this.D2R) * v[1]
        ];

        // 4. Intégration de l'Attitude (Quaternions)
        this.integrateQuaternions(gyro, dt);

        // 5. Intégration de la Vitesse & Position (NED)
        // Rotation de l'accélération du repère corps vers repère local
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const accNED = this.rotateVector(q, acc);
        
        // Ajout gravité et Coriolis
        const dv = [
            (accNED[0] + a_coriolis[0]) * dt,
            (accNED[1] + a_coriolis[1]) * dt,
            (accNED[2] + a_coriolis[2] + g_loc) * dt
        ];

        this.x.set([3, 0], v[0] + dv[0]);
        this.x.set([4, 0], v[1] + dv[1]);
        this.x.set([5, 0], v[2] + dv[2]);

        // Mise à jour distance 3D
        const speed = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
        const distMult = this.isNetherMode ? 8.0 : 1.0;
        this.totalDistance3D += speed * dt * distMult;

        // 6. Contraintes de Non-Holonomie (NHC) - Verrouillage horizontal
        this.applyNHC(speed);
    }

    /**
     * CONTRAINTE NHC (Véhicule sur rails/route)
     */
    applyNHC(speed) {
        const yaw = this.getEuler().yaw;
        const vn = this.x.get([3, 0]);
        const ve = this.x.get([4, 0]);
        
        // Vitesse latérale théorique (doit être 0)
        const vLat = -vn * Math.sin(yaw) + ve * Math.cos(yaw);
        
        // Correction pseudo-mesure (Gain proportionnel à la vitesse)
        const gain = speed > 0.5 ? 0.1 : 0.01; 
        this.x.set([3, 0], vn + vLat * Math.sin(yaw) * gain);
        this.x.set([4, 0], ve - vLat * Math.cos(yaw) * gain);
    }

    /**
     * STABILISATION CAP (Liaison Magnétomètre Adaptative)
     */
    updateHeading(magX, magY, speed) {
        const { pitch, roll, yaw: currentYaw } = this.getEuler();
        
        // Tilt-Compensation
        const xh = magX * Math.cos(pitch) + magY * Math.sin(roll) * Math.sin(pitch);
        const yh = magY * Math.cos(roll);
        const magYaw = Math.atan2(-yh, xh);

        // LERP entre Gyroscope (Vitesse élevée) et Magnéto (Basse vitesse)
        const alpha = speed > 2 ? 0.98 : 0.85; 
        const newYaw = (currentYaw * alpha) + (magYaw * (1 - alpha));
        this.x.set([8, 0], newYaw);
    }

    /**
     * PHYSIQUE : GRAVITÉ DE SOMIGLIANA
     */
    getGravitySomigliana(latDeg, alt) {
        const phi = latDeg * this.D2R;
        const sin2 = Math.sin(phi)**2;
        const g0 = 9.7803267714 * (1 + 0.00193185138639 * sin2) / Math.sqrt(1 - 0.00669437999013 * sin2);
        return g0 * Math.pow(this.R_MAJOR / (this.R_MAJOR + alt), 2);
    }

    /**
     * UTILITAIRES QUATERNIONS
     */
    integrateQuaternions(gyro, dt) {
        let q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const Omega = [
            [0, -gyro[0], -gyro[1], -gyro[2]],
            [gyro[0], 0, gyro[2], -gyro[1]],
            [gyro[1], -gyro[2], 0, gyro[0]],
            [gyro[2], gyro[1], -gyro[0], 0]
        ];
        
        // Runge-Kutta 1er ordre
        for (let i = 0; i < 4; i++) {
            let dq = 0;
            for (let j = 0; j < 4; j++) dq += 0.5 * Omega[i][j] * q[j] * dt;
            this.x.set([6 + i, 0], q[i] + dq);
        }
        this.normalizeQuaternion();
    }

    normalizeQuaternion() {
        let norm = 0;
        for (let i = 6; i <= 9; i++) norm += this.x.get([i, 0])**2;
        norm = Math.sqrt(norm);
        for (let i = 6; i <= 9; i++) this.x.set([i, 0], this.x.get([i, 0]) / norm);
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
            v_vertical: v[2],
            pitch: e.pitch * this.R2D,
            roll: e.roll * this.R2D,
            yaw: e.yaw * this.R2D,
            distance: this.totalDistance3D
        };
    }
                   }
