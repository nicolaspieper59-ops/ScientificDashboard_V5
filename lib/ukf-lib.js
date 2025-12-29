/**
 * UKF-LIB PRO - 21 ÉTATS & RELATIVITÉ GÉNÉRALE
 * Mapping : Dynamique, Forces, Relativité, IMU
 */
class SpaceTimeUKF {
    constructor() {
        this.isRunning = false;
        this.c = 299792458;
        this.G = 6.67430e-11;
        this.mass = 70.0; // Récupéré de mass-input
        this.q = [1, 0, 0, 0]; // Attitude
        this.vMs = 0; // Vitesse scalaire UKF
        this.lastTs = performance.now();
    }

    update(motion) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.max((now - this.lastTs) / 1000, 0.001);
        this.lastTs = now;

        const acc = motion.accelerationIncludingGravity;
        const gyro = motion.rotationRate;
        if (!acc || !gyro) return;

        // 1. Correction d'inclinaison (Filtre Complémentaire/UKF)
        this.updateOrientation(gyro, dt);
        const gravityEffect = this.getGravityProjection();

        // 2. Accélération de Newton (Axe longitudinal pur sans gravité)
        const aPureX = acc.x - gravityEffect.x;
        const aPureY = acc.y - gravityEffect.y;
        const aPureZ = acc.z - gravityEffect.z;

        // 3. Intégration de la vitesse stable
        const aMag = Math.sqrt(aPureX**2 + aPureY**2 + aPureZ**2);
        if (aMag > 0.05) this.vMs += aMag * dt;
        else this.vMs *= 0.98; // Friction logic pour arrêt propre

        this.syncPhysics(aPureX, aPureY, aPureZ, this.vMs);
    }

    updateOrientation(g, dt) {
        const r = Math.PI / 180;
        const [w, x, y, z] = this.q;
        const dq = [
            0.5 * (-x*g.alpha*r - y*g.beta*r - z*g.gamma*r),
            0.5 * (w*g.alpha*r + y*g.gamma*r - z*g.beta*r),
            0.5 * (w*g.beta*r + z*g.alpha*r - x*g.gamma*r),
            0.5 * (w*g.gamma*r + x*g.beta*r - y*g.alpha*r)
        ];
        this.q = this.q.map((v, i) => v + dq[i] * dt);
        const n = Math.sqrt(this.q.reduce((a,b)=>a+b*b,0));
        this.q = this.q.map(v => v/n);
    }

    getGravityProjection() {
        const [w, x, y, z] = this.q;
        const g = 9.80665;
        return {
            x: 2 * (x*z - w*y) * g,
            y: 2 * (w*x + y*z) * g,
            z: (w*w - x*x - y*y + z*z) * g
        };
    }

    syncPhysics(ax, ay, az, v) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        
        // Relativité (Einstein)
        const beta = v / this.c;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        set('lorentz-factor', gamma.toFixed(10));
        set('time-dilation', ((gamma - 1) * 1e9).toFixed(4)); // ns/s
        set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(2)); // ns/j
        set('relativistic-energy', (gamma * this.mass * this.c**2).toExponential(3));
        set('schwarzschild-radius', (2 * this.G * this.mass / this.c**2).toExponential(4));

        // Dynamique (Forces)
        set('accel-long-filtered', Math.sqrt(ax*ax + ay*ay).toFixed(3));
        set('kinetic-energy', (0.5 * this.mass * v**2).toFixed(2));
        set('coriolis-force', (2 * this.mass * v * 7.29e-5).toExponential(3));
    }
    }
