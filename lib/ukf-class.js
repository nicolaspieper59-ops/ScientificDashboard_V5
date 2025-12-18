// =================================================================
// PROFESSIONAL UKF - ULTIMATE CONSOLIDATION (V60 - STRATÉGIQUE)
// Intègre : 24 États, Q Adaptatif, Correction Thermique, Mitigation Vibrations,
//           Contraintes NHC, ZUUV, et Modélisation des Facteurs d'Échelle.
// =================================================================

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') {
            console.error("UKF Error: math.js est requis.");
            return;
        }

        this.initialized = false;
        
        // --- CONSTANTES PHYSIQUES & GÉOPHYSIQUES AVANCÉES ---
        this.Omega_E = 7.292115e-5; 
        this.R_MAJOR = 6378137.0;   
        this.FLATTENING = 1/298.257223563;
        this.E_SQUARED = 2 * this.FLATTENING - this.FLATTENING**2; 
        this.D2R = Math.PI / 180; 
        this.R2D = 180 / Math.PI;

        // --- PARAMÈTRES DE L'OBJET (Aéro & Masse) ---
        this.AREA = 0.5;      
        this.Cd = 1.1;        
        this.RHO_0 = 1.225;   
        this.DEFAULT_MASS = 70.0; 

        // --- VECTEUR D'ÉTAT ÉTENDU (24 États) ---
        // 0-2: Pos (Lat, Lon, Alt) | 3-5: Vel (N, E, D) | 6-9: Quat (q0, q1, q2, q3)
        // 10-12: Gyro Bias | 13-15: Accel Bias
        // 16-18: Gyro Scale Factor | 19-21: Accel Scale Factor | 22-23: Innovation/Noise terms
        this.n = 24; 
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // Initialisation Géo
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon); 
        this.x.subset(math.index(2, 0), alt); 
        this.x.subset(math.index(6, 0), 1.0); // Quaternion neutre

        // --- SUIVI DYNAMIQUE & ADAPTATIF ---
        this.lastInnovationNorm = 0;
        this.lastTemp = null;
        this.currentDynamicFactor = 1.0;

        // --- PARAMÈTRES UKF ---
        this.alpha = 1e-3; this.beta = 2; this.kappa = 0;
        this.lambda = (this.alpha**2) * (this.n + this.kappa) - this.n;
        this.setupWeights();
        
        // --- COVARIANCES INITIALES (P) ---
        this.P = math.diag(math.zeros(this.n).map((v, i) => {
            if (i <= 2) return 1e-7;   // Pos
            if (i <= 5) return 1e-3;   // Vel
            if (i <= 9) return 1e-6;   // Quat
            if (i <= 15) return 1e-8;  // Biais
            return 1e-4;               // Scale Factors
        }));

        // --- MATRICES DE BRUIT DE MESURE (R) ---
        this.R_GPS = math.diag([0.5, 0.5, 1.5, 0.2, 0.2, 0.2]); 
        this.R_MAG = math.diag([1e-3, 1e-3, 1e-3]); 
        this.R_NHC = math.diag([1e-4, 1e-4]); // Vitesse latérale/verticale
        this.R_ZUUV = math.diag([1e-4, 1e-4, 1e-4, 1e-9, 1e-9, 1e-9]); 
    }

    setupWeights() {
        const c = 0.5 / (this.n + this.lambda);
        this.Wm = math.zeros([1, 2 * this.n + 1]);
        this.Wc = math.zeros([1, 2 * this.n + 1]);
        this.Wm.subset(math.index(0, 0), this.lambda / (this.n + this.lambda));
        this.Wc.subset(math.index(0, 0), this.Wm.subset(math.index(0, 0)) + (1 - this.alpha**2 + this.beta));
        for (let i = 1; i <= 2 * this.n; i++) {
            this.Wm.subset(math.index(0, i), c);
            this.Wc.subset(math.index(0, i), c);
        }
    }

    // =================================================================
    // A. MODÈLE DE TRANSITION (f) - PHYSIQUE STRATÉGIQUE
    // =================================================================
    
    f(x_k_minus, dt, acc, gyro, F_ext_NED, T_ambient, vibrEnergy) {
         let x_new = math.clone(x_k_minus);
         
         const lat_rad = x_k_minus.subset(math.index(0, 0)) * this.D2R;
         const alt_m = x_k_minus.subset(math.index(2, 0));
         const V_NED = [x_k_minus.subset(math.index(3, 0)), x_k_minus.subset(math.index(4, 0)), x_k_minus.subset(math.index(5, 0))];
         const Q_prev = [x_k_minus.subset(math.index(6, 0)), x_k_minus.subset(math.index(7, 0)), x_k_minus.subset(math.index(8, 0)), x_k_minus.subset(math.index(9, 0))];
         
         // 1. CORRECTION CAPTEURS (Biais + Facteurs d'Échelle)
         const gyroBias = [x_k_minus.subset(math.index(10,0)), x_k_minus.subset(math.index(11,0)), x_k_minus.subset(math.index(12,0))];
         const accBias  = [x_k_minus.subset(math.index(13,0)), x_k_minus.subset(math.index(14,0)), x_k_minus.subset(math.index(15,0))];
         const gyroSF   = [x_k_minus.subset(math.index(16,0)), x_k_minus.subset(math.index(17,0)), x_k_minus.subset(math.index(18,0))];
         const accSF    = [x_k_minus.subset(math.index(19,0)), x_k_minus.subset(math.index(20,0)), x_k_minus.subset(math.index(21,0))];

         let gyro_corr = [
             (gyro.x - gyroBias[0]) * (1 + gyroSF[0]),
             (gyro.y - gyroBias[1]) * (1 + gyroSF[1]),
             (gyro.z - gyroBias[2]) * (1 + gyroSF[2])
         ];

         let acc_corr = [
             (acc.x - accBias[0]) * (1 + accSF[0]),
             (acc.y - accBias[1]) * (1 + accSF[1]),
             (acc.z - accBias[2]) * (1 + accSF[2])
         ];

         // 2. MITIGATION VIBRATIONS (Correction sur-estimation vitesse)
         if (vibrEnergy > 0.05) {
             const vFactor = Math.sqrt(Math.max(0.1, math.norm(acc_corr)**2 - (vibrEnergy * 0.5))) / (math.norm(acc_corr) + 1e-9);
             acc_corr = acc_corr.map(v => v * vFactor);
         }

         // 3. GRAVITÉ LOCALE (WGS84 + Correction Altitude)
         const sinLat = Math.sin(lat_rad);
         const g_equator = 9.7803253359;
         let g_loc = g_equator * (1 + 0.0019318526 * sinLat**2) / Math.sqrt(1 - 0.00669438 * sinLat**2);
         g_loc -= (3.086e-6 * alt_m); 

         // 4. CORIOLIS & FORCES EXTERNES
         const currentMass = this.getCurrentMass();
         const Omega_N = this.Omega_E * Math.cos(lat_rad);
         const Omega_D = -this.Omega_E * sinLat;
         
         const a_cor = [
             2 * Omega_D * V_NED[1],
             -2 * (Omega_N * V_NED[2] + Omega_D * V_NED[0]),
             2 * Omega_N * V_NED[1]
         ];

         let a_ext = (currentMass > 0 && F_ext_NED) ? F_ext_NED.map(f => f / currentMass) : [0,0,0];

         // 5. INTÉGRATION ACCÉLÉRATION NETTE
         const C_b_n = this.quaternionToRotationMatrix(Q_prev); 
         const Acc_NED = math.multiply(C_b_n, math.matrix(acc_corr)).toArray();
         
         const a_net = [
             Acc_NED[0] + a_cor[0] + a_ext[0],
             Acc_NED[1] + a_cor[1] + a_ext[1],
             Acc_NED[2] - g_loc + a_cor[2] + a_ext[2]
         ];

         // 6. MISE À JOUR ÉTATS (Vitesse, Pos, Quat)
         const vn_new = V_NED[0] + a_net[0] * dt;
         const ve_new = V_NED[1] + a_net[1] * dt;
         const vd_new = V_NED[2] + a_net[2] * dt;

         const Rn = this.R_MAJOR / Math.sqrt(1 - this.E_SQUARED * sinLat**2);
         const Rm = Rn * ((1 - this.E_SQUARED) / (1 - this.E_SQUARED * sinLat**2));
         
         const Lat_new = x_k_minus.subset(math.index(0,0)) + (vn_new * dt) / (Rm + alt_m) * this.R2D;
         const Lon_new = x_k_minus.subset(math.index(1,0)) + (ve_new * dt) / ((Rn + alt_m) * Math.cos(lat_rad)) * this.R2D;
         const Alt_new = alt_m - (vd_new * dt);

         // Intégration Quaternion
         const w_norm = math.norm(gyro_corr);
         let Q_new = Q_prev;
         if (w_norm > 1e-9) {
             const ha = w_norm * dt * 0.5;
             const s_ha = Math.sin(ha) / w_norm;
             const dQ = [Math.cos(ha), gyro_corr[0]*s_ha, gyro_corr[1]*s_ha, gyro_corr[2]*s_ha];
             Q_new = this.q_mult(Q_prev, dQ);
         }

         // Construction du vecteur final
         x_new.subset(math.index(0,0), Lat_new); x_new.subset(math.index(1,0), Lon_new); x_new.subset(math.index(2,0), Alt_new);
         x_new.subset(math.index(3,0), vn_new); x_new.subset(math.index(4,0), ve_new); x_new.subset(math.index(5,0), vd_new);
         x_new.subset(math.index(6,0), Q_new[0]); x_new.subset(math.index(7,0), Q_new[1]); x_new.subset(math.index(8,0), Q_new[2]); x_new.subset(math.index(9,0), Q_new[3]);

         return x_new;
    }

    // =================================================================
    // B. PRÉDICTION ADAPTATIVE (Q)
    // =================================================================

    predict(dt, acc, gyro, F_ext_NED = [0, 0, 0], T_ambient = 25, vibrEnergy = 0) {
        if (!this.initialized) return;
        
        // --- CALCUL DES FACTEURS ADAPTATIFS ---
        this.currentDynamicFactor = 1 + (math.norm([acc.x, acc.y, acc.z])**2 / 100);
        
        let tempFactor = 1.0;
        if (this.lastTemp !== null) {
            let tRate = Math.abs(T_ambient - this.lastTemp) / dt;
            tempFactor = 1 + (tRate * 500); 
        }
        this.lastTemp = T_ambient;

        const REF_INNOV = 0.5;
        let innovFactor = 1 + Math.min(10, (this.lastInnovationNorm / REF_INNOV));
        this.lastInnovationNorm = 0; // Reset pour le prochain cycle

        // --- PROPAGATION SIGMA POINTS ---
        const rootTerm = math.sqrt(this.n + this.lambda);
        const S = math.multiply(rootTerm, math.sqrtm(this.P));
        
        const Chi = this.generateSigmas(S);
        const Chi_next = math.zeros([this.n, 2 * this.n + 1]);
        let x_pred = math.zeros([this.n, 1]);

        for (let i = 0; i <= 2 * this.n; i++) {
            const next_s = this.f(Chi.subset(math.index(math.range(0, this.n), i)), dt, acc, gyro, F_ext_NED, T_ambient, vibrEnergy);
            Chi_next.subset(math.index(math.range(0, this.n), i), next_s);
            x_pred = math.add(x_pred, math.multiply(this.Wm.subset(math.index(0, i)), next_s));
        }

        // --- MATRICE Q ADAPTATIVE ---
        const Q = math.diag(math.zeros(this.n).map((v, i) => {
            let base = (i <= 5) ? 1e-4 : 1e-7;
            if (i >= 10 && i <= 15) base = 1e-10 * tempFactor; // Biais sensibles au thermique
            return base * dt * innovFactor * this.currentDynamicFactor;
        }));

        this.x = x_pred;
        this.P = Q;
        for (let i = 0; i <= 2 * this.n; i++) {
            const diff = math.subtract(Chi_next.subset(math.index(math.range(0, this.n), i)), this.x);
            this.P = math.add(this.P, math.multiply(this.Wc.subset(math.index(0, i)), math.multiply(diff, math.transpose(diff))));
        }
        this.normalizeQuaternion();
    }

    // =================================================================
    // C. MISES À JOUR (Updates & NHC)
    // =================================================================

    /**
     * Contrainte Non-Holonomique (NHC) : Essentiel pour navigation souterraine
     * Force la vitesse latérale/verticale à tendre vers 0 dans le Body Frame.
     */
    update_NHC() {
        if (!this.initialized) return;
        const h_nhc = (x) => {
            const q = [x.subset(math.index(6,0)), x.subset(math.index(7,0)), x.subset(math.index(8,0)), x.subset(math.index(9,0))];
            const v = [x.subset(math.index(3,0)), x.subset(math.index(4,0)), x.subset(math.index(5,0))];
            const v_body = math.multiply(this.quaternionToRotationMatrix(q), math.matrix(v));
            return v_body.subset(math.index([1, 2], 0)); // Y et Z body
        };
        this.UKF_Update_Core(2, this.R_NHC, math.matrix([[0],[0]]), h_nhc);
    }

    UKF_Update_Core(m, R, y_k, h) {
        const rootTerm = math.sqrt(this.n + this.lambda); 
        const S = math.multiply(rootTerm, math.sqrtm(this.P));
        const Chi = this.generateSigmas(S);
        
        const Y = math.zeros([m, 2 * this.n + 1]);
        for (let i = 0; i <= 2 * this.n; i++) {
            Y.subset(math.index(math.range(0, m), i), h(Chi.subset(math.index(math.range(0, this.n), i))));
        }
        
        let y_mean = math.zeros([m, 1]);
        for (let i = 0; i <= 2 * this.n; i++) y_mean = math.add(y_mean, math.multiply(this.Wm.subset(math.index(0, i)), math.subset(Y, math.index(math.range(0, m), i))));

        // Innovation Tracking
        const innov = math.subtract(y_k, y_mean);
        this.lastInnovationNorm = math.norm(innov);

        let Pyy = R; 
        let Pxy = math.zeros([this.n, m]); 
        for (let i = 0; i <= 2 * this.n; i++) {
            const dy = math.subtract(Y.subset(math.index(math.range(0, m), i)), y_mean);
            const dx = math.subtract(Chi.subset(math.index(math.range(0, this.n), i)), this.x);
            const wc = this.Wc.subset(math.index(0, i));
            Pyy = math.add(Pyy, math.multiply(wc, math.multiply(dy, math.transpose(dy))));
            Pxy = math.add(Pxy, math.multiply(wc, math.multiply(dx, math.transpose(dy))));
        }

        const K = math.multiply(Pxy, math.inv(Pyy));
        this.x = math.add(this.x, math.multiply(K, innov));
        this.P = math.subtract(this.P, math.multiply(K, math.multiply(Pyy, math.transpose(K))));
        this.normalizeQuaternion();
    }

    // --- OUTILS MATHÉMATIQUES ---
    generateSigmas(S) {
        const Chi = math.zeros([this.n, 2 * this.n + 1]);
        Chi.subset(math.index(math.range(0, this.n), 0), this.x);
        for (let i = 0; i < this.n; i++) {
            const col = math.subset(S, math.index(math.range(0, this.n), i));
            Chi.subset(math.index(math.range(0, this.n), i + 1), math.add(this.x, col));
            Chi.subset(math.index(math.range(0, this.n), i + this.n + 1), math.subtract(this.x, col));
        }
        return Chi;
    }

    normalizeQuaternion() {
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const nq = Math.sqrt(q[0]**2+q[1]**2+q[2]**2+q[3]**2);
        this.x.set([6,0], q[0]/nq); this.x.set([7,0], q[1]/nq); this.x.set([8,0], q[2]/nq); this.x.set([9,0], q[3]/nq);
    }

    quaternionToRotationMatrix(q) {
        const [q0, q1, q2, q3] = q;
        return math.matrix([
            [q0*q0+q1*q1-q2*q2-q3*q3, 2*(q1*q2-q0*q3), 2*(q1*q3+q0*q2)],
            [2*(q1*q2+q0*q3), q0*q0-q1*q1+q2*q2-q3*q3, 2*(q2*q3-q0*q1)],
            [2*(q1*q3-q0*q2), 2*(q2*q3+q0*q1), q0*q0-q1*q1-q2*q2+q3*q3]
        ]);
    }

    q_mult(q1, q2) {
        return [
            q1[0]*q2[0] - q1[1]*q2[1] - q1[2]*q2[2] - q1[3]*q2[3],
            q1[0]*q2[1] + q1[1]*q2[0] + q1[2]*q2[3] - q1[3]*q2[2],
            q1[0]*q2[2] - q1[1]*q2[3] + q1[2]*q2[0] + q1[3]*q2[1],
            q1[0]*q2[3] + q1[1]*q2[2] - q1[2]*q2[1] + q1[3]*q2[0]
        ];
    }

    getCurrentMass() {
        const el = document.getElementById('masse-obj-kg');
        if (el) {
            const m = parseFloat(el.textContent || el.value);
            if (!isNaN(m) && m > 0) return m;
        }
        return this.DEFAULT_MASS;
    }

    // --- ACCESSEURS PUBLICS ---
    initialize(lat, lon, alt) {
        this.x.set([0, 0], lat); this.x.set([1, 0], lon); this.x.set([2, 0], alt);
        this.initialized = true;
    }

    getState() {
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const v = [this.x.get([3,0]), this.x.get([4,0]), this.x.get([5,0])];
        return {
            lat: this.x.get([0,0]), lon: this.x.get([1,0]), alt: this.x.get([2,0]),
            speed: Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2),
            q: q, dynamicFactor: this.currentDynamicFactor
        };
    }
}

window.ProfessionalUKF = ProfessionalUKF;
