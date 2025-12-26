/**
 * UKF LIB - INERTIE & LOI DE NEWTON PRO
 * Gère la conservation du mouvement tout en filtrant l'inclinaison statique.
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.distance3D = 0;
        this.mass = 70.0;
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.gLocal = 9.80665;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.lastTime = performance.now();
        this.initHardware();
    }

    initHardware() {
        window.addEventListener('devicemotion', (e) => {
            if (!e.accelerationIncludingGravity) return;
            this.accel.x = e.accelerationIncludingGravity.x || 0;
            this.accel.y = e.accelerationIncludingGravity.y || 0;
            this.accel.z = e.accelerationIncludingGravity.z || 9.80665;
            
            if (this.isRunning && !this.isCalibrated && this.calibSamples.length < 60) {
                const mag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
                this.calibSamples.push(mag);
                if (this.calibSamples.length === 60) {
                    this.gLocal = this.calibSamples.reduce((a,b)=>a+b)/60;
                    this.isCalibrated = true;
                }
            }
        });
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        const totalMag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        const netAcceleration = Math.abs(totalMag - this.gLocal);

        // --- LOGIQUE D'INERTIE VS FILTRE D'INCLINAISON ---
        if (netAcceleration > 0.5) { 
            // MOUVEMENT RÉEL : On ajoute l'accélération à la vitesse (V = V0 + a*t)
            // On projette l'accélération propre sur les axes
            this.velocityVec.x += this.accel.x * dt;
            this.velocityVec.y += this.accel.y * dt;
        } else if (netAcceleration < 0.1) {
            // INERTIE PURE : On ne touche à rien, la vitesse reste constante
            // (Loi de Newton : somme des forces = 0 => vitesse constante)
        } else {
            // ZONE GRISE (Bruit/Inclinaison) : On applique un léger amorti
            // pour éviter que la vitesse ne dérive à cause du bruit du capteur
            const damping = 0.02; 
            this.velocityVec.x *= (1 - damping);
            this.velocityVec.y *= (1 - damping);
        }

        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2);
        
        // Limiteur de sécurité pour le réalisme (Vitesse max humaine)
        if (this.vMs > 343) this.vMs = 343; // Limite Mach 1 par défaut

        this.distance3D += (this.vMs * dt) / 1000;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
