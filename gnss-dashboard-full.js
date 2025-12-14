// =================================================================
// FICHIER COMPLET 1/2 : PROFESSIONAL UNSCENTED KALMAN FILTER (UKF) - 21 ÉTATS (V38-PRO)
// INS (Inertial Navigation System) - Version Quaternion
// DÉPENDANCE CRITIQUE: math.js
// =================================================================

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("UKF Error: math.js is required.");
        
        this.initialized = false;
        
        // VECTEUR D'ÉTAT (21)
        // [0-2: Pos(Lat, Lon, Alt)], [3-5: Vel(North, East, Down)], [6-9: Att(Quaternion)], 
        // [10-12: GyroBias(3)], [13-15: AccBias(3)], [16-17: Clock(2)], [18-20: Réserves(3)]
        this.n = 21; 
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // 1. Initialisation Position & Quaternion
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon); 
        this.x.subset(math.index(2, 0), alt); 
        this.x.subset(math.index(6, 0), 1); // Quaternion: [1, 0, 0, 0]

        // --- PARAMÈTRES UKF ---
        this.alpha = 1e-3; this.beta = 2; this.kappa = 0;
        this.lambda = (this.alpha**2) * (this.n + this.kappa) - this.n;
        
        // Poids (Wm, Wc)
        const lambda_plus_n = this.n + this.lambda;
        this.Wm = math.zeros([1, 2 * this.n + 1]);
        this.Wc = math.zeros([1, 2 * this.n + 1]);
        this.Wm.subset(math.index(0, 0), this.lambda / lambda_plus_n);
        this.Wc.subset(math.index(0, 0), this.lambda / lambda_plus_n + (1 - this.alpha**2 + this.beta));
        const weight = 1 / (2 * lambda_plus_n);
        for (let i = 1; i <= 2 * this.n; i++) {
            this.Wm.subset(math.index(0, i), weight);
            this.Wc.subset(math.index(0, i), weight);
        }

        // Covariance P (Incertitude Initiale - Diagonale robuste)
        this.P = math.diag([
            100, 100, 100, // Pos [m²]
            1, 1, 1,       // Vel [m²/s²]
            1e-1, 1e-1, 1e-1, 1e-1, // Att (Quaternion)
            1e-3, 1e-3, 1e-3, // Gyro Bias [rad²/s²]
            1e-2, 1e-2, 1e-2, // Acc Bias [m²/s⁴]
            1, 1, 1, 1, 1 // Reste
        ]);

        // Covariance Q (Bruit de Processus)
        this.Q = math.diag([
            0, 0, 0,      
            1e-4, 1e-4, 1e-4, 
            1e-5, 1e-5, 1e-5, 1e-5, 
            1e-7, 1e-7, 1e-7, 
            1e-6, 1e-6, 1e-6, 
            0, 0, 0, 0, 0 
        ]);
        
        // Constantes WGS84
        this.G_E = 9.780327; this.R_MAJOR = 6378137.0; this.FLATTENING = 1/298.257223563;
        this.E_SQUARED = (2 * this.FLATTENING) - (this.FLATTENING**2);
        this.D2R = Math.PI / 180; this.R2D = 180 / Math.PI;
    }

    // --- UTILS MATHÉMATIQUES & WGS84 ---
    getWGS84Parameters(latRad, alt) {
        const sinLat = Math.sin(latRad);
        const N = this.R_MAJOR / Math.sqrt(1 - this.E_SQUARED * sinLat**2);
        const M = N * (1 - this.E_SQUARED) / (1 - this.E_SQUARED * sinLat**2);
        const g_0 = this.G_E * (1 + 0.0053024 * sinLat**2);
        const g = g_0 - 3.086e-6 * alt;
        return { N, M, g };
    }
    quaternionToRotationMatrix(q) {
        const w=q[0], x=q[1], y=q[2], z=q[3];
        return math.matrix([
            [1 - 2*y*y - 2*z*z, 2*x*y - 2*w*z, 2*x*z + 2*w*y],
            [2*x*y + 2*w*z, 1 - 2*x*x - 2*z*z, 2*y*z - 2*w*x],
            [2*x*z - 2*w*y, 2*y*z + 2*w*x, 1 - 2*x*x - 2*y*y]
        ]);
    }
    quaternionToEuler(q) {
        const w=q[0], x=q[1], y=q[2], z=q[3];
        const roll = Math.atan2(2*(w*x + y*z), 1 - 2*(x*x + y*y));
        const pitch = Math.asin(2*(w*y - z*x));
        const yaw = Math.atan2(2*(w*z + x*y), 1 - 2*(y*y + z*z));
        return {roll, pitch, yaw}; // En Radians
    }
    normalizeQuaternion(x) {
        const q_vec = math.subset(x, math.index([6, 7, 8, 9], 0));
        const norm = math.norm(q_vec);
        if (norm > 0) {
            const normalized_q = math.divide(q_vec, norm);
            math.subset(x, math.index([6, 7, 8, 9], 0), normalized_q);
        } else {
             math.subset(x, math.index([6, 7, 8, 9], 0), [1, 0, 0, 0]);
        }
    }
    _quaternionProduct(q1, q2) {
        const w1=q1[0], x1=q1[1], y1=q1[2], z1=q1[3];
        const w2=q2[0], x2=q2[1], y2=q2[2], z2=q2[3];
        return [
            w1*w2 - x1*x2 - y1*y2 - z1*z2,
            w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2
        ];
    }
    
    // --- FONCTION DE TRANSITION D'ÉTAT (Le cœur INS) ---
    stateTransitionFunction(x_sigma, dt, rawAccels, rawGyros) {
        const x_new = math.clone(x_sigma);

        // 1. EXTRACTION
        const lat = x_sigma.subset(math.index(0, 0)) * this.D2R;
        const alt = x_sigma.subset(math.index(2, 0));
        const V_E = math.subset(x_sigma, math.index([3, 4, 5], 0)); // Vitesse NED (North, East, Down)
        const q_state = math.subset(x_sigma, math.index([6, 7, 8, 9], 0)).toArray();
        const gyroBias = math.subset(x_sigma, math.index([10, 11, 12], 0));
        const accBias = math.subset(x_sigma, math.index([13, 14, 15], 0));

        const { N, M, g } = this.getWGS84Parameters(lat, alt);
        const R_N = N + alt; 
        const R_M = M + alt; 

        // 2. CORRECTION DES MESURES BRUTES
        const acc_meas = math.matrix([[rawAccels[0]], [rawAccels[1]], [rawAccels[2]]]);
        const gyro_meas = math.matrix([[rawGyros[0]], [rawGyros[1]], [rawGyros[2]]]);
        
        const acc_corr = math.subtract(acc_meas, accBias); // a_body = acc_meas - b_acc
        const gyro_corr = math.subtract(gyro_meas, gyroBias); // w_body = gyro_meas - b_gyro

        // 3. PROPAGATION DE L'ATTITUDE (QUATERNION)
        const half_dt = dt / 2.0;
        const omega_norm = math.norm(gyro_corr);
        
        let delta_q;
        if (omega_norm > 1e-6) {
             const angle = omega_norm * half_dt;
             const sin_angle_over_norm = Math.sin(angle) / omega_norm;
             const gyro_normalized = math.divide(gyro_corr, omega_norm);
             delta_q = [
                 Math.cos(angle),
                 gyro_normalized.subset(math.index(0, 0)) * sin_angle_over_norm,
                 gyro_normalized.subset(math.index(1, 0)) * sin_angle_over_norm,
                 gyro_normalized.subset(math.index(2, 0)) * sin_angle_over_norm
             ];
        } else {
             delta_q = [1.0, half_dt * gyro_corr.subset(math.index(0, 0)), half_dt * gyro_corr.subset(math.index(1, 0)), half_dt * gyro_corr.subset(math.index(2, 0))];
        }

        const q_new_array = this._quaternionProduct(q_state, delta_q);
        const q_new = math.matrix([[q_new_array[0]], [q_new_array[1]], [q_new_array[2]], [q_new_array[3]]]);
        
        x_new.subset(math.index([6, 7, 8, 9], 0), q_new);
        this.normalizeQuaternion(x_new); 

        // 4. PROPAGATION DE LA VITESSE (VELOCITÉ)
        const R_matrix = this.quaternionToRotationMatrix(q_new_array); 
        const gravity_local = math.matrix([[0], [0], [g]]); 
        const f_NED = math.subtract(math.multiply(R_matrix, acc_corr), gravity_local);
        
        const V_new = math.add(V_E, math.multiply(f_NED, dt)); 
        x_new.subset(math.index([3, 4, 5], 0), V_new);

        // 5. PROPAGATION DE LA POSITION
        const V_avg = math.divide(math.add(V_E, V_new), 2);
        const V_N = V_avg.subset(math.index(0, 0));
        const V_E_vel = V_avg.subset(math.index(1, 0));
        const V_D = V_avg.subset(math.index(2, 0));

        const dLat = (V_N / R_M) * this.R2D * dt;
        const dLon = (V_E_vel / (R_N * Math.cos(lat))) * this.R2D * dt;
        const dAlt = -V_D * dt; 
        
        x_new.subset(math.index(0, 0), x_sigma.subset(math.index(0, 0)) + dLat);
        x_new.subset(math.index(1, 0), x_sigma.subset(math.index(1, 0)) + dLon);
        x_new.subset(math.index(2, 0), alt + dAlt);

        // 6. PROPAGATION DES BIAS (Constant pour la transition)

        return x_new;
    }
    
    // --- FONCTIONS CORE UKF (Estimation et Correction) ---
    
    generateSigmaPoints(x, P) {
         const X = [x];
         const c = Math.sqrt(this.n + this.lambda);
         
         let S;
         try {
             S = math.multiply(c, math.cholesky(P)); // Racine carrée matricielle
         } catch (e) {
             // Fallback robuste
             const diagP = math.diag(P);
             const diagS = math.map(diagP, val => (val > 0) ? Math.sqrt(val * (this.n + this.lambda)) : 0);
             S = math.diag(diagS);
         }
         
         for(let i=0; i<this.n; i++) {
             const S_col_i = math.column(S, i);
             X.push(math.add(x, S_col_i));
             X.push(math.subtract(x, S_col_i));
         }
         return X;
    }

    predict(dt, rawAccels, rawGyros) {
        if (!this.initialized) return;

        // 1. Génération des Sigma Points
        let X = this.generateSigmaPoints(this.x, math.add(this.P, math.multiply(this.Q, dt)));
        let X_prime = []; // Sigma points propagés
        
        // 2. Propagation de chaque Sigma Point (INS)
        for (let i = 0; i < X.length; i++) {
            X_prime.push(this.stateTransitionFunction(X[i], dt, rawAccels, rawGyros));
        }

        // 3. Récupération de la moyenne (Nouvel état x)
        let x_new = math.zeros([this.n, 1]);
        for (let i = 0; i < X_prime.length; i++) {
            x_new = math.add(x_new, math.multiply(this.Wm.subset(math.index(0, i)), X_prime[i]));
        }
        
        this.normalizeQuaternion(x_new);
        this.x = x_new;
        
        // 4. Calcul de la nouvelle covariance P
        let P_new = math.zeros([this.n, this.n]);
        for (let i = 0; i < X_prime.length; i++) {
            const diff = math.subtract(X_prime[i], this.x);
            P_new = math.add(P_new, math.multiply(this.Wc.subset(math.index(0, i)), math.multiply(diff, math.transpose(diff))));
        }
        this.P = P_new;
    }
    
    // --- FONCTION D'OBSERVATION (GPS) ---
    h_GPS(x) {
        // y = [Lat(0), Lon(1), Alt(2), Speed_Mag]
        const V_N = x.subset(math.index(3, 0));
        const V_E = x.subset(math.index(4, 0));
        const V_D = x.subset(math.index(5, 0));
        const speed_mag = Math.sqrt(V_N**2 + V_E**2 + V_D**2);
        
        return math.matrix([[x.subset(math.index(0, 0))], [x.subset(math.index(1, 0))], [x.subset(math.index(2, 0))], [speed_mag]]);
    }
    
    UKF_Update_Core(m, R, y_meas, h_function) {
        const X = this.generateSigmaPoints(this.x, this.P);
        let Y = [];
        for (let i = 0; i < X.length; i++) {
            Y.push(h_function(X[i]));
        }

        let y_hat = math.zeros([m, 1]);
        for (let i = 0; i < Y.length; i++) {
            y_hat = math.add(y_hat, math.multiply(this.Wm.subset(math.index(0, i)), Y[i]));
        }

        let P_yy = math.clone(R); 
        let P_xy = math.zeros([this.n, m]); 
        
        for (let i = 0; i < X.length; i++) {
            const y_diff = math.subtract(Y[i], y_hat);
            const x_diff = math.subtract(X[i], this.x);
            
            P_yy = math.add(P_yy, math.multiply(this.Wc.subset(math.index(0, i)), math.multiply(y_diff, math.transpose(y_diff))));
            P_xy = math.add(P_xy, math.multiply(this.Wc.subset(math.index(0, i)), math.multiply(x_diff, math.transpose(y_diff))));
        }

        const K = math.multiply(P_xy, math.inv(P_yy)); // Gain de Kalman
        const y_diff_meas = math.subtract(y_meas, y_hat);
        this.x = math.add(this.x, math.multiply(K, y_diff_meas));
        this.P = math.subtract(this.P, math.multiply(K, math.multiply(P_yy, math.transpose(K))));
        
        this.normalizeQuaternion(this.x);
    }

    update(pos) { 
        if (!this.initialized) return;
        const acc = pos.coords.accuracy || 10;
        const altAcc = pos.coords.altitudeAccuracy || acc * 1.5;
        const R_dyn = math.diag([acc**2, acc**2, altAcc**2, 1.0]); 
        const y = math.matrix([[pos.coords.latitude], [pos.coords.longitude], [pos.coords.altitude||0], [pos.coords.speed||0]]);
        
        try {
             this.UKF_Update_Core(4, R_dyn, y, this.h_GPS);
        } catch(e) {
            console.error("🔴 Échec de la mise à jour UKF. Matrice P_yy singulière?", e);
        }
    }
    
    // --- INTERFACE ---
    initialize(lat, lon, alt) {
        this.x.subset(math.index(0,0), lat);
        this.x.subset(math.index(1,0), lon);
        this.x.subset(math.index(2,0), alt);
        this.P = math.multiply(this.P, 0.1); 
        this.initialized = true;
    }
    reset(lat, lon, alt) { 
        this.initialized = false;
        this.initialize(lat, lon, alt);
    }
    isInitialized() { return this.initialized; }
    
    getState() {
        const Vx=this.x.subset(math.index(3,0)), Vy=this.x.subset(math.index(4,0)), Vz=this.x.subset(math.index(5,0));
        const q_state = math.subset(this.x, math.index([6, 7, 8, 9], 0)).toArray();
        const euler = this.quaternionToEuler(q_state);
        
        return {
            lat: this.x.subset(math.index(0,0)), lon: this.x.subset(math.index(1,0)), alt: this.x.subset(math.index(2,0)),
            speed: Math.sqrt(Vx**2 + Vy**2 + Vz**2), // Vitesse 3D
            vel_N: Vx, vel_E: Vy, vel_D: Vz,
            pitch: euler.pitch, // En radians
            roll: euler.roll,   // En radians
            yaw: euler.yaw,     // En radians
            cov_vel: this.P.subset(math.index(3,3)) 
        };
    }
}
window.ProfessionalUKF = ProfessionalUKF;
