// =================================================================
// PROFESSIONAL UNSCENTED KALMAN FILTER (UKF) - 21 ÉTATS - VERSION QUATERNION (V30 FUSIONNÉE/CORRIGÉE)
// FUSION: V30 (R dynamique GPS) + V28 (Fonctions Mag/Baro, Correction Yaw)
// CORRECTION : Implémentation complète de la propagation UKF (Sigma Points)
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
        // [0-2: Pos], [3-5: Vel], [6-9: Att (Quaternion)], [10-12: GyroBias], 
        // [13-15: AccBias], [16-17: Clock], [18-20: Réserves]
        this.n = 21; 
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // Initialisation Position et Quaternion
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon); 
        this.x.subset(math.index(2, 0), alt); 
        this.x.subset(math.index(6, 0), 1); // Quaternion Identité [1, 0, 0, 0]

        // --- PARAMÈTRES WGS84 ---
        this.G_E = 9.780327; this.R_MAJOR = 6378137.0; this.FLATTENING = 1/298.257223563;
        this.E_SQUARED = (2 * this.FLATTENING) - (this.FLATTENING**2);
        this.D2R = Math.PI / 180; this.R2D = 180 / Math.PI;

        // --- PARAMÈTRES UKF ---
        this.alpha = 1e-3; this.beta = 2; this.kappa = 0;
        this.lambda = (this.alpha**2) * (this.n + this.kappa) - this.n;
        
        // Poids (Sigma Points)
        this.Wm = math.zeros([1, 2 * this.n + 1]);
        this.Wc = math.zeros([1, 2 * this.n + 1]);
        this.Wm.subset(math.index(0, 0), this.lambda / (this.n + this.lambda));
        this.Wc.subset(math.index(0, 0), this.lambda / (this.n + this.lambda) + (1 - this.alpha**2 + this.beta));
        const weight = 1 / (2 * (this.n + this.lambda));
        for (let i = 1; i <= 2 * this.n; i++) {
            this.Wm.subset(math.index(0, i), weight);
            this.Wc.subset(math.index(0, i), weight);
        }

        // --- TUNING DES MATRICES (V30 Corrigée) ---
        
        // P: Incertitude Initiale
        this.P = math.diag(math.flatten(math.ones(this.n).map(val => val * 10.0))); 

        // Q: Bruit de Processus
        this.Q = math.diag(new Array(this.n).fill(1e-5)); 
        this.Q.subset(math.index(10, 10), 1e-6); // Gyro Bias X
        this.Q.subset(math.index(11, 11), 1e-6); // Gyro Bias Y
        this.Q.subset(math.index(12, 12), 1e-6); // Gyro Bias Z
        this.Q.subset(math.index(13, 13), 1e-5); // Accel Bias X
        this.Q.subset(math.index(14, 14), 1e-5); // Accel Bias Y
        this.Q.subset(math.index(15, 15), 1e-5); // Accel Bias Z

        // R_GPS: Matrice de base pour R dynamique
        this.R_GPS_BASE = math.diag([25.0, 25.0, 25.0, 1.0]); 

        // R_ZUUV, R_MAG, R_BARO (Valeurs V28 réintégrées)
        this.R_ZUUV = math.diag([1e-4, 1e-4, 1e-4, 1e-5, 1e-5, 1e-5]); 
        this.R_MAG = math.diag([0.5, 0.5, 0.5]); 
        this.R_BARO = math.diag([4.0]); 
        this.TAU_GYRO = 3600; this.TAU_ACCEL = 3600;
        this.B_REF = math.matrix([[0], [20], [40]]); // Champ Mag Approx (à calibrer si besoin)
    }

    // --- UTILS MATH (WGS84, Quaternions, etc.) ---
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
    quaternionToRotationMatrix(q) {
        const w = q[0], x = q[1], y = q[2], z = q[3];
        return math.matrix([
            [1 - 2*(y*y + z*z), 2*(x*y - w*z), 2*(x*z + w*y)],
            [2*(x*y + w*z), 1 - 2*(x*x + z*z), 2*(y*z - w*x)],
            [2*(x*z - w*y), 2*(y*z + w*x), 1 - 2*(x*x + y*y)]
        ]);
    }
    quaternionMultiply(q1, q2) {
        const [w1, x1, y1, z1] = q1;
        const [w2, x2, y2, z2] = q2;
        return [
            w1*w2 - x1*x2 - y1*y2 - z1*z2,
            w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2
        ];
    }
    quaternionIntegrate(q, w, dt) {
        const norm_w = Math.sqrt(w[0]**2 + w[1]**2 + w[2]**2);
        if (norm_w < 1e-10) return q;
        const half = 0.5 * norm_w * dt;
        const s = Math.sin(half);
        const rate = [Math.cos(half), (w[0]/norm_w)*s, (w[1]/norm_w)*s, (w[2]/norm_w)*s];
        const q_new = this.quaternionMultiply(q, rate);
        const n = Math.sqrt(q_new[0]**2 + q_new[1]**2 + q_new[2]**2 + q_new[3]**2);
        return q_new.map(v => v/n);
    }
    quaternionToEuler(q) {
        const w=q[0], x=q[1], y=q[2], z=q[3];
        const roll = Math.atan2(2*(w*x + y*z), 1 - 2*(x*x + y*y));
        const pitch = Math.asin(2*(w*y - z*x));
        // CORRECTION CRITIQUE DU YAW
        const yaw = Math.atan2(2*(w*z + x*y), 1 - 2*(y*y + z*z)); 
        return {roll, pitch, yaw};
    }
    generateSigmaPoints(x, P) {
        const A = math.sqrt(math.multiply(P, this.n + this.lambda));
        const X = [x];
        for(let i=0; i<this.n; i++) X.push(math.add(x, math.subset(A, math.index(math.range(0,this.n), i))));
        for(let i=0; i<this.n; i++) X.push(math.subtract(x, math.subset(A, math.index(math.range(0,this.n), i))));
        return X;
    }
    normalizeQuaternion(x) {
        const q = [x.subset(math.index(6,0)), x.subset(math.index(7,0)), x.subset(math.index(8,0)), x.subset(math.index(9,0))];
        const n = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2);
        for(let i=0; i<4; i++) x.subset(math.index(i+6,0), q[i]/n);
    }
    
    // --- PREDICTION (INS) ---
    stateTransitionFunction(x_sigma, dt, rawAccels, rawGyros) {
        // Extraction
        const lat = x_sigma.subset(math.index(0, 0));
        const alt = x_sigma.subset(math.index(2, 0));
        const vel = math.subset(x_sigma, math.index(math.range(3, 6), 0)); 
        const q_arr = [x_sigma.subset(math.index(6, 0)), x_sigma.subset(math.index(7, 0)), x_sigma.subset(math.index(8, 0)), x_sigma.subset(math.index(9, 0))];
        const gyroBias = math.subset(x_sigma, math.index(math.range(10, 13), 0)); 
        const accelBias = math.subset(x_sigma, math.index(math.range(13, 16), 0));
        const clockBias = x_sigma.subset(math.index(16, 0));
        const clockDrift = x_sigma.subset(math.index(17, 0));

        // Correction IMU
        const acc_corr = math.subtract(math.matrix([rawAccels]).transpose(), accelBias);
        const gyr_corr = math.subtract(math.matrix([rawGyros]).transpose(), gyroBias);
        
        // Rotation & Gravité
        const R_mat = this.quaternionToRotationMatrix(q_arr);
        const f_ltf = math.multiply(R_mat, acc_corr); // Force dans le repère local (corps vers local)
        const { R_N, R_M, g_vector } = this.getWGS84Parameters(lat * this.D2R, alt);
        const acc_ltf = math.subtract(f_ltf, g_vector);

        // Intégration
        const d_lat = vel.subset(math.index(0, 0)) / (R_M + alt) * dt;
        const d_lon = vel.subset(math.index(1, 0)) / ((R_N + alt) * Math.cos(lat * this.D2R)) * dt;
        const d_alt = -vel.subset(math.index(2, 0)) * dt;
        
        const newQ = this.quaternionIntegrate(q_arr, gyr_corr.toArray().flat(), dt);

        let x_new = math.clone(x_sigma);
        x_new.subset(math.index(0,0), lat + d_lat * this.R2D); // Lat
        x_new.subset(math.index(1,0), x_sigma.subset(math.index(1, 0)) + d_lon * this.R2D); // Lon
        x_new.subset(math.index(2,0), alt + d_alt); // Alt
        
        const newVel = math.add(vel, math.multiply(acc_ltf, dt));
        for(let i=0;i<3;i++) x_new.subset(math.index(i+3,0), newVel.subset(math.index(i,0)));
        for(let i=0;i<4;i++) x_new.subset(math.index(i+6,0), newQ[i]);
        
        // Markov Bias & Clock (Maintient des 21 états)
        const newGyroBias = math.multiply(gyroBias, 1.0 - dt/this.TAU_GYRO);
        const newAccelBias = math.multiply(accelBias, 1.0 - dt/this.TAU_ACCEL);
        const newClockBias = clockBias + clockDrift * dt;
        
        for(let i=0;i<3;i++) x_new.subset(math.index(i+10,0), newGyroBias.subset(math.index(i,0)));
        for(let i=0;i<3;i++) x_new.subset(math.index(i+13,0), newAccelBias.subset(math.index(i,0)));
        x_new.subset(math.index(16,0), newClockBias);

        return x_new;
    }

    predict(dt, rawAccels, rawGyros) {
        if (!this.initialized) return;
        
        // 1. GÉNÉRATION DES SIGMA POINTS
        const X = this.generateSigmaPoints(this.x, this.P);
        
        // 2. PROPAGATION DES SIGMA POINTS
        const X_star = X.map(xs => this.stateTransitionFunction(xs, dt, rawAccels, rawGyros));
        
        // 3. RECONSTRUCTION DE L'ÉTAT PRÉDIT (x_bar)
        let x_bar = math.zeros([this.n, 1]);
        for(let i=0; i<X_star.length; i++) x_bar = math.add(x_bar, math.multiply(this.Wm.subset(math.index(0,i)), X_star[i]));
        
        // 4. RECONSTRUCTION DE LA COVARIANCE PRÉDITE (P_bar)
        let P_bar = math.clone(this.Q); // Ajout du bruit de processus Q
        for(let i=0; i<X_star.length; i++) {
            const diff = math.subtract(X_star[i], x_bar);
            P_bar = math.add(P_bar, math.multiply(math.multiply(diff, math.transpose(diff)), this.Wc.subset(math.index(0,i))));
        }
        this.x = x_bar;
        this.P = P_bar;
        this.normalizeQuaternion(this.x);
    }

    // --- UPDATE CORE ---
    UKF_Update_Core(m, R, y_meas, h_func) {
        const X = this.generateSigmaPoints(this.x, this.P);
        const Y = X.map(xs => h_func.call(this, xs));
        
        let y_bar = math.zeros([m, 1]);
        for(let i=0; i<Y.length; i++) y_bar = math.add(y_bar, math.multiply(this.Wm.subset(math.index(0,i)), Y[i]));
        
        let Pyy = math.clone(R);
        let Pxy = math.zeros([this.n, m]);
        
        for(let i=0; i<Y.length; i++) {
            const y_diff = math.subtract(Y[i], y_bar);
            const x_diff = math.subtract(X[i], this.x);
            const W = this.Wc.subset(math.index(0,i));
            Pyy = math.add(Pyy, math.multiply(math.multiply(y_diff, math.transpose(y_diff)), W));
            Pxy = math.add(Pxy, math.multiply(math.multiply(x_diff, math.transpose(y_diff)), W));
        }
        
        const K = math.multiply(Pxy, math.inv(Pyy));
        const innov = math.subtract(y_meas, y_bar);
        this.x = math.add(this.x, math.multiply(K, innov));
        this.P = math.subtract(this.P, math.multiply(math.multiply(K, Pyy), math.transpose(K)));
        this.normalizeQuaternion(this.x);
    }
    
    // 1. GPS Update (4 mesures: Lat, Lon, Alt, Vitesse totale)
    h_GPS(x) {
        const Vx=x.subset(math.index(3,0)), Vy=x.subset(math.index(4,0)), Vz=x.subset(math.index(5,0));
        const spd = Math.sqrt(Vx**2 + Vy**2 + Vz**2);
        return math.matrix([[x.subset(math.index(0,0))], [x.subset(math.index(1,0))], [x.subset(math.index(2,0))], [spd]]);
    }
    update(pos) { 
        if (!this.initialized) return;
        const acc = pos.coords.accuracy || 10;
        // R dynamique basé sur la précision GPS
        const R_dyn = math.diag([acc**2, acc**2, (pos.coords.altitudeAccuracy||acc)**2, 1.0]); 
        const y = math.matrix([[pos.coords.latitude], [pos.coords.longitude], [pos.coords.altitude||0], [pos.coords.speed||0]]);
        this.UKF_Update_Core(4, R_dyn, y, this.h_GPS);
        
        // Mise à jour simplifiée de l'horloge
        const bias = (pos.timestamp/1000) - (Date.now()/1000);
        this.x.subset(math.index(16,0), this.x.subset(math.index(16,0))*0.9 + bias*0.1);
    }

    // 2. ZUUV Update (Zero Velocity Update - 6 mesures)
    h_ZUUV(x) {
        // ZUUV observe: Velocité (3-5) et Gyro Bias (10-12)
        return math.matrix([
            [x.subset(math.index(3,0))], [x.subset(math.index(4,0))], [x.subset(math.index(5,0))],
            [x.subset(math.index(10,0))], [x.subset(math.index(11,0))], [x.subset(math.index(12,0))]
        ]);
    }
    updateZUUV() {
        if (!this.initialized) return;
        const y = math.matrix(math.zeros([6,1])); 
        this.UKF_Update_Core(6, this.R_ZUUV, y, this.h_ZUUV);
    }
    
    // 3. Barometer Update (1 mesure: Altitude)
    h_BARO(x) { return math.matrix([[x.subset(math.index(2,0) )]]); }
    updateBaro(alt) {
        if (!this.initialized) return;
        this.UKF_Update_Core(1, this.R_BARO, math.matrix([[alt]]), this.h_BARO);
    }

    // 4. Magnetometer Update (3 mesures: Champ Mag)
    h_MAG(x) {
        const q=[x.subset(math.index(6,0)), x.subset(math.index(7,0)), x.subset(math.index(8,0)), x.subset(math.index(9,0))];
        const R_LB = math.transpose(this.quaternionToRotationMatrix(q)); // Rotation Local -> Body
        return math.multiply(R_LB, this.B_REF);
    }
    updateMag(mag) {
        if (!this.initialized) return;
        // NOTE: 'mag' doit être un objet {x: val, y: val, z: val} ou un tableau
        const y = math.matrix([[mag.x], [mag.y], [mag.z]]); 
        this.UKF_Update_Core(3, this.R_MAG, y, this.h_MAG);
    }
    
    // --- INTERFACE (Accesseurs) ---
    initialize(lat, lon, alt) {
        if (this.initialized) return;
        this.x.subset(math.index(0,0), lat);
        this.x.subset(math.index(1,0), lon);
        this.x.subset(math.index(2,0), alt);
        this.P = math.multiply(this.P, 0.1); 
        this.initialized = true;
    }
    isInitialized() { return this.initialized; }
    
    getState() {
        const Vx=this.x.subset(math.index(3,0)), Vy=this.x.subset(math.index(4,0)), Vz=this.x.subset(math.index(5,0));
        const q=[this.x.subset(math.index(6,0)), this.x.subset(math.index(7,0)), this.x.subset(math.index(8,0)), this.x.subset(math.index(9,0))];
        const euler = this.quaternionToEuler(q);
        return {
            lat: this.x.subset(math.index(0,0)), lon: this.x.subset(math.index(1,0)), alt: this.x.subset(math.index(2,0)),
            speed: Math.sqrt(Vx**2 + Vy**2 + Vz**2),
            vel_D: Vz, 
            pitch: euler.pitch, // En radians
            roll: euler.roll,   // En radians
            yaw: euler.yaw,     // En radians
            clockBias: this.x.subset(math.index(16,0))
        };
    }
    getStateCovariance() { return this.P; }
    reset(lat, lon, alt) {
        // Réinitialisation complète des états
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.x.subset(math.index(6,0), 1);
        this.P = math.diag(math.flatten(math.ones(this.n).map(val => val * 100)));
        // Réinitialisation avec les dernières valeurs connues
        this.initialize(lat, lon, alt);
    }
}

window.ProfessionalUKF = ProfessionalUKF;
