class UKF_Master {
    constructor() {
        this.v = 0; 
        this.a = 0; 
        this.covariance = 0.1;
        this.Q = 0.005; 
        this.R = 0.08;  
        this.v_max = 0;
        this.threshold = 0.05; // Seuil de réalisme (ignore les micro-vibrations)
    }

    update(accRaw, dt) {
        let a = Math.abs(accRaw);
        if (a < this.threshold) a = 0;

        this.v += this.a * dt;
        this.covariance += this.Q;

        const K = this.covariance / (this.covariance + this.R);
        this.v = this.v + K * (a * dt - this.v);
        this.covariance = (1 - K) * this.covariance;

        if (this.v < 0) this.v = 0;
        if (this.v > this.v_max) this.v_max = this.v;
        return this.v;
    }
}
const UKF = new UKF_Master();
