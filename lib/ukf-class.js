// =================================================================
// PROFESSIONAL UNSCENTED KALMAN FILTER (UKF) - 21 ÉTATS - VERSION QUATERNION
// Auteur: Architecture Scientifique GNSS
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

        // 3. Matrice de Covariance P
        this.P = math.multiply(math.identity(this.n), 100); 
        this.Q = math.multiply(math.identity(this.n), 0.01); 
        this.R = math.multiply(math.identity(6), 5); 

        console.log("ProfessionalUKF: Instance 21-états Quaternion créé.");
    }
    
    // =========================================================
    // FONCTIONS UTILITAIRES (IMU/MATH)
    // =========================================================

    /** Normalise un quaternion [w, x, y, z] dans math.js. */
    normalizeQuaternion(q) {
        const norm = math.norm(q);
        return math.divide(q, norm).toArray();
    }
    
    /** Convertit Quaternion [w, x, y, z] en Matrice de Rotation 3x3 (corps -> global) */
    quaternionToRotationMatrix(q) {
        const w = q[0], x = q[1], y = q[2], z = q[3];
        return [
            [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w],
            [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w],
            [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y]
        ];
    }
    
    /** Convertit un quaternion en angles d'Euler (Roll, Pitch, Yaw) pour l'affichage */
    quaternionToEuler(q) {
        const w = q[0], x = q[1], y = q[2], z = q[3];
        const R2D = 180 / Math.PI;
        
        // Roll (Rotation autour de X)
        const sinr_cosp = 2 * (w * x + y * z);
        const cosr_cosp = 1 - 2 * (x * x + y * y);
        const roll = Math.atan2(sinr_cosp, cosr_cosp);

        // Pitch (Rotation autour de Y)
        const sinp = 2 * (w * y - z * x);
        const pitch = (Math.abs(sinp) >= 1) ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);

        // Yaw (Rotation autour de Z)
        const siny_cosp = 2 * (w * z + x * y);
        const cosy_cosp = 1 - 2 * (y * y + z * z);
        const yaw = Math.atan2(siny_cosp, cosy_cosp);

        return { roll: roll * R2D, pitch: pitch * R2D, yaw: yaw * R2D };
    }


    // =========================================================
    // MÉTHODES DE FILTRAGE
    // =========================================================

    /**
     * @param {number} dt Delta temps (s).
     * @param {number[]} rawAccel Accélérations brutes [ax, ay, az].
     * @param {number[]} rawGyro Taux angulaires bruts (Gyro) [wx, wy, wz].
     */
    predict(dt, rawAccel = [0, 0, 0], rawGyro = [0, 0, 0]) {
        if (dt <= 0) return;
        
        const g = 9.8067; 
        const EARTH_RADIUS = 6371000;
        
        // 1. EXTRACTION ET CORRECTION DE BIAS
        // Extraction du quaternion actuel [w, x, y, z] (indices 6 à 9)
        const Q_current = [
            this.x.subset(math.index(6, 0)),
            this.x.subset(math.index(7, 0)),
            this.x.subset(math.index(8, 0)),
            this.x.subset(math.index(9, 0))
        ];
        
        // Extraction des biais estimés (simples ici, l'UKF complet les gère)
        const gyroBias = [
            this.x.subset(math.index(10, 0)), 
            this.x.subset(math.index(11, 0)), 
            this.x.subset(math.index(12, 0))
        ];
        const accelBias = [
            this.x.subset(math.index(13, 0)), 
            this.x.subset(math.index(14, 0)), 
            this.x.subset(math.index(15, 0))
        ];
        
        // Correction de bias appliquée au capteur
        const w_corrected = math.subtract(rawGyro, gyroBias);
        const a_corrected = math.subtract(rawAccel, accelBias);
        
        // 2. PROPAGATION DE L'ATTITUDE (Quaternions - Simplification)
        const omega = [0, w_corrected[0], w_corrected[1], w_corrected[2]]; 
        
        // Multiplicateur pour l'intégration (simplifiée)
        const Q_omega_dt = math.matrix(omega).map(val => val * dt / 2);
        
        // Q_new = Q_old + (Q_old * Omega * dt/2)
        // Note: Cette implémentation est une approximation du calcul du quaternion dérivé (q_dot).
        const qDot = math.multiply(math.matrix(Q_current), Q_omega_dt);
        const Q_new = math.add(Q_current, qDot.toArray());
        
        const Q_norm = this.normalizeQuaternion(Q_new);

        // Mise à jour de l'état du Quaternion
        this.x.subset(math.index([6, 7, 8, 9], 0), math.matrix(Q_norm).transpose());

        // 3. CORRECTION DE GRAVITÉ (Soustraction de la gravité par rotation)
        // Le vecteur gravité dans le repère GLOBAL (NED: North-East-Down ou ENU: East-North-Up. Ici on prend Z vertical)
        const g_global = [0, 0, -g]; 
        
        // Matrice de Rotation R (Corps -> Global)
        const R_matrix = this.quaternionToRotationMatrix(Q_norm);
        
        // La gravité telle que mesurée par l'accéléromètre (dans le repère du corps)
        const g_body = math.multiply(math.inv(R_matrix), math.matrix(g_global).transpose()).toArray();
        
        // Accélération linéaire (sans gravité) dans le repère du corps
        const a_lin_body = math.subtract(a_corrected, g_body);

        // 4. ROTATION DE L'ACCÉLÉRATION LINÉAIRE VERS LE REPÈRE GLOBAL (pour navigation)
        // a_lin_global = R_matrix * a_lin_body
        const a_lin_global = math.multiply(R_matrix, math.matrix(a_lin_body).transpose()).toArray(); 
        

        // 5. PROPAGATION DE LA POSITION ET VITESSE
        let Vx = this.x.subset(math.index(3, 0));
        let Vy = this.x.subset(math.index(4, 0));
        let Vz = this.x.subset(math.index(5, 0));
        
        // V_new = V_old + a_lin_global * dt
        const newVx = Vx + a_lin_global[0] * dt;
        const newVy = Vy + a_lin_global[1] * dt;
        const newVz = Vz + a_lin_global[2] * dt; 

        this.x.subset(math.index(3, 0), newVx);
        this.x.subset(math.index(4, 0), newVy);
        this.x.subset(math.index(5, 0), newVz);
        
        // P_new = P_old + V_new * dt
        let Lat = this.x.subset(math.index(0, 0));
        let Lon = this.x.subset(math.index(1, 0));
        
        // Facteurs de conversion Lat/Lon (plus précis)
        const latRad = Lat * (Math.PI/180);
        // Radius of curvature in the meridian plane (for Latitude)
        const R_m = EARTH_RADIUS * (1 - 0.00669437 * Math.sin(latRad)**2)**(-1.5);
        // Radius of curvature in the prime vertical plane (for Longitude)
        const R_n = EARTH_RADIUS * (1 - 0.00669437 * Math.sin(latRad)**2)**(-0.5);
        
        const latScale = 1 / R_m;
        const lonScale = 1 / (R_n * Math.cos(latRad));
        
        // Mise à jour de la position
        this.x.subset(math.index(0, 0), Lat + (newVx * dt * latScale) * R2D); 
        this.x.subset(math.index(1, 0), Lon + (newVy * dt * lonScale) * R2D); 
        this.x.subset(math.index(2, 0), this.x.subset(math.index(2, 0)) + newVz * dt); 

        // 6. Propagation de la covariance
        this.P = math.add(this.P, this.Q);
    }

    // --- MISE À JOUR (GPS Correction) ---
    update(pos) {
        // Le vrai UKF implémente ici la correction d'état (Kalaman Gain, etc.)
        // Pour cette version, nous faisons une simple correction d'état et de covariance.
        if (!this.initialized && pos.coords && pos.coords.latitude !== 0) {
            // Initialisation Position et Vitesse
            this.x.subset(math.index(0, 0), pos.coords.latitude);
            this.x.subset(math.index(1, 0), pos.coords.longitude);
            this.x.subset(math.index(2, 0), pos.coords.altitude || 0);
            this.x.subset(math.index(3, 0), pos.coords.speed || 0); 
            this.initialized = true;
            console.log("ProfessionalUKF: Initialized with first GPS fix.");
            return;
        }

        if (!this.initialized) return;

        // Simplification: Correction d'état après la prédiction
        this.x.subset(math.index(0, 0), pos.coords.latitude);
        this.x.subset(math.index(1, 0), pos.coords.longitude);
        this.x.subset(math.index(2, 0), pos.coords.altitude || 0);
        // Correction de la vitesse uniquement dans la direction du cap (simplification)
        this.x.subset(math.index(3, 0), pos.coords.speed || 0.0); 
        
        // Réduire l'incertitude sur la covariance P après correction
        this.P = math.multiply(this.P, 0.95); 
    }
    
    // --- ACCESSEURS (GETTERS) ---
    getState() {
        const Vx = this.x.subset(math.index(3, 0));
        const Vy = this.x.subset(math.index(4, 0));
        const Vz = this.x.subset(math.index(5, 0));
        
        const speedMagnitude = Math.sqrt(Vx**2 + Vy**2 + Vz**2); 

        // Récupération du Quaternion pour l'affichage Roll/Pitch
        const Q_state = [
            this.x.subset(math.index(6, 0)),
            this.x.subset(math.index(7, 0)),
            this.x.subset(math.index(8, 0)),
            this.x.subset(math.index(9, 0))
        ];
        // Ajout d'une vérification pour les quaternions nuls (si non initialisé)
        const euler = (math.norm(Q_state) > 0.1) ? this.quaternionToEuler(Q_state) : {roll: 0, pitch: 0, yaw: 0};
        
        return {
            lat: this.x.subset(math.index(0, 0)),
            lon: this.x.subset(math.index(1, 0)),
            alt: this.x.subset(math.index(2, 0)),
            speed: speedMagnitude, 
            kUncert: this.P.subset(math.index(0, 0)),
            roll: euler.roll, 
            pitch: euler.pitch, 
            yaw: euler.yaw
        };
    }
    
    getStateCovariance() {
        return this.P;
    }

    isInitialized() {
        return this.initialized;
    }
}

window.ProfessionalUKF = ProfessionalUKF;
