class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.pos = { x: 0, y: 0, z: 0 };
        this.vel = { x: 0, y: 0, z: 0, ms: 0 };
        this.bias = { x: 0, y: 0, z: 0 };
        this.distance3D = 0;
        this.gForce = 1.0;
        this.lastTime = performance.now();
    }

    calibrate(samples) {
        let s = { x: 0, y: 0, z: 0 };
        samples.forEach(v => { s.x += v.x; s.y += v.y; s.z += (v.z - 9.80665); });
        this.bias = { x: s.x/samples.length, y: s.y/samples.length, z: s.z/samples.length };
    }

    update(e) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        const a = e.accelerationIncludingGravity || {x:0, y:0, z:9.80665};
        this.gForce = Math.sqrt(a.x**2 + a.y**2 + a.z**2) / 9.80665;

        ['x','y','z'].forEach(axis => {
            let raw = (a[axis] || 0) - (axis === 'z' ? 9.80665 : 0) - this.bias[axis];
            
            // Correction mathématique : suppression du bruit statique
            if (Math.abs(raw) < 0.08) raw = 0; 
            
            this.vel[axis] += raw * dt;
            
            // Friction numérique pour éviter la dérive infinie
            if (raw === 0) this.vel[axis] *= 0.95; 

            this.pos[axis] += this.vel[axis] * dt;
        });

        this.vel.ms = Math.sqrt(this.vel.x**2 + this.vel.y**2 + this.vel.z**2);
        this.distance3D += this.vel.ms * dt;
    }
                              }
