/**
 * UKF 21 STATES - NEWTONIAN DYNAMICS
 * Application du principe d'Action-Réaction pour la stabilisation
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;           // Scalaire de vitesse
        this.velocityVec = { x: 0, y: 0, z: 0 }; // Vecteur vitesse 3D
        this.distance3D = 0;
        this.maxSpeed = 0;
        this.mass = 70;
        this.isNetherMode = false;
        
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.lastTime = performance.now();
        this.initHardware();
    }

    initHardware() {
        window.addEventListener('devicemotion', (e) => {
            if (this.isRunning && e.accelerationIncludingGravity) {
                // Captures des accélérations sur les 3 axes
                this.accel.x = e.accelerationIncludingGravity.x || 0;
                this.accel.y = e.accelerationIncludingGravity.y || 0;
                this.accel.z = e.accelerationIncludingGravity.z || 9.80665;
            }
        });
    }

    update() {
        if (!this.isRunning) return;

        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // 1. Calcul de l'accélération linéaire pure (retrait de la gravité sur Z)
        const linAccel = {
            x: this.accel.x,
            y: this.accel.y,
            z: this.accel.z - 9.80665
        };

        // 2. PRINCIPE DE NEWTON : Décélération proportionnelle opposée
        // Si l'accélération appliquée est faible, la résistance (frottement/inertie) 
        // devient dominante et s'oppose au mouvement sur chaque axe.
        const frictionCoeff = 0.15; // Coefficient de résistance aérodynamique/sol

        ['x', 'y', 'z'].forEach(axis => {
            // Force motrice (F = ma)
            const a = linAccel[axis];
            
            // Si l'accélération est sous un seuil, on applique l'opposé de la vitesse actuelle (freinage)
            if (Math.abs(a) < 0.2) {
                const deceleration = -this.velocityVec[axis] * frictionCoeff;
                this.velocityVec[axis] += deceleration * dt;
            } else {
                this.velocityVec[axis] += a * dt;
            }
        });

        // 3. Calcul de la norme du vecteur vitesse (Vitesse réelle 3D)
        this.vMs = Math.sqrt(
            Math.pow(this.velocityVec.x, 2) + 
            Math.pow(this.velocityVec.y, 2) + 
            Math.pow(this.velocityVec.z, 2)
        );

        // Stabilisation finale (Zero-drift)
        if (this.vMs < 0.01) {
            this.vMs = 0;
            this.velocityVec = { x: 0, y: 0, z: 0 };
        }

        // 4. Distance avec multiplicateur Nether
        const multiplier = this.isNetherMode ? 8 : 1;
        this.distance3D += (this.vMs * dt * multiplier) / 1000;

        if (this.vMs > this.maxSpeed) this.maxSpeed = this.vMs;
    }
}
window.MainEngine = new ProfessionalUKF();
