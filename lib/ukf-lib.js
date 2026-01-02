class UKF_Master {
    constructor() {
        this.v = 0; // Vitesse stable (m/s)
        this.a = 0; // Accélération filtrée
        this.v_max = 0;
        this.covariance = 0.1;
        this.Q = 0.005; // Bruit processus
        this.R = 0.08;  // Bruit capteur
        this.gate = 0.06; // Noise Gate pour le réalisme immobile
    }

    update(accRaw, dt) {
        let input = Math.abs(accRaw);
        if (input < this.gate) input = 0; // Force le 0.0 à l'arrêt

        // Prediction & Innovation
        this.v += this.a * dt;
        this.covariance += this.Q;
        const K = this.covariance / (this.covariance + this.R);
        this.v = this.v + K * (input * dt - this.v);
        this.covariance = (1 - K) * this.covariance;

        if (this.v < 0) this.v = 0;
        if (this.v > this.v_max) this.v_max = this.v;
        return this.v;
    }
}
const UKF = new UKF_Master();
