class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.pos = { x: 0, y: 0, z: 0 };
        this.vel = { x: 0, y: 0, z: 0, ms: 0 };
        this.distance3D = 0;
        this.bias = { x: 0, y: 0, z: 0 };
        this.lastTime = performance.now();
    }

    calibrate(samples) {
        let sx=0, sy=0, sz=0;
        samples.forEach(s => { sx+=s.x; sy+=s.y; sz+=(s.z-9.80665); });
        this.bias = { x: sx/samples.length, y: sy/samples.length, z: sz/samples.length };
    }

    update(e) {
        if (!this.isRunning) return;
        let now = performance.now();
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        let a = e.accelerationIncludingGravity;
        if (!a) return;

        // Calcul G-Force Scientifique
        let g = Math.sqrt(a.x**2 + a.y**2 + a.z**2) / 9.80665;
        document.getElementById('g-force').textContent = g.toFixed(3);

        // Intégration de mouvement (Axe Z corrigé de la gravité)
        let ax = a.x - this.bias.x;
        let ay = a.y - this.bias.y;
        let az = (a.z - 9.80665) - this.bias.z;

        // ZUPT (Zero Velocity Update) : Filtre de bruit statique
        if (Math.abs(ax) < 0.1) ax = 0;
        if (Math.abs(ay) < 0.1) ay = 0;
        if (Math.abs(az) < 0.1) az = 0;

        this.vel.x += ax * dt;
        this.vel.y += ay * dt;
        this.vel.z += az * dt;

        this.vel.ms = Math.sqrt(this.vel.x**2 + this.vel.y**2 + this.vel.z**2);
        this.distance3D += this.vel.ms * dt;
    }
}
const engine = new ProfessionalUKF();
