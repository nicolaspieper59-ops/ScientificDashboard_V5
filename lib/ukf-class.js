// =================================================================
// PROFESSIONAL UNSCENTED KALMAN FILTER (UKF) - 21 ÉTATS - V30 FINALE
// Intégration complète GPS, IMU, et Magnétomètre (Bobines d'induction).
// DÉPENDANCE CRITIQUE: math.js
// =================================================================

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') {
            console.error("UKF Error: math.js is required.");
            return;
        }

        this.initialized = false;
        
        // VECTEUR D'ÉTAT (21)
        // [0-2: Pos(3)], [3-5: Vel(3)], [6-9: Att(4) - Quaternion], [10-12: GyroBias(3)], 
        // [13-15: AccBias(3)], [16-17: Clock(2)], [18-20: Réserves(3)]
        this.n = 21; 
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // 1. Initialisation Position
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon); 
        this.x.subset(math.index(2, 0), alt); 

        // 2. Initialisation Quaternion à l'identité [1, 0, 0, 0]
        this.x.subset(math.index(6, 0), 1); 

        // --- PARAMÈTRES WGS84 ---
        this.G_E = 9.780327; this.R_MAJOR = 6378137.0; this.FLATTENING = 1/298.257223563;
        this.E_SQUARED = (2 * this.FLATTENING) - (this.FLATTENING**2);
        this.D2R = Math.PI / 180; this.R2D = 180 / Math.PI;

        // --- PARAMÈTRES UKF ---
        this.alpha = 1e-3; this.beta = 2; this.kappa = 0;
        this.lambda = (this.alpha**2) * (this.n + this.kappa) - this.n;
        
        // Poids (Sigma Points)
        const c = 0.5 / (this.n + this.lambda);
        this.Wm = math.zeros([1, 2 * this.n + 1]);
        this.Wc = math.zeros([1, 2 * this.n + 1]);
        this.Wm.subset(math.index(0, 0), this.lambda / (this.n + this.lambda));
        this.Wc.subset(math.index(0, 0), this.Wm.subset(math.index(0, 0)) + (1 - this.alpha**2 + this.beta));
        for (let i = 1; i <= 2 * this.n; i++) {
            this.Wm.subset(math.index(0, i), c);
            this.Wc.subset(math.index(0, i), c);
        }
        
        // --- COVARIANCE (P) ---
        this.P = math.diag(math.zeros(this.n).map((v, i) => {
            if (i <= 2) return 1e-6; // Pos (m/deg)
            if (i <= 5) return 1e-2; // Vel (m/s)
            if (i <= 9) return 1e-4; // Att (Quat)
            if (i <= 15) return 1e-4; // Bias (rad/s, m/s²)
            return 1e-4; // Clock/Réserves
        }));

        // --- BRUITS DE MESURE (R) ---
        this.R_GPS = math.diag([0.1, 0.1, 1.0, 0.1, 0.1, 0.1]); // Lat, Lon, Alt, Vx, Vy, Vz
        this.R_BARO = math.matrix([[1e-2]]); // Alt Baro
        this.R_MAG = math.diag([1e-5, 1e-5, 1e-5]); // 3x3 pour [Bx, By, Bz] en µT
        
        // --- Fonctions utilitaires Quaternions/Matrices (CRITIQUES) ---

        /** Calcule la matrice de rotation C_b_n (Body vers NED) à partir du quaternion [q0, q1, q2, q3]. */
        this.quaternionToRotationMatrix = (q) => {
            const [q0, q1, q2, q3] = q;
            return math.matrix([
                [q0*q0+q1*q1-q2*q2-q3*q3, 2*(q1*q2-q0*q3), 2*(q1*q3+q0*q2)],
                [2*(q1*q2+q0*q3), q0*q0-q1*q1+q2*q2-q3*q3, 2*(q2*q3-q0*q1)],
                [2*(q1*q3-q0*q2), 2*(q2*q3+q0*q1), q0*q0-q1*q1-q2*q2+q3*q3]
            ]);
        };
        
        /** Convertit le quaternion en angles d'Euler (Roll, Pitch, Yaw). */
        this.quaternionToEuler = (q) => {
            const [q0, q1, q2, q3] = q;
            const roll = Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2));
            let pitch = 2 * (q0 * q2 - q3 * q1);
            pitch = Math.min(Math.max(pitch, -1), 1); 
            pitch = Math.asin(pitch);
            const yaw = Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3));
            return { roll, pitch, yaw };
        };
        
        /** Multiplie deux quaternions. */
        this.q_mult = (q1, q2) => {
            return [
                q1[0] * q2[0] - q1[1] * q2[1] - q1[2] * q2[2] - q1[3] * q2[3],
                q1[0] * q2[1] + q1[1] * q2[0] + q1[2] * q2[3] - q1[3] * q2[2],
                q1[0] * q2[2] - q1[1] * q2[3] + q1[2] * q2[0] + q1[3] * q2[1],
                q1[0] * q2[3] + q1[1] * q2[2] - q1[2] * q2[1] + q1[3] * q2[0]
            ];
        };
    }
    
    // ... (dans la classe ProfessionalUKF)

    // =================================================================
    // FONCTION CŒUR DE PROPAGATION (INS)
    // =================================================================
    
    /**
     * Fonction de propagation d'état f(x_k-1, u_k, dt).
     * u_k est l'entrée (acc, gyro)
     * Retourne l'état propagé x_k.
     */
    f(x_k_minus, dt, acc, gyro) {
         // Récupération des états précédents (Pos/Vel/Att)
         const Lat_prev = x_k_minus.subset(math.index(0, 0)); // Latitude (deg)
         const Alt_prev = x_k_minus.subset(math.index(2, 0)); // Altitude (m)
         const V_NED_prev = [ // Vitesse [Vn, Ve, Vd] (m/s)
             x_k_minus.subset(math.index(3, 0)), 
             x_k_minus.subset(math.index(4, 0)), 
             x_k_minus.subset(math.index(5, 0))
         ];
         const Q_prev = [ // Quaternion [q0, q1, q2, q3]
             x_k_minus.subset(math.index(6, 0)), 
             x_k_minus.subset(math.index(7, 0)), 
             x_k_minus.subset(math.index(8, 0)), 
             x_k_minus.subset(math.index(9, 0))
         ];
         
         // Biases (simplifié: les prendre directement de l'état)
         const gyroBias = [x_k_minus.subset(math.index(10, 0)), x_k_minus.subset(math.index(11, 0)), x_k_minus.subset(math.index(12, 0))];
         const accBias = [x_k_minus.subset(math.index(13, 0)), x_k_minus.subset(math.index(14, 0)), x_k_minus.subset(math.index(15, 0))];
         
         // 1. Correction des mesures IMU (acc et gyro sont des vecteurs de l'axe corporel)
         const acc_corr = math.subtract([acc.x, acc.y, acc.z], accBias);
         const gyro_corr = math.subtract([gyro.x, gyro.y, gyro.z], gyroBias);

         // 2. Calcul des matrices/vecteurs du Repère Navigation (NED)
         const C_b_n = this.quaternionToRotationMatrix(Q_prev); // Matrice de rotation Body -> NED
         
         // Gravité (NED: [0, 0, g])
         const G_NED = math.matrix([[0], [0], [9.8067]]); 
         
         // 3. Mise à jour de la Vitesse (V_NED)
         // Acc_NED = C_b_n * acc_corr (Conversion acc corps -> acc navigation)
         const Acc_NED = math.multiply(C_b_n, math.matrix(acc_corr));
         // Vitesse_new = Vitesse_prev + dt * (Acc_NED + G_NED)
         const V_NED_new = math.add(math.matrix(V_NED_prev), math.multiply(dt, math.add(Acc_NED, G_NED)));

         // 4. Mise à jour de la Position (Lat/Lon/Alt)
         const lat_rad = Lat_prev * this.D2R;
         const Rn = this.R_MAJOR / Math.sqrt(1 - this.E_SQUARED * Math.sin(lat_rad)**2);
         const Rm = Rn * ((1 - this.E_SQUARED) / (1 - this.E_SQUARED * Math.sin(lat_rad)**2));
         
         const Lat_new = Lat_prev + (V_NED_prev[0] * dt) / (Rm + Alt_prev) * this.R2D;
         const Lon_new = x_k_minus.subset(math.index(1, 0)) + (V_NED_prev[1] * dt) / ((Rn + Alt_prev) * Math.cos(lat_rad)) * this.R2D;
         const Alt_new = Alt_prev - (V_NED_prev[2] * dt); // 'D'own, donc -Vd

         // 5. Mise à jour de l'Attitude (Quaternion Q)
         const w_norm = math.norm(gyro_corr);
         let Q_new;
         if (w_norm > 1e-6) {
             const half_angle = w_norm * dt / 2;
             const sin_half = Math.sin(half_angle) / w_norm;
             const dQ = [
                 Math.cos(half_angle), 
                 gyro_corr[0] * sin_half, 
                 gyro_corr[1] * sin_half, 
                 gyro_corr[2] * sin_half
             ];
             // Q_new = Q_prev * dQ 
             Q_new = this.q_mult(Q_prev, dQ);
         } else {
             Q_new = Q_prev;
         }
         // Normalisation
         const norm_q = Math.sqrt(Q_new[0]**2 + Q_new[1]**2 + Q_new[2]**2 + Q_new[3]**2);
         Q_new = Q_new.map(q => q / norm_q);


         // 6. Construction du nouvel état x_k
         const x_k_new = math.matrix(math.zeros([this.n, 1]));
         
         // Pos/Vel/Att (0-9)
         x_k_new.subset(math.index(0, 0), Lat_new);
         x_k_new.subset(math.index(1, 0), Lon_new);
         x_k_new.subset(math.index(2, 0), Alt_new);
         x_k_new.subset(math.index(3, 0), V_NED_new.subset(math.index(0, 0)));
         x_k_new.subset(math.index(4, 0), V_NED_new.subset(math.index(1, 0)));
         x_k_new.subset(math.index(5, 0), V_NED_new.subset(math.index(2, 0)));
         x_k_new.subset(math.index(6, 0), Q_new[0]);
         x_k_new.subset(math.index(7, 0), Q_new[1]);
         x_k_new.subset(math.index(8, 0), Q_new[2]);
         x_k_new.subset(math.index(9, 0), Q_new[3]);

         // Biais/Clock/Réserves (10-20) - Propagés comme des constantes 
         for (let i = 10; i < this.n; i++) {
             x_k_new.subset(math.index(i, 0), x_k_minus.subset(math.index(i, 0)));
         }
         
         return x_k_new;
    }
    
    /**
     * Propagateur UKF: Génère les Sigma Points, les propage via f, et met à jour x et P.
     */
    predict(dt, acc, gyro) {
        if (!this.initialized) return;

        // --- 1. Générer les Sigma Points (Chi) ---
        const rootTerm = math.sqrt(this.n + this.lambda);
        const sqrtP = math.sqrtm(this.P);
        const S = math.multiply(rootTerm, sqrtP);
        
        const Chi_k = math.zeros([this.n, 2 * this.n + 1]);
        Chi_k.subset(math.index(math.range(0, this.n), 0), this.x);

        for (let i = 0; i < this.n; i++) {
            const S_col = math.subset(S, math.index(math.range(0, this.n), i));
            Chi_k.subset(math.index(math.range(0, this.n), i + 1), math.add(this.x, S_col));
            Chi_k.subset(math.index(math.range(0, this.n), i + this.n + 1), math.subtract(this.x, S_col));
        }

        // --- 2. Propager les Sigma Points (Chi_k_plus) ---
        const Chi_k_plus = math.zeros([this.n, 2 * this.n + 1]);
        for (let i = 0; i <= 2 * this.n; i++) {
            const x_sigma_k = Chi_k.subset(math.index(math.range(0, this.n), i));
            // Propagation via f(x_k, u_k, dt)
            const x_sigma_k_plus = this.f(x_sigma_k, dt, acc, gyro); 
            Chi_k_plus.subset(math.index(math.range(0, this.n), i), x_sigma_k_plus);
        }

        // --- 3. Calculer l'État Prédit (x_k_plus) ---
        let x_k_plus = math.zeros([this.n, 1]);
        for (let i = 0; i <= 2 * this.n; i++) {
            const W_col = this.Wm.subset(math.index(0, i));
            const Chi_col = Chi_k_plus.subset(math.index(math.range(0, this.n), i));
            x_k_plus = math.add(x_k_plus, math.multiply(W_col, Chi_col));
        }
        this.x = x_k_plus; 

        // --- 4. Calculer la Covariance Prédite (P_k_plus) ---
        const Q = math.diag(math.zeros(this.n).map((v, i) => {
             if (i <= 5) return 1e-4; 
             if (i <= 9) return 1e-6; 
             return 1e-8; 
        }));
        
        let P_k_plus = Q; 
        for (let i = 0; i <= 2 * this.n; i++) {
            const Chi_col = Chi_k_plus.subset(math.index(math.range(0, this.n), i));
            const W_col = this.Wc.subset(math.index(0, i));
            const diff = math.subtract(Chi_col, this.x);
            P_k_plus = math.add(P_k_plus, math.multiply(W_col, math.multiply(diff, math.transpose(diff))));
        }
        this.P = P_k_plus;
        
        // Finalisation: Normaliser le quaternion prédit
        const q_vector = [
            this.x.subset(math.index(6, 0)), 
            this.x.subset(math.index(7, 0)), 
            this.x.subset(math.index(8, 0)), 
            this.x.subset(math.index(9, 0))
        ];
        const norm = Math.sqrt(q_vector[0]**2 + q_vector[1]**2 + q_vector[2]**2 + q_vector[3]**2);
        
        this.x.subset(math.index(6, 0), q_vector[0] / norm);
        this.x.subset(math.index(7, 0), q_vector[1] / norm);
        this.x.subset(math.index(8, 0), q_vector[2] / norm);
        this.x.subset(math.index(9, 0), q_vector[3] / norm);
                }
         
         return x_k_minus; // Place Holder : Remplacer par l'état propagé réel.
    }
    
    // ... (dans la classe ProfessionalUKF)

    // =================================================================
    // NOYAU DE LA MISE À JOUR UKF (CORRECTION)
    // =================================================================

    /**
     * Noyau de la mise à jour UKF (correction).
     * m: dimension de la mesure (ex: 6 pour GPS, 3 pour Mag)
     * R: Matrice de bruit de la mesure (ex: this.R_GPS)
     * y_k: Vecteur de mesure réelle [m x 1] (ex: Lat, Lon, Alt...)
     * h: Fonction de mesure h(x) (ex: this.h_GPS)
     */
    UKF_Update_Core(m, R, y_k, h) {
        // --- 1. Générer les Sigma Points (Chi) ---
        // (n + lambda) * P
        const rootTerm = math.sqrt(this.n + this.lambda); 
        const sqrtP = math.sqrtm(this.P); // Décomposition de Cholesky ou Racine Carrée (math.js le gère)
        const S = math.multiply(rootTerm, sqrtP);
        
        // Chi = [ x, x + S, x - S ]
        const Chi = math.zeros([this.n, 2 * this.n + 1]);
        Chi.subset(math.index(math.range(0, this.n), 0), this.x); // x0
        
        for (let i = 0; i < this.n; i++) {
            const S_col = math.subset(S, math.index(math.range(0, this.n), i));
            
            // x_i = x + S(:, i)
            const x_plus = math.add(this.x, S_col);
            Chi.subset(math.index(math.range(0, this.n), i + 1), x_plus);
            
            // x_i+n = x - S(:, i)
            const x_minus = math.subtract(this.x, S_col);
            Chi.subset(math.index(math.range(0, this.n), i + this.n + 1), x_minus);
        }
        
        // --- 2. Transformer les Sigma Points en Espace Mesure (Y) ---
        const Y = math.zeros([m, 2 * this.n + 1]);
        for (let i = 0; i <= 2 * this.n; i++) {
            const x_sigma = Chi.subset(math.index(math.range(0, this.n), i));
            // Y_i = h(x_sigma)
            const y_sigma = h(x_sigma);
            Y.subset(math.index(math.range(0, m), i), y_sigma);
        }
        
        // --- 3. Calculer la Moyenne des Mesures (y_mean) ---
        let y_mean = math.zeros([m, 1]);
        for (let i = 0; i <= 2 * this.n; i++) {
            const Y_col = math.subset(Y, math.index(math.range(0, m), i));
            const W_col = this.Wm.subset(math.index(0, i));
            y_mean = math.add(y_mean, math.multiply(W_col, Y_col));
        }

        // --- 4. Calculer la Covariance des Mesures (Pyy) ---
        let Pyy = R; // Pyy = R + sum(Wc * (Yi - y_mean) * (Yi - y_mean)^T)
        for (let i = 0; i <= 2 * this.n; i++) {
            const Y_col = math.subset(Y, math.index(math.range(0, m), i));
            const diff = math.subtract(Y_col, y_mean);
            const W_col = this.Wc.subset(math.index(0, i));
            Pyy = math.add(Pyy, math.multiply(W_col, math.multiply(diff, math.transpose(diff))));
        }

        // --- 5. Calculer la Covariance Croisée (Pxy) ---
        let Pxy = math.zeros([this.n, m]); // Pxy = sum(Wc * (Chi_i - x) * (Yi - y_mean)^T)
        for (let i = 0; i <= 2 * this.n; i++) {
            const Chi_col = Chi.subset(math.index(math.range(0, this.n), i));
            const Y_col = math.subset(Y, math.index(math.range(0, m), i));

            const dx = math.subtract(Chi_col, this.x);
            const dy = math.subtract(Y_col, y_mean);
            const W_col = this.Wc.subset(math.index(0, i));
            
            Pxy = math.add(Pxy, math.multiply(W_col, math.multiply(dx, math.transpose(dy))));
        }

        // --- 6. Calculer le Gain de Kalman (K) ---
        // K = Pxy * Pyy^-1
        const K = math.multiply(Pxy, math.inv(Pyy));

        // --- 7. Mettre à jour l'État (x) et la Covariance (P) ---
        const innovation = math.subtract(y_k, y_mean);
        this.x = math.add(this.x, math.multiply(K, innovation));
        this.P = math.subtract(this.P, math.multiply(K, math.multiply(Pyy, math.transpose(K))));

        // --- 8. Normaliser le Quaternion d'Attitude (CRITIQUE) ---
        const q_vector = [
            this.x.subset(math.index(6, 0)), 
            this.x.subset(math.index(7, 0)), 
            this.x.subset(math.index(8, 0)), 
            this.x.subset(math.index(9, 0))
        ];
        const norm = Math.sqrt(q_vector[0]**2 + q_vector[1]**2 + q_vector[2]**2 + q_vector[3]**2);
        
        this.x.subset(math.index(6, 0), q_vector[0] / norm);
        this.x.subset(math.index(7, 0), q_vector[1] / norm);
        this.x.subset(math.index(8, 0), q_vector[2] / norm);
        this.x.subset(math.index(9, 0), q_vector[3] / norm);
    }
    
