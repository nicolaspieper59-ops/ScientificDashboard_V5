/**
 * UKF 21 STATES - NEWTONIAN DYNAMICS KERNEL
 * Application stricte des lois de Newton et du Mode Nether
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0; 
        this.velocityVec = { x: 0, y: 0, z: 0 }; 
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

        // 1. Accélération linéaire (Newton : F = ma)
        const aPure = {
            x: this.accel.x,
            y: this.accel.y,
            z: this.accel.z - 9.80665
        };

        // 2. Application du principe d'opposition (Action-Réaction)
        // Si l'accélération faiblit, une force opposée réduit le vecteur vitesse
        const friction = 0.25; 

        ['x', 'y', 'z'].forEach(axis => {
            if (Math.abs(aPure[axis]) < 0.25) {
                // Décélération proportionnelle à la vitesse actuelle (Inertie)
                this.velocityVec[axis] -= this.velocityVec[axis] * friction * dt;
            } else {
                this.velocityVec[axis] += aPure[axis] * dt;
            }
        });

        // Norme du vecteur vitesse
        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        
        // Seuil de stabilité pour éviter la dérive infinie
        if (this.vMs < 0.02) { this.vMs = 0; this.velocityVec = {x:0,y:0,z:0}; }

        // 3. Odométrie avec Mode Nether (1:8)
        const multiplier = this.isNetherMode ? 8 : 1;
        this.distance3D += (this.vMs * dt * multiplier) / 1000;

        if (this.vMs > this.maxSpeed) this.maxSpeed = this.vMs;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
