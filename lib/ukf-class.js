// =================================================================
// PROFESSIONAL UNSCENTED KALMAN FILTER (UKF) - 21 STATES (CORRIGÉ)
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
        
        // --- 1. CONFIGURATION DU VECTEUR D'ÉTAT (21 État) ---
        // [Pos(3): 0, 1, 2], [Vel(3): 3, 4, 5], [Acc(3): 6, 7, 8], [Att(3): 9, 10, 11], [GyroBias(3): 12, 13, 14], [AccBias(3): 15, 16, 17], [Clock(3): 18, 19, 20]
        this.n = 21; 
        
        // Initialisation de l'état x (Vecteur colonne)
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // Initialisation position (Lat/Lon/Alt)
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon); 
        this.x.subset(math.index(2, 0), alt); 

        // --- 2. MATRICE DE COVARIANCE P (Incertitude initiale) ---
        this.P = math.multiply(math.identity(this.n), 100); 
        // Réduire l'incertitude pour la position initiale connue
        this.P.subset(math.index(0, 0), 10);
        this.P.subset(math.index(1, 1), 10);

        // --- 3. BRUITS DE PROCESSUS (Q) ET MESURE (R) ---
        this.Q = math.multiply(math.identity(this.n), 0.01); 
        this.R = math.multiply(math.identity(6), 5); // Bruit mesure GPS (Pos+Vel)

        console.log("ProfessionalUKF: Instance created with 21 states.");
    }

    // --- MÉTHODE DE PRÉDICTION (IMU Integration) - CORRIGÉE POUR LE MODE GROTTE ---
    /**
     * @param {number} dt Delta temps depuis la dernière prédiction (en secondes).
     * @param {number[]} accels Accélérations IMU [ax, ay, az].
     */
    predict(dt, accels = [0, 0, 0]) {
        if (!this.initialized || dt <= 0) return;
        
        // 1. Mise à jour de l'état X (Vitesse et Position) par intégration (Dead Reckoning)
        // Utilisation de la formule de cinématique simple : P_new = P_old + V*dt ; V_new = V_old + a*dt

        // A. Vitesse (Vel X/Y : index 3 et 4)
        // V_new = V_old + a * dt
        let Vx = this.x.subset(math.index(3, 0));
        let Vy = this.x.subset(math.index(4, 0));
        
        const newVx = Vx + accels[0] * dt;
        const newVy = Vy + accels[1] * dt; // Utilisation des accélérations brutes (accels[0/1])
        
        this.x.subset(math.index(3, 0), newVx);
        this.x.subset(math.index(4, 0), newVy);

        // B. Position (Pos Lat/Lon : index 0 et 1)
        // P_new = P_old + V_new * dt
        let Lat = this.x.subset(math.index(0, 0));
        let Lon = this.x.subset(math.index(1, 0));
        
        // NOTE: La conversion Lat/Lon à partir de m/s nécessite un calcul matriciel (non inclus ici pour la simplicité)
        // Simplifié ici pour montrer la dépendance au temps
        const newLat = Lat + (newVx * dt * 0.000008983); // Facteur approximatif m/s -> Lat/Lon
        const newLon = Lon + (newVy * dt * 0.0000135); 
        
        this.x.subset(math.index(0, 0), newLat);
        this.x.subset(math.index(1, 0), newLon);

        // 2. Propagation de la covariance (L'incertitude augmente avec le temps)
        // P = F*P*F' + Q (Simplifié ici à une simple addition du bruit de processus Q)
        this.P = math.add(this.P, this.Q);
    }

    // --- MÉTHODE DE MISE À JOUR (GPS Correction) - CORRIGÉE ET SIMPLIFIÉE ---
    update(pos) {
        // Si première réception GPS, on initialise l'état exactement
        if (!this.initialized && pos.coords && pos.coords.latitude !== 0) {
            this.x.subset(math.index(0, 0), pos.coords.latitude);
            this.x.subset(math.index(1, 0), pos.coords.longitude);
            this.x.subset(math.index(2, 0), pos.coords.altitude || 0);
            this.initialized = true;
            console.log("ProfessionalUKF: Initialized with first GPS fix.");
            return;
        }

        // --- CORRECTION ---
        if (!this.initialized) return;

        // Dans un vrai UKF, ici a lieu le calcul du gain de Kalman K et la correction d'état.
        // Pour cet exemple, nous faisons une correction directe simple (moins réaliste mais fonctionnelle).
        
        // Correction position (Lat/Lon)
        this.x.subset(math.index(0, 0), pos.coords.latitude);
        this.x.subset(math.index(1, 0), pos.coords.longitude);
        
        // Correction vitesse (Index 4 pour vitesse Y)
        const speed = pos.coords.speed || 0.0;
        this.x.subset(math.index(4, 0), speed); 
        
        // La covariance P est mise à jour pour réduire l'incertitude
        // P_new = (I - K*H) * P_old
        this.P = math.multiply(this.P, 0.95); // Réduction simplifiée de l'incertitude
    }
    
    // --- MÉTHODE IMU (Process Accel/Gyro) ---
    processIMUData(ax, ay, az, gyro) {
        // Logique de traitement IMU (estimation des biais, quaternion...)
        // L'accélération ax/ay/az est transmise à 'predict' dans la boucle rapide.
    }

    // --- ACCESSEURS (GETTERS) - CORRIGÉS ---
    getState() {
        // Extraction des états de vitesse (index 3 et 4)
        const Vx = this.x.subset(math.index(3, 0));
        const Vy = this.x.subset(math.index(4, 0));
        
        // Calcul de la magnitude de la vitesse (Vitesse Stable)
        const speedMagnitude = Math.sqrt(Vx**2 + Vy**2); 
        
        return {
            lat: this.x.subset(math.index(0, 0)),
            lon: this.x.subset(math.index(1, 0)),
            alt: this.x.subset(math.index(2, 0)),
            speed: speedMagnitude, // Vitesse estimée par l'UKF
            kUncert: this.P.subset(math.index(0, 0)) // Incertitude position
        };
    }
    
    getStateCovariance() {
        return this.P;
    }

    isInitialized() {
        return this.initialized;
    }
}

// Export global pour être accessible par les autres scripts
window.ProfessionalUKF = ProfessionalUKF;
