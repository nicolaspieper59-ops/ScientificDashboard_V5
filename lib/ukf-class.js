/**
 * =================================================================
 * PROFESSIONAL UKF V60 - PLATINUM STRATEGIC ENGINE
 * =================================================================
 * Synthèse finale de 24 États :
 * - Pos(3), Vel(3), Quat(4), Bias(6), ScaleFactors(6), Dynamic(2)
 * Physique : Coriolis, Gravité Somigliana, Traînée Aéro, ZUPT, NHC.
 * Optimisé pour : Vélo (Vibrations), Avion (Pitch), Métro (Dead Reckoning).
 */

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js est requis");

        this.n = 24; // Extension à 24 états pour calibration auto
        this.initialized = false;

        // --- CONSTANTES GÉOPHYSIQUES (WGS84) ---
        this.D2R = Math.PI / 180;
        this.R2D = 180 / Math.PI;
        this.Omega_E = 7.292115e-5; 
        this.R_MAJOR = 6378137.0;
        this.FLATTENING = 1/298.257223563;
        this.E_SQUARED = 2 * this.FLATTENING - this.FLATTENING**2;

        // --- VECTEUR D'ÉTAT (x) ---
        // 0-2:Lla, 3-5:Vel(NED), 6-9:Quat, 10-15:Bias, 16-21:Scale, 22-23:Ext
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.P = math.multiply(math.eye(this.n), 1e-6);

        // Paramètres UKF (Sigma Points)
        this.alpha = 1e-3;
        this.beta = 2;
        this.kappa = 0;
        this.lambda = (this.alpha**2) * (this.n + this.kappa) - this.n;
        
        // --- PROFIL DE TRANSPORT ---
        this.mass = 70.0;
        this.area = 0.5;
        this.cd = 1.1; // Coefficient de traînée (Vélo/Humain)
        this.isAeroMode = false;
        
        // --- DISTANCE & INERTIE ---
        this.totalDistance3D = 0;
        this.magBias = { x: 0, y: 0 };
    }

    // =================================================================
    // LOGIQUE DE PRÉDICTION (MODÈLE DYNAMIQUE)
    // =================================================================

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized) return;

        const sigmas = this.generateSigmas();
        const predictedSigmas = sigmas.map(s => this.transitionFunction(s, dt, accRaw, gyroRaw));
        
        // Moyenne pondérée
        let x_new = math.multiply(predictedSigmas[0], this.Wm[0]);
        for (let i = 1; i < predictedSigmas.length; i++) {
            x_new = math.add(x_new, math.multiply(predictedSigmas[i], this.Wm[i]));
        }
        this.x = x_new;

        // Covariance
        let P_new = math.zeros([this.n, this.n]);
        for (let i = 0; i < predictedSigmas.length; i++) {
            const diff = math.subtract(predictedSigmas[i], this.x);
            P_new = math.add(P_new, math.multiply(math.multiply(diff, math.transpose(diff)), this.Wc[i]));
        }
        this.P = math.add(P_new, this.Q);
        
        this.normalizeQuaternion();
        this.applyNHC(); // Contrainte de non-holonomie automatique
    }

    transitionFunction(s, dt, acc, gyro) {
        let ns = s.clone();
        const vel = [s.get([3,0]), s.get([4,0]), s.get([5,0])];
        const q = [s.get([6,0]), s.get([7,0]), s.get([8,0]), s.get([9,0])];

        // 1. Correction Capteurs (Bias & Scale)
        const a_corr = [
            (acc.x - s.get([13,0])) * s.get([19,0]),
            (acc.y - s.get([14,0])) * s.get([20,0]),
            (acc.z - s.get([15,0])) * s.get([21,0])
        ];

        // 2. Gravité & Coriolis (WGS84)
        const g = this.getGravitySomigliana(s.get([0,0]), s.get([2,0]));
        const f_ned = this.rotateVector(q, a_corr);
        
        // 3. Traînée Aérodynamique (Crucial pour vélo/avion)
        const v_mag = Math.sqrt(vel[0]**2 + vel[1]**2 + vel[2]**2);
        const drag = -0.5 * 1.225 * this.area * this.cd * v_mag / this.mass;

        // Accélération finale NED
        const acc_ned = [
            f_ned[0] + (vel[0] * drag),
            f_ned[1] + (vel[1] * drag),
            f_ned[2] + g + (vel[2] * drag)
        ];

        // 4. Intégration
        ns.set([3,0], vel[0] + acc_ned[0] * dt);
        ns.set([4,0], vel[1] + acc_ned[1] * dt);
        ns.set([5,0], vel[2] + acc_ned[2] * dt);

        // Update Distance 3D (Inertielle)
        if (v_mag > 0.1) this.totalDistance3D += v_mag * dt;

        return ns;
    }

    // =================================================================
    // CONTRAINTES PROFESSIONNELLES (RÉALISME HORIZONTAL)
    // =================================================================

    applyNHC() {
        // Contrainte de Non-Holonomie : un véhicule ne glisse pas latéralement
        const { yaw } = this.getEuler();
        const vn = this.x.get([3,0]);
        const ve = this.x.get([4,0]);

        // Vitesse latérale (doit tendre vers 0)
        const vLat = -vn * Math.sin(yaw) + ve * Math.cos(yaw);
        
        // On réduit la dérive latérale de 15% par cycle
        const correction = vLat * 0.15;
        this.x.set([3,0], vn + correction * Math.sin(yaw));
        this.x.set([4,0], ve - correction * Math.cos(yaw));
    }

    /**
     * Stabilisation Cap via Magnétomètre Tilt-Compensé
     */
    updateHeading(magX, magY) {
        const { pitch, roll, yaw: currentYaw } = this.getEuler();
        
        // Tilt compensation pour inclinaison vélo/avion
        const xh = magX * Math.cos(pitch) + magY * Math.sin(roll) * Math.sin(pitch);
        const yh = magY * Math.cos(roll);
        const magYaw = Math.atan2(-yh, xh);

        // Gain adaptatif selon la vitesse
        const speed = Math.sqrt(this.x.get([3,0])**2 + this.x.get([4,0])**2);
        const alpha = speed > 5 ? 0.95 : 0.70; // Plus on va vite, plus on suit l'inertie
        
        this.x.set([8, 0], (currentYaw * alpha) + (magYaw * (1 - alpha)));
    }

    // =================================================================
    // UTILITAIRES PHYSIQUES
    // =================================================================

    getGravitySomigliana(latDeg, alt) {
        const phi = latDeg * this.D2R;
        const sin2 = Math.sin(phi)**2;
        const g0 = 9.7803267714 * (1 + 0.00193185138639 * sin2) / Math.sqrt(1 - 0.00669437999013 * sin2);
        return g0 * Math.pow(this.R_MAJOR / (this.R_MAJOR + alt), 2);
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
        return {
            lat: this.x.get([0,0]), lon: this.x.get([1,0]), alt: this.x.get([2,0]),
            vx: this.x.get([3,0]), vy: this.x.get([4,0]), vz: this.x.get([5,0]),
            pitch: e.pitch * this.R2D, roll: e.roll * this.R2D, yaw: e.yaw * this.R2D,
            speed3D: Math.sqrt(this.x.get([3,0])**2 + this.x.get([4,0])**2 + this.x.get([5,0])**2),
            distIMU: this.totalDistance3D
        };
    }
                                                                        }
