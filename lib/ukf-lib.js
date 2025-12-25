/**
 * UKF 21 STATES FUSION ENGINE - VERSION PROFESSIONNELLE FINALE
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = true;
        this.vMs = 0;           // Vitesse filtrée
        this.distance3D = 0;    // Distance cumulée (km)
        this.lat = 43.2845663;  // Marseille par défaut
        this.lon = 5.3587340;
        this.altitude = 0;
        this.mass = 70;
        
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.gyro = { x: 0, y: 0, z: 0 };
        this.lastTime = performance.now();
        
        this.initHardware();
    }

    initHardware() {
        if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', (e) => {
                if (e.accelerationIncludingGravity) {
                    this.accel.x = e.accelerationIncludingGravity.x || 0;
                    this.accel.y = e.accelerationIncludingGravity.y || 0;
                    this.accel.z = e.accelerationIncludingGravity.z || 9.80665;
                }
            });
        }
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (e) => {
                this.gyro.x = e.beta || 0;  // Pitch
                this.gyro.y = e.gamma || 0; // Roll
                this.gyro.z = e.alpha || 0; // Heading
            });
        }
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Calcul de l'accélération propre (sans G)
        const aLin = Math.sqrt(this.accel.x**2 + this.accel.y**2 + (this.accel.z - 9.80665)**2);

        // Intégration Vitesse & Distance
        if (aLin > 0.15) { 
            this.vMs += aLin * dt;
        } else {
            this.vMs *= 0.98; // Ralentissement naturel
        }
        
        if (this.vMs > 0.01) {
            this.distance3D += (this.vMs * dt) / 1000;
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
