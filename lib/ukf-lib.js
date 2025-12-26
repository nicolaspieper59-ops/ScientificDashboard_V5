class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 }; // Vecteur 3D Newton
        this.distance3D = 0;
        this.maxSpeed = 0;
        this.mass = 70;
        this.isNetherMode = false;
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.lastTime = performance.now();
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        if (dt <= 0) return;
        this.lastTime = now;

        // Loi de Newton : On sépare l'accélération propre de la gravité
        const aPure = {
            x: this.accel.x,
            y: this.accel.y,
            z: this.accel.z - 9.80665
        };

        // Décélération d'opposition (Newton : l'opposé de la vitesse)
        const friction = 0.3; // Résistance de l'air/frottement

        ['x', 'y', 'z'].forEach(axis => {
            // Si pas d'accélération détectée (> seuil de bruit)
            if (Math.abs(aPure[axis]) < 0.2) {
                // On applique la décélération opposée au mouvement actuel
                this.velocityVec[axis] -= this.velocityVec[axis] * friction * dt * 10;
            } else {
                this.velocityVec[axis] += aPure[axis] * dt;
            }
        });

        // Calcul de la vitesse scalaire
        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        
        // Stabilisation (Arrêt total si vitesse infime)
        if (this.vMs < 0.01) { this.vMs = 0; this.velocityVec = {x:0,y:0,z:0}; }

        // Odométrie : Distance avec multiplicateur Nether
        const multiplier = this.isNetherMode ? 8 : 1;
        this.distance3D += (this.vMs * dt * multiplier) / 1000;

        if (this.vMs > this.maxSpeed) this.maxSpeed = this.vMs;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
