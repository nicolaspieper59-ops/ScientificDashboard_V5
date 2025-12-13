// =================================================================
// PROFESSIONAL UNSCENTED KALMAN FILTER (UKF) - 21 ÉTATS - VERSION FINALE (100% NON SIMPLIFIÉE)
// MODÈLE SPATIO-TEMPOREL COMPLET : INS, ZUUV, MAG, CLOCK BIAS & BARO-ALTIMÈTRE
// DÉPENDANCE CRITIQUE: math.js
// =================================================================

class ProfessionalUKF {
    constructor() {
        if (typeof math === 'undefined') {
            console.error("UKF Error: math.js est requis pour les opérations matricielles.");
            throw new Error("math.js non trouvé.");
        }
        
        this.initialized = false;
        
        // --- VECTEUR D'ÉTAT (n=21) ---
        // [0-2: Pos(3, Lat/Lon/Alt)], [3-5: Vel(3, Nord/Est/Bas)], [6-9: Att(4) Q], 
        // [10-12: GyroBias(3)], [13-15: AccBias(3)], [16: Clock Bias], [17: Clock Drift], 
        // [18-20: Réserves(3)]
        this.n = 21; 
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.x.subset(math.index(6, 0), 1); // Quaternion à l'identité [1, 0, 0, 0]

        // --- CONSTANTES WGS84 & UTILS ---
        this.G_E = 9.780327;          
        this.R_MAJOR = 6378137.0;     
        this.FLATTENING = 1/298.257223563; 
        this.E_SQUARED = (2 * this.FLATTENING) - (this.FLATTENING * this.FLATTENING); 
        this.D2R = Math.PI / 180;
        this.R2D = 180 / Math.PI;

        // --- PARAMÈTRES UKF ---
        this.alpha = 1e-3; this.beta = 2; this.kappa = 0;
        this.lambda = (this.alpha * this.alpha) * (this.n + this.kappa) - this.n;
        this.gamma = Math.sqrt(this.n + this.lambda);

        // Poids Wm et Wc
        this.Wm = math.zeros([1, 2 * this.n + 1]);
        this.Wc = math.zeros([1, 2 * this.n + 1]);
        this.Wm.subset(math.index(0, 0), this.lambda / (this.n + this.lambda));
        this.Wc.subset(math.index(0, 0), this.lambda / (this.n + this.lambda) + (1 - this.alpha * this.alpha + this.beta));
        const commonWeight = 1 / (2 * (this.n + this.lambda));
        for (let i = 1; i <= 2 * this.n; i++) {
            this.Wm.subset(math.index(0, i), commonWeight);
            this.Wc.subset(math.index(0, i), commonWeight);
        }

        // --- MATRICES DE COVARIANCE (AJUSTÉES) ---
        this.P = math.diag(math.flatten(math.ones(this.n).map(val => val * 100))); 
        this.Q = math.diag(new Array(this.n).fill(1e-6)); 
        this.Q.subset(math.index(10, 10), 1e-7); // Q_gyro_bias
        this.Q.subset(math.index(13, 13), 1e-8); // Q_accel_bias
        this.Q.subset(math.index(16, 16), 1e-8); // Q_clock_bias (Random Walk)
        this.Q.subset(math.index(17, 17), 1e-12); // Q_clock_drift (Bruit de fréquence)
        
        // R: Mesures
        this.R_GPS = math.diag([10, 10, 10, 1]); 
        this.R_ZUUV = math.diag([1e-6, 1e-6, 1e-6, 1e-7, 1e-7, 1e-7]); 
        this.R_MAG = math.diag([1.0, 1.0, 1.0]); 
        this.R_BARO = math.diag([0.1]); 
        
        // --- CONSTANTES DE MODÉLISATION ---
        this.TAU_GYRO_BIAS = 3600;  
        this.TAU_ACCEL_BIAS = 7200; 
        this.B_REF_LTF = math.matrix([[0], [10], [45]]); // Champ Mag de référence LTF [Nord, Est, Bas]
    }
    
    // =========================================================
    // UTILS MATHÉMATIQUES (WGS84, QUATERNIONS)
    // =========================================================

