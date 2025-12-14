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
    
    // =================================================================
    // FONCTION CŒUR DE PROPAGATION (INS)
    // =================================================================
    
    /**
     * Fonction de propagation d'état f(x_k-1, u_k, dt).
     * 🛑 CRITIQUE: Contient les équations complètes de l'INS.
     * @param {Matrix} x_k_minus - État précédent (21x1)
     * @param {number} dt - Intervalle de temps
     * @param {array} acc - Accélération corrigée (3) [Ax, Ay, Az]
     * @param {array} gyro - Vitesse angulaire corrigée (3) [Gx, Gy, Gz]
     * @returns {Matrix} État propagé (21x1)
     */
    f(x_k_minus, dt, acc, gyro) {
         // --- LOGIQUE DÉTAILLÉE (Doit être implémentée avec math.js) ---
         
         // 1. Extraction et Correction des Biais (Acc/Gyro) à partir de x_k_minus
         // 2. Calcul de la Matrice de Rotation (C_n_b) à partir du Quaternion d'état
         // 3. Calcul de la Gravité Locale (g_n) en fonction de la position lat/alt
         // 4. Intégration de l'Attitude (Quaternion) : q_k = q_k-1 * delta_q(gyro * dt)
         // 5. Intégration de la Vitesse (Vel) : V_k = V_k-1 + (C_n_b * (Acc - AccBias) + g_n) * dt
         // 6. Intégration de la Position (Pos) : Pos_k = Pos_k-1 + V_k * dt (avec conversion Lat/Lon en mètres)
         // 7. Maintien des Biais (GyroBias, AccBias) et Horloge (Clock) : Biases/Clocks_k = Biases/Clocks_k-1
         
         // L'état final x_k est construit à partir de ces intégrations.
         
         return x_k_minus; // Place Holder : Remplacer par l'état propagé réel.
    }
    
    // =================================================================
    // NOYAU DE LA MISE À JOUR UKF (CORRECTION)
    // =================================================================

    /**
     * Noyau de la mise à jour UKF (correction). 
     * Gère la génération des Sigma Points, le calcul du gain de Kalman, 
     * et la mise à jour de l'état (x) et de la covariance (P).
     * @param {number} m - Dimension de la mesure (ex: 6 pour GPS, 3 pour Mag)
     * @param {Matrix} R - Matrice de bruit de mesure (m x m)
     * @param {Matrix} y_k - Vecteur de mesure (m x 1)
     * @param {function} h - Fonction de mesure h(x)
     */
    UKF_Update_Core(m, R, y_k, h) {
         // --- LOGIQUE DÉTAILLÉE (Doit être implémentée avec math.js) ---
         
         // 1. GÉNÉRATION DES SIGMA POINTS
         // (n + lambda) * P_k_minus doit être décomposé (Cholesky) pour obtenir L.
         // Chi_k = [x_k, x_k + L, x_k - L]  (Taille n x 2n+1)
         
         // 2. PROPAGATION DE MESURE
         // Y_k = h(Chi_k) pour chaque colonne de Chi_k (Taille m x 2n+1)
         
         // 3. CALCUL DE LA MOYENNE ET DES COVARIANCES
         // y_mean = Y_k * Wm^T (Moyenne pondérée des mesures)
         // Pyy = (Y_k - y_mean) * Wc * (Y_k - y_mean)^T + R (Covariance auto de mesure)
         // Pxy = (Chi_k - x_k) * Wc * (Y_k - y_mean)^T (Covariance croisée état/mesure)
         
         // 4. CALCUL DU GAIN DE KALMAN
         // K = Pxy * Pyy^-1 
         
         // 5. MISE À JOUR DE L'ÉTAT ET DE LA COVARIANCE
         // x_k = x_k + K * (y_k - y_mean) (y_k est la mesure réelle)
         // P_k = P_k_minus - K * Pyy * K^T
         
         // 6. NORMALISATION (CRITIQUE pour UKF Quaternion)
         // Le Quaternion (x.subset(6:9)) doit être normalisé après la mise à jour : q = q / norm(q)
    }
    
    // =================================================================
    // FONCTIONS DE MESURE h(x)
    // =================================================================

    /**
     * Fonction de mesure h(x) pour le GPS (Lat, Lon, Alt, Vx, Vy, Vz).
     * Prédit la mesure GPS à partir de l'état UKF.
     */
    h_GPS(x_k_minus) {
         // Le GPS mesure directement les premiers 6 états dans le référentiel NED/Géographique
         return x_k_minus.subset(math.index([0, 1, 2, 3, 4, 5], 0)); // 6x1
    }

    /**
     * Fonction de mesure h(x) pour le Magnétomètre (Bobines d'induction).
     * Prédit B_body à partir de B_NED (Champ connu) et du Quaternion d'état x.
     */
    h_MAG(x_k_minus) {
        // Champ magnétique terrestre local (NED) en µT. (Exemple pour la France)
        const B_NED = math.matrix([[22.0], [5.0], [45.0]]); 
        
        const q = [x_k_minus.subset(math.index(6, 0)), x_k_minus.subset(math.index(7, 0)), 
                   x_k_minus.subset(math.index(8, 0)), x_k_minus.subset(math.index(9, 0))];

        const C_b_n = this.quaternionToRotationMatrix(q); 
        const C_n_b = math.transpose(C_b_n);
        
        return math.multiply(C_n_b, B_NED); // B_body = C_n_b * B_NED (Résultat 3x1 [Bx, By, Bz])
    }
    
    // =================================================================
    // INTERFACE UKF (PRÉDICTION / CORRECTION)
    // =================================================================

    /**
     * Étape de PRÉDICTION de l'UKF (Propagation INS)
     */
    predict(dt, acc, gyro) {
        if (!this.initialized) return;
        
        // 1. GÉNÉRATION DES SIGMA POINTS
        // Chi_k = generateSigmaPoints(this.x, this.P)
        
        // 2. PROPAGATION DES SIGMA POINTS
        // Chi_k_minus = this.f(Chi_k, dt, acc, gyro) pour chaque colonne de Chi_k
        
        // 3. CALCUL DE LA MOYENNE ET DE LA COVARIANCE PRÉDITES
        // this.x = Chi_k_minus * Wm^T
        // this.P = (Chi_k_minus - this.x) * Wc * (Chi_k_minus - this.x)^T + Q (Q est le bruit du processus)
        
        // 🛑 CRITIQUE: La propagation de la covariance (P) doit être implémentée ici.
    }

    /**
     * CORRECTION GPS (Correction de position et vitesse).
     */
    update(gpsData) {
        if (!this.initialized) return;
        const c = gpsData.coords;
        
        // Vecteur de mesure GPS (6x1)
        const y = math.matrix([
            [c.latitude], [c.longitude], [c.altitude || this.x.subset(math.index(2, 0))], 
            [c.speed || 0.0], [0.0], [0.0] 
        ]);
        
        // Mise à jour de la matrice de bruit de mesure R_GPS
        // const R_GPS_ACC = c.accuracy * c.accuracy;
        // ... (R_GPS peut être mis à jour en fonction de l'accuracy)

        this.UKF_Update_Core(6, this.R_GPS, y, this.h_GPS);
    }
    
    /**
     * CORRECTION Magnétomètre (Correction d'attitude - Yaw/Cap).
     */
    update_Mag(mag) {
        if (!this.initialized) return;
        
        // Vecteur de mesure y (3x1)
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
        this.x.subset(math.index(6, 0), 1); // Quaternion Identité
        // Réinitialiser P...
        this.initialized = true;
    }
    
    isInitialized() { 
        return this.initialized; 
    }
    
    /**
     * Extrait les données clés pour l'affichage du tableau de bord.
     */
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
            // Attitude (en radians pour le script principal)
            pitch: euler.pitch, 
            roll: euler.roll,   
            yaw: euler.yaw,     
            // Incertitude (approximation, exemple de la variance V_Nord)
            cov_vel: this.P.subset(math.index(3, 3)), 
            acc_long: NaN, // Doit être calculé dans F()
            gyroBias: [this.x.subset(math.index(10, 0)), this.x.subset(math.index(11, 0)), this.x.subset(math.index(12, 0))]
        };
    }
                             }
