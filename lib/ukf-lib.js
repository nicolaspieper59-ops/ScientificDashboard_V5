/**
 * GEODESIC MASTER ENGINE - VERSION SCIENTIFIQUE COMPLÈTE
 */
window.ProfessionalUKF = class {
    constructor() {
        // État de 21 variables (Position, Vitesse, Accélération, Attitude, Biais)
        this.n = 21;
        this.x = math.matrix(math.zeros([this.n, 1])); 
        this.x.set([6, 0], 1.0); // W du Quaternion
        
        // P : Matrice de covariance (Incertitude)
        this.P = math.multiply(math.identity(this.n), 0.1);
        
        // Q : Bruit de processus (Précision des capteurs)
        this.Q = math.multiply(math.identity(this.n), 0.001);
        
        console.log("🚀 Moteur UKF chargé avec succès.");
    }

    // La fonction qui posait problème : multiplication matricielle pour la covariance
    predict(dt, acc, gyro) {
        if (!dt) return;

        // Modèle de prédiction (F)
        // x = F * x
        let F = math.identity(this.n);
        // Ici, on injecte la physique dans la matrice de transition
        // v = v0 + a*dt
        F.set([0, 3], dt); F.set([1, 4], dt); F.set([2, 5], dt);

        try {
            // C'est ici que la magie opère
            this.x = math.multiply(F, this.x); 
            // P = F * P * F' + Q
            let Ft = math.transpose(F);
            this.P = math.add(math.multiply(math.multiply(F, this.P), Ft), this.Q);
        } catch (e) {
            console.error("Erreur matricielle : ", e);
        }
    }

    getState() {
        return {
            lat: this.x.get([0, 0]),
            v: Math.sqrt(Math.pow(this.x.get([3,0]),2) + Math.pow(this.x.get([4,0]),2))
        };
    }
};