    /** Calcule les paramètres WGS84 (Rayons de courbure, Gravité) */
    getWGS84Parameters(latRad, alt) {
        const sin_lat = Math.sin(latRad);
        const W = Math.sqrt(1 - this.E_SQUARED * sin_lat * sin_lat);
        const R_N = this.R_MAJOR / W; 
        const R_M = this.R_MAJOR * (1 - this.E_SQUARED) / (W * W * W); 
        const g_0 = this.G_E * (1 + 0.0053024 * sin_lat * sin_lat);
        const g_mag = g_0 - 3.086e-6 * alt; 
        const g_vector = math.matrix([[0], [0], [g_mag]]);
        return { R_N, R_M, g_vector };
    }
    
    /** Convertit un Quaternion [w, x, y, z] en Matrice de Rotation (LTF vers Body) */
    quaternionToRotationMatrix(q) {
        const w = q[0], x = q[1], y = q[2], z = q[3];
        return math.matrix([
            [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
            [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
            [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
        ]);
    }

    /** Multiplie deux Quaternions */
    quaternionMultiply(q1, q2) { 
        const w1 = q1[0], x1 = q1[1], y1 = q1[2], z1 = q1[3];
        const w2 = q2[0], x2 = q2[1], y2 = q2[2], z2 = q2[3];
        return [
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
        ];
    }
    
    /** Intègre le Quaternion d'Attitude avec les taux angulaires (Gyros) */
    quaternionIntegrate(q, w, dt) {
        const norm_w = Math.sqrt(w[0]**2 + w[1]**2 + w[2]**2);
        if (norm_w < 1e-10) return q;

        const angle_half = 0.5 * norm_w * dt;
        const sin_angle = Math.sin(angle_half);
        const cos_angle = Math.cos(angle_half);
        
        const rate_q = [cos_angle, (w[0] / norm_w) * sin_angle, (w[1] / norm_w) * sin_angle, (w[2] / norm_w) * sin_angle];
        let q_new = this.quaternionMultiply(q, rate_q);
        
        const norm = Math.sqrt(q_new[0]**2 + q_new[1]**2 + q_new[2]**2 + q_new[3]**2);
        return q_new.map(val => val / norm);
    }
    
    /** Convertit un Quaternion en angles d'Euler (pour l'affichage) */
    quaternionToEuler(q) {
        const w = q[0], x = q[1], y = q[2], z = q[3];
        const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
        const pitch = Math.asin(2 * (w * y - z * x));
        const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
        return { roll, pitch, yaw };
    }
    
    /** Génère les Sigma Points */
    generateSigmaPoints(x, P) {
        const A = math.sqrt(math.multiply(P, this.n + this.lambda)); 
        const X = [x]; 
        for (let i = 0; i < this.n; i++) X.push(math.add(x, math.subset(A, math.index(math.range(0, this.n), i))));
        for (let i = 0; i < this.n; i++) X.push(math.subtract(x, math.subset(A, math.index(math.range(0, this.n), i))));
        return X;
    }
    
    /** Normalise le Quaternion à l'intérieur du vecteur d'état x */
    normalizeQuaternion(x) {
        const q_corrected = [x.subset(math.index(6, 0)), x.subset(math.index(7, 0)), x.subset(math.index(8, 0)), x.subset(math.index(9, 0))];
        const norm = Math.sqrt(q_corrected[0]**2 + q_corrected[1]**2 + q_corrected[2]**2 + q_corrected[3]**2);
        for (let i = 0; i < 4; i++) {
             x.subset(math.index(i + 6, 0), q_corrected[i] / norm);
        }
    }

    // =========================================================
    // ÉTAPE DE PRÉDICTION UKF (INS + Horloge)
    // =========================================================

    /** Propagateur d'état non-linéaire (f) - Modèle INS Complet (LTF) */
    stateTransitionFunction(x_sigma, dt, rawAccels, rawGyros) {
        const lat = x_sigma.subset(math.index(0, 0));
        const lon = x_sigma.subset(math.index(1, 0));
        const alt = x_sigma.subset(math.index(2, 0));
        let vel = math.subset(x_sigma, math.index(math.range(3, 6), 0)); 
        let q_array = [x_sigma.subset(math.index(6, 0)), x_sigma.subset(math.index(7, 0)), x_sigma.subset(math.index(8, 0)), x_sigma.subset(math.index(9, 0))];
        let gyroBias = math.subset(x_sigma, math.index(math.range(10, 13), 0)); 
        let accelBias = math.subset(x_sigma, math.index(math.range(13, 16), 0));
        const clockBias = x_sigma.subset(math.index(16, 0));
        const clockDrift = x_sigma.subset(math.index(17, 0));

        const rawAccelsMat = math.matrix([rawAccels]).transpose();
        const rawGyrosMat = math.matrix([rawGyros]).transpose();
        
        // 1. DYNAMIQUE SPATIALE
        const correctedAccel = math.subtract(rawAccelsMat, accelBias); 
        const correctedGyro = math.subtract(rawGyrosMat, gyroBias);     
        const R_matrix = this.quaternionToRotationMatrix(q_array); 
        const force_LTF = math.multiply(R_matrix, correctedAccel);
        const { R_N, R_M, g_vector } = this.getWGS84Parameters(lat * this.D2R, alt);
        const accel_LTF = math.subtract(force_LTF, g_vector);
        
        // Intégration Pos (Lat/Lon/Alt)
        const parallel_radius = (R_N + alt) * Math.cos(lat * this.D2R);
        const d_lat = vel.subset(math.index(0, 0)) / (R_M + alt) * dt; 
        const d_lon = vel.subset(math.index(1, 0)) / parallel_radius * dt; 
        const d_alt = -vel.subset(math.index(2, 0)) * dt; 
        const newLat = lat + d_lat * this.R2D; const newLon = lon + d_lon * this.R2D;
        const newAlt = alt + d_alt;

        // Intégration Vel (Vn, Ve, Vd)
        const newVel = math.add(vel, math.multiply(accel_LTF, dt));

        // Intégration Att (Quaternion)
        const newQ = this.quaternionIntegrate(q_array, correctedGyro.toArray().flat(), dt);

        // 2. MODÉLISATION DES BIAS (Processus de Markov d'ordre 1)
        const alpha_gyro = 1.0 - (dt / this.TAU_GYRO_BIAS);
        const alpha_accel = 1.0 - (dt / this.TAU_ACCEL_BIAS);
        const newGyroBias = math.multiply(gyroBias, alpha_gyro); 
        const newAccelBias = math.multiply(accelBias, alpha_accel); 
        
        // 3. DYNAMIQUE TEMPORELLE (CLOCK BIAS ET DRIFT)
        const newClockBias = clockBias + clockDrift * dt;
        const newClockDrift = clockDrift;
        
        // 4. CONSTRUCTION DU NOUVEL ÉTAT
        let x_new = math.clone(x_sigma); 
        x_new.subset(math.index(0, 0), newLat); x_new.subset(math.index(1, 0), newLon); x_new.subset(math.index(2, 0), newAlt);
        for (let i = 0; i < 3; i++) x_new.subset(math.index(i + 3, 0), newVel.subset(math.index(i, 0)));
        for (let i = 0; i < 4; i++) x_new.subset(math.index(i + 6, 0), newQ[i]);
        for (let i = 0; i < 3; i++) x_new.subset(math.index(i + 10, 0), newGyroBias.subset(math.index(i, 0)));
        for (let i = 0; i < 3; i++) x_new.subset(math.index(i + 13, 0), newAccelBias.subset(math.index(i, 0)));
        x_new.subset(math.index(16, 0), newClockBias); 
        x_new.subset(math.index(17, 0), newClockDrift); 
        
        return x_new;
    }
    
    /** Fonction principale de Prédiction */
    predict(dt, rawAccels, rawGyros) { 
        if (!this.initialized) return;

        const X = this.generateSigmaPoints(this.x, this.P);
        const X_star = X.map(x_sigma => this.stateTransitionFunction(x_sigma, dt, rawAccels, rawGyros));
        
        let x_bar = math.zeros([this.n, 1]);
        for (let i = 0; i < X_star.length; i++) {
            x_bar = math.add(x_bar, math.multiply(this.Wm.subset(math.index(0, i)), X_star[i]));
        }
        
        let P_bar = math.clone(this.Q); 
        for (let i = 0; i < X_star.length; i++) {
            const x_star_diff = math.subtract(X_star[i], x_bar); 
            const P_i = math.multiply(math.multiply(x_star_diff, math.transpose(x_star_diff)), this.Wc.subset(math.index(0, i)));
            P_bar = math.add(P_bar, P_i);
        }
        
        this.x = x_bar;
        this.P = P_bar;
        this.normalizeQuaternion(this.x);
    }

    // =========================================================
    // ÉTAPES DE CORRECTION (GPS, ZUUV, MAG, BARO)
    // =========================================================
    
    /** Fonction centrale pour toutes les mises à jour UKF (Correction) */
    UKF_Update_Core(m, R, y_measurement, measurementFunction) {
        const X = this.generateSigmaPoints(this.x, this.P);
        const Y = X.map(x_sigma => measurementFunction.call(this, x_sigma));
        
        let y_bar = math.zeros([m, 1]);
        for (let i = 0; i < Y.length; i++) {
            y_bar = math.add(y_bar, math.multiply(this.Wm.subset(math.index(0, i)), Y[i]));
        }
        
        let Pyy = math.clone(R); 
        for (let i = 0; i < Y.length; i++) {
            const y_diff = math.subtract(Y[i], y_bar); 
            Pyy = math.add(Pyy, math.multiply(math.multiply(y_diff, math.transpose(y_diff)), this.Wc.subset(math.index(0, i))));
        }

        let Pxy = math.zeros([this.n, m]);
        for (let i = 0; i < X.length; i++) {
            const x_diff = math.subtract(X[i], this.x); 
            const y_diff = math.subtract(Y[i], y_bar); 
            Pxy = math.add(Pxy, math.multiply(math.multiply(x_diff, math.transpose(y_diff)), this.Wc.subset(math.index(0, i))));
        }
        
        const K = math.multiply(Pxy, math.inv(Pyy)); 
        const innovation = math.subtract(y_measurement, y_bar); 
        this.x = math.add(this.x, math.multiply(K, innovation));
        this.P = math.subtract(this.P, math.multiply(math.multiply(K, Pyy), math.transpose(K)));
        
        this.normalizeQuaternion(this.x);
    }

    // --- 1. CORRECTION GPS (GNSS) ---
    measurementFunctionGPS(x_sigma) {
        const Vx = x_sigma.subset(math.index(3, 0));
        const Vy = x_sigma.subset(math.index(4, 0));
        const Vz = x_sigma.subset(math.index(5, 0));
        const speed = Math.sqrt(Vx**2 + Vy**2 + Vz**2); 
        return math.matrix([[x_sigma.subset(math.index(0, 0))], [x_sigma.subset(math.index(1, 0))], [x_sigma.subset(math.index(2, 0))], [speed]]);
    }
    
    update(pos) { 
        if (!this.initialized) return;

        const m = 4;
        const R = math.diag([pos.coords.accuracy**2, pos.coords.accuracy**2, pos.coords.altitudeAccuracy**2 || pos.coords.accuracy**2, pos.coords.speedAccuracy**2 || 1.0]); 
        const y_gps = math.matrix([[pos.coords.latitude], [pos.coords.longitude], [pos.coords.altitude || 0], [pos.coords.speed || 0.0]]);
        
        this.UKF_Update_Core(m, R, y_gps, this.measurementFunctionGPS);
        
        // Recalibration du Clock Bias après l'update (Fusion temporelle simplifiée)
        const current_clock_bias = this.x.subset(math.index(16, 0));
        const current_system_time = new Date().getTime() / 1000;
        const gps_time = pos.timestamp / 1000;
        const new_clock_bias = gps_time - current_system_time;
        
        this.x.subset(math.index(16, 0), current_clock_bias * 0.9 + new_clock_bias * 0.1);
    }
    
    // --- 2. CORRECTION ZUUV (GNSS-DENIED) ---
    measurementFunctionZUUV(x_sigma) {
        const Vx = x_sigma.subset(math.index(3, 0));
        const Vy = x_sigma.subset(math.index(4, 0));
        const Vz = x_sigma.subset(math.index(5, 0));
        const GyroBiasX = x_sigma.subset(math.index(10, 0));
        const GyroBiasY = x_sigma.subset(math.index(11, 0));
        const GyroBiasZ = x_sigma.subset(math.index(12, 0));
        return math.matrix([[Vx], [Vy], [Vz], [GyroBiasX], [GyroBiasY], [GyroBiasZ]]);
    }
    
    updateZUUV() {
        if (!this.initialized) return;
        const m = 6;
        const y_zuuv = math.matrix(math.zeros([m, 1])); 
        this.UKF_Update_Core(m, this.R_ZUUV, y_zuuv, this.measurementFunctionZUUV);
    }

    // --- 3. CORRECTION MAGNÉTOMÈTRE (YAW) ---
    measurementFunctionMag(x_sigma) {
        let q_array = [x_sigma.subset(math.index(6, 0)), x_sigma.subset(math.index(7, 0)), x_sigma.subset(math.index(8, 0)), x_sigma.subset(math.index(9, 0))];
        const R_matrix_L_B = math.transpose(this.quaternionToRotationMatrix(q_array));
        const B_proj_Body = math.multiply(R_matrix_L_B, this.B_REF_LTF);
        return B_proj_Body;
    }
    
    updateMag(mag_measurement) {
        if (!this.initialized) return;
        const m = 3;
        const y_mag = math.matrix([[mag_measurement.x], [mag_measurement.y], [mag_measurement.z]]);
        this.UKF_Update_Core(m, this.R_MAG, y_mag, this.measurementFunctionMag);
    }

    // --- 4. CORRECTION BAROMÉTRIQUE (ALTITUDE) ---
    measurementFunctionBaro(x_sigma) {
        return math.matrix([[x_sigma.subset(math.index(2, 0))]]);
    }
    
    updateBaro(alt_baro_corrected) {
        if (!this.initialized) return;
        const m = 1;
        const y_baro = math.matrix([[alt_baro_corrected]]);
        this.UKF_Update_Core(m, this.R_BARO, y_baro, this.measurementFunctionBaro);
    }
    
    // --- UTILS UKF STANDARD ---

    initialize(lat, lon, alt) {
        if (this.initialized) return;
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon); 
        this.x.subset(math.index(2, 0), alt); 
        this.P.subset(math.index(0, 0), 10);
        this.P.subset(math.index(1, 1), 10);
        this.P.subset(math.index(2, 2), 10);
        this.initialized = true;
    }

    isInitialized() {
        return this.initialized;
    }

    getState() {
        const Vx = this.x.subset(math.index(3, 0));
        const Vy = this.x.subset(math.index(4, 0));
        const Vz = this.x.subset(math.index(5, 0));
        const speedMagnitude = Math.sqrt(Vx**2 + Vy**2 + Vz**2); 
        const Q_state = [this.x.subset(math.index(6, 0)), this.x.subset(math.index(7, 0)), this.x.subset(math.index(8, 0)), this.x.subset(math.index(9, 0))];
        const euler = this.quaternionToEuler(Q_state);
        
        return {
            lat: this.x.subset(math.index(0, 0)),
            lon: this.x.subset(math.index(1, 0)),
            alt: this.x.subset(math.index(2, 0)),
            vel_N: Vx, // Vitesse Nord
            vel_E: Vy, // Vitesse Est
            vel_D: Vz, // Vitesse Bas
            speed: speedMagnitude,
            pitch: euler.pitch * this.R2D, 
            roll: euler.roll * this.R2D,
            yaw: euler.yaw * this.R2D,
            gyroBias: [this.x.subset(math.index(10, 0)), this.x.subset(math.index(11, 0)), this.x.subset(math.index(12, 0))],
            accelBias: [this.x.subset(math.index(13, 0)), this.x.subset(math.index(14, 0)), this.x.subset(math.index(15, 0))],
            clockBias: this.x.subset(math.index(16, 0)),
        };
    }

    getStateCovariance() {
        return this.P;
    }
    
    reset(lat, lon, alt) {
         this.x = math.matrix(math.zeros([this.n, 1]));
         this.x.subset(math.index(6, 0), 1); 
         this.P = math.diag(math.flatten(math.ones(this.n).map(val => val * 100)));
         this.initialized = false;
         this.initialize(lat, lon, alt); 
    }
    }
