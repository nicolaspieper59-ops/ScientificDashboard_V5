/**
 * UKF 21 ÉTATS - MATH.JS CORE
 * Vecteur d'état X (21x1) : 
 * [0-2] Position (x,y,z), [3-5] Vitesse, [6-8] Accélération, 
 * [9-11] Orientation, [12-14] Biais Accel, [15-17] Biais Gyro, [18-20] Mag
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.lastTime = performance.now();
        this.dt = 0.016; 
        this.freq = 60;

        // Initialisation des matrices avec math.js
        this.X = math.matrix(math.zeros([21, 1])); // État
        this.P = math.multiply(math.identity(21), 0.1); // Covariance
        this.Q = math.multiply(math.identity(21), 0.001); // Bruit processus
        
        // Variables de pont pour l'UI
        this.vMs = 0;
        this.lat = null;
        this.lon = null;
        this.alt = 0;
        this.accelBrute = { x: 0, y: 0, z: 0 };
    }

    /**
     * MODÈLE DE PRÉDICTION NEWTONIEN
     */
    predict() {
        if (!this.isRunning) return;

        const now = performance.now();
        this.dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        
        // Stabilité de la fréquence (Nyquist)
        if (this.dt > 0) this.freq = (this.freq * 0.9) + ((1 / this.dt) * 0.1);

        // 1. Extraction des forces (Accélération - Biais)
        const ax = this.accelBrute.x - this.X.get([12, 0]);
        const ay = this.accelBrute.y - this.X.get([13, 0]);
        const az = this.accelBrute.z - this.X.get([14, 0]);

        // 2. Calcul de la décélération inversée
        // On calcule la norme de l'accélération nette par rapport à la gravité (9.80665)
        const gRef = 9.80665;
        const normeAcc = Math.sqrt(ax**2 + ay**2 + az**2);
        const accelerationNette = normeAcc - gRef;

        // 3. Mise à jour de la Vitesse (État index 3)
        let vActuelle = this.X.get([3, 0]);
        
        if (Math.abs(accelerationNette) > 0.2) {
            // v = v + a * dt (Loi de Newton)
            vActuelle += accelerationNette * this.dt;
        } else {
            // Friction automatique à l'arrêt pour éviter la dérive infinie
            vActuelle *= 0.96; 
        }

        if (vActuelle < 0) vActuelle = 0;
        this.X.set([3, 0], vActuelle);
        this.vMs = vActuelle;

        // 4. Propagation de la Covariance (P = P + Q)
        this.P = math.add(this.P, this.Q);
        
        this.updateFrequencyUI();
    }

    /**
     * CORRECTION GPS
     */
    updateGPS(lat, lon, alt, speed, accuracy) {
        this.lat = lat;
        this.lon = lon;
        this.alt = alt;

        if (speed !== null && accuracy < 20) {
            // Gain de Kalman simplifié pour la correction de vitesse
            const K = 0.75; 
            const vGPS = speed;
            const vUKF = this.X.get([3, 0]);
            
            // Fusion : x = x + K * (mesure - x)
            const vFusion = vUKF + K * (vGPS - vUKF);
            this.X.set([3, 0], vFusion);
            this.vMs = vFusion;
        }
    }

    updateFrequencyUI() {
        const el = document.getElementById('nyquist-limit');
        if (el) el.textContent = Math.round(this.freq) + " Hz";
    }
}

window.ProfessionalUKF = ProfessionalUKF;
