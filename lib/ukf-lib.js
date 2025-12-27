/**
 * UKF-LIB - MOTEUR DE FUSION NEWTONIENNE (MATH.JS)
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0; // Vitesse scalaire (m/s)
        this.lat = null;
        this.lon = null;
        this.altitude = 0;
        this.gpsAccuracy = 0;
        
        // État IMU
        this.accel = { x: 0, y: 0, z: 0 };
        this.gyro = { alpha: 0, beta: 0, gamma: 0 };
        this.gLocal = 9.80665;
        
        // Matrice de covariance simplifiée pour le lissage
        this.P = 1.0; 
        this.lastTime = performance.now();
    }

    // Mise à jour via Accéléromètre (Loi de Newton)
    predict(dt) {
        if (!this.isRunning) return;

        // Calcul de l'accélération nette (Magnitude - Gravité)
        const totalAcc = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        const netAcc = totalAcc - this.gLocal;

        // Seuil de bruit (Deadzone) pour éviter la dérive à l'arrêt
        if (Math.abs(netAcc) > 0.2) {
            // v = v + a * dt
            this.vMs += netAcc * dt;
        } else {
            this.vMs *= 0.95; // Friction artificielle pour stabiliser le zéro
        }

        if (this.vMs < 0) this.vMs = 0;
    }

    // Correction via GPS (Vérité terrain)
    observeGPS(lat, lon, alt, speed, acc) {
        this.lat = lat;
        this.lon = lon;
        this.altitude = alt;
        this.gpsAccuracy = acc;

        // Fusion de Kalman simplifiée
        if (speed !== null && acc < 20) {
            const K = 0.7; // Gain de confiance envers le GPS
            this.vMs = (1 - K) * this.vMs + K * speed;
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
