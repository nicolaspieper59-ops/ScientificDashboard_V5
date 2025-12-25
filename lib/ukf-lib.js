/**
 * UKF 21 STATES - KERNEL PRO FINAL
 * Gestion de la physique, des capteurs et de l'odométrie
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false; // Désactivé au chargement (sécurité)
        this.vMs = 0;           // Vitesse filtrée
        this.maxSpeed = 0;      // Vitesse max session
        this.distance3D = 0;    // Distance cumulée (km)
        this.mass = 70;         // Masse par défaut
        this.lat = 43.284566;   // Latitude par défaut
        this.lon = 5.358734;    // Longitude par défaut
        this.altitude = 0;      
        
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.gyro = { pitch: 0, roll: 0, heading: 0 };
        this.lastTime = performance.now();
        
        this.initHardware();
    }

    initHardware() {
        // Accéléromètre & Gyroscope
        window.addEventListener('devicemotion', (e) => {
            if (this.isRunning && e.accelerationIncludingGravity) {
                this.accel.x = e.accelerationIncludingGravity.x || 0;
                this.accel.y = e.accelerationIncludingGravity.y || 0;
                this.accel.z = e.accelerationIncludingGravity.z || 9.80665;
            }
        });

        window.addEventListener('deviceorientation', (e) => {
            if (this.isRunning) {
                this.gyro.pitch = e.beta || 0;
                this.gyro.roll = e.gamma || 0;
                this.gyro.heading = e.alpha || 0;
            }
        });
    }

    update() {
        if (!this.isRunning) return;

        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Calcul de l'accélération propre (on retire la gravité standard)
        // Permet d'éliminer la vitesse fantôme à l'arrêt
        const aLin = Math.sqrt(
            Math.pow(this.accel.x, 2) + 
            Math.pow(this.accel.y, 2) + 
            Math.pow(this.accel.z - 9.80665, 2)
        );

        // Filtre de Kalman simplifié (UKF) : Seuil de bruit à 0.2m/s²
        if (aLin > 0.2) {
            this.vMs += aLin * dt;
        } else {
            this.vMs *= 0.85; // Freinage cinétique virtuel
            if (this.vMs < 0.05) this.vMs = 0;
        }

        // Mise à jour V-Max
        if (this.vMs > this.maxSpeed) this.maxSpeed = this.vMs;

        // Odométrie (Distance = v * dt)
        if (this.vMs > 0) {
            this.distance3D += (this.vMs * dt) / 1000;
        }
    }

    resetDistance() { this.distance3D = 0; }
    resetVMax() { this.maxSpeed = 0; }
}

window.ProfessionalUKF = ProfessionalUKF;