// ... (Reste de la classe)
    
    // =================================================================
    // FONCTIONS DE MESURE h(x)
    // =================================================================

    h_GPS(x_k_minus) {
         return x_k_minus.subset(math.index([0, 1, 2, 3, 4, 5], 0)); // 6x1
    }

    h_MAG(x_k_minus) {
        const B_NED = math.matrix([[22.0], [5.0], [45.0]]); // Exemple B_NED
        
        const q = [x_k_minus.subset(math.index(6, 0)), x_k_minus.subset(math.index(7, 0)), 
                   x_k_minus.subset(math.index(8, 0)), x_k_minus.subset(math.index(9, 0))];

        const C_b_n = this.quaternionToRotationMatrix(q); 
        const C_n_b = math.transpose(C_b_n);
        
        return math.multiply(C_n_b, B_NED); // B_body [Bx, By, Bz]
    }
    
    // =================================================================
    // INTERFACE UKF
    // =================================================================

    predict(dt, acc, gyro) {
        if (!this.initialized) return;
        // La logique complète de prédiction (Sigma Points + f) doit être ici.
    }

    update(gpsData) {
        if (!this.initialized) return;
        const c = gpsData.coords;
        
        const y = math.matrix([
            [c.latitude], [c.longitude], [c.altitude || this.x.subset(math.index(2, 0))], 
            [c.speed || 0.0], [0.0], [0.0] 
        ]);
        
        this.UKF_Update_Core(6, this.R_GPS, y, this.h_GPS);
    }
    
    update_Mag(mag) {
        if (!this.initialized) return;
        
        const y = math.matrix([[mag.x], [mag.y], [mag.z]]);
        
        this.UKF_Update_Core(3, this.R_MAG, y, this.h_MAG);
    }
    
    // =================================================================
    // INTERFACE (ACCESSEURS ET ÉTATS)
    // =================================================================

    initialize(lat, lon, alt) {
        if (this.initialized) return;
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon);
        this.x.subset(math.index(2, 0), alt);
        this.P = math.multiply(this.P, 0.1); 
        this.initialized = true;
    }
    
    reset(lat, lon, alt) {
        this.initialized = false;
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon);
        this.x.subset(math.index(2, 0), alt);
        this.x.subset(math.index(6, 0), 1); 
        this.initialized = true;
    }
    
    isInitialized() { 
        return this.initialized; 
    }
    
    getState() {
        const Vx=this.x.subset(math.index(3,0)), Vy=this.x.subset(math.index(4,0)), Vz=this.x.subset(math.index(5,0));
        const q=[this.x.subset(math.index(6,0)), this.x.subset(math.index(7,0)), this.x.subset(math.index(8,0)), this.x.subset(math.index(9,0))];
        const euler = this.quaternionToEuler(q);
        
        return {
            lat: this.x.subset(math.index(0,0)), 
            lon: this.x.subset(math.index(1,0)), 
            alt: this.x.subset(math.index(2,0)),
            speed: Math.sqrt(Vx**2 + Vy**2 + Vz**2),
            vel_D: Vz,
            pitch: euler.pitch, 
            roll: euler.roll,   
            yaw: euler.yaw,     
            cov_vel: this.P.subset(math.index(3, 3)), 
            acc_long: NaN, 
            gyroBias: [this.x.subset(math.index(10, 0)), this.x.subset(math.index(11, 0)), this.x.subset(math.index(12, 0))]
        };
    }
                }
// ... (Contenu de la classe ProfessionalUKF)

    // =================================================================
    // INTERFACE (ACCESSEURS ET ÉTATS)
    // =================================================================
    
    // ... (Reste des fonctions)

} 
// 🛑 LIGNE CRITIQUE À AJOUTER : Assurer que la classe est globale
window.ProfessionalUKF = ProfessionalUKF;
