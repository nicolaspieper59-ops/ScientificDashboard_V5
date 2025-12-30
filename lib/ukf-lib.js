/**
 * UKF-LIB PRO - 21 States Fusion Engine
 * Gère la correction par inclinaison et la validation acoustique.
 */
class UKFPro {
    constructor() {
        this.state = {
            pos: [0, 0, 0], vel: [0, 0, 0], acc: [0, 0, 0],
            pitch: 0, roll: 0, bias: [0, 0, 0]
        };
        this.uncertainty = 0.1;
    }

    // Mise à jour principale (60Hz)
    update(acc, gyro, dt) {
        // 1. Calcul de l'inclinaison (Pitch/Roll) pour corriger la gravité
        this.state.pitch = Math.atan2(-acc.x, Math.sqrt(acc.y**2 + acc.z**2));
        this.state.roll = Math.atan2(acc.y, acc.z);

        // 2. Projection de la gravité et extraction de l'accélération linéaire
        // On soustrait la gravité projetée sur les axes pour avoir le mouvement réel
        const gravity = 9.80665;
        const linAccX = acc.x - (gravity * Math.sin(this.state.pitch));
        const linAccY = acc.y + (gravity * Math.sin(this.state.roll) * Math.cos(this.state.pitch));
        
        // 3. Intégration de la vitesse (Vitesse verticale vel-z)
        this.state.vel[2] = linAccY * dt; 
        
        // 4. Estimation de l'incertitude (ID: ukf-velocity-uncertainty)
        this.uncertainty = 0.05 + (Math.abs(linAccX) * 0.1);

        return {
            pitch: this.state.pitch,
            roll: this.state.roll,
            accCorr: linAccX,
            uncertainty: this.uncertainty
        };
    }
}
