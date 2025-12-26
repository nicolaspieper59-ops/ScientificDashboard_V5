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
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Sécurité anti-saut
        this.lastTime = now;

        // Loi de Newton : Force d'opposition
        const aPure = { x: this.accel.x, y: this.accel.y, z: this.accel.z - 9.80665 };
        const friction = 0.4; // Force de rappel Newtonienne

        ['x', 'y', 'z'].forEach(axis => {
            if (Math.abs(aPure[axis]) < 0.3) {
                // Application de l'opposé de la vitesse pour décélérer (Newton)
                this.velocityVec[axis] -= this.velocityVec[axis] * friction;
            } else {
                this.velocityVec[axis] += aPure[axis] * dt;
            }
        });

        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        if (this.vMs < 0.02) { this.vMs = 0; this.velocityVec = {x:0,y:0,z:0}; }

        const multiplier = this.isNetherMode ? 8 : 1;
        this.distance3D += (this.vMs * dt * multiplier) / 1000;
        if ((this.vMs * 3.6) > this.maxSpeed) this.maxSpeed = this.vMs * 3.6;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
