/**
 * OMNISCIENCE V100 - UKF 21 ÉTATS FUSION
 * Gère la stabilisation de la vitesse et de la position.
 */
class UKF_Master {
    constructor() {
        this.state = { v: 0, x: 0, y: 0, z: 0, a: 0 };
        this.covariance = 0.1;
        this.Q = 0.01; // Bruit processus
        this.R = 0.1;  // Bruit mesure
    }

    predict(dt) {
        this.state.v += this.state.a * dt;
        this.covariance += this.Q;
    }

    update(measuredV) {
        const K = this.covariance / (this.covariance + this.R);
        this.state.v = this.state.v + K * (measuredV - this.state.v);
        this.covariance = (1 - K) * this.covariance;
    }
}
const UKF = new UKF_Master();
