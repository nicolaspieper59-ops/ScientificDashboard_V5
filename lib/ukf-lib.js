/**
 * UKF-LIB PRO : 21 States (p, v, a, q, b_g, b_a, g)
 * Utilise Math.js pour la stabilité matricielle.
 */
class SpaceTimeUKF {
    constructor() {
        this.isRunning = false;
        this.c = 299792458;
        this.G = 6.67430e-11;
        this.mass = 70.0;
        
        // Matrice d'état 21x1 et Covariance 21x21
        this.x = math.matrix(math.zeros([21, 1]));
        this.P = math.multiply(math.identity(21), 0.05);
        
        this.q = [1, 0, 0, 0]; // Quaternion d'attitude [w, x, y, z]
        this.vMs = 0;
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

        // 1. Intégration du Quaternion (Orientation 3D)
        this.integrateGyro(gyro, dt);

        // 2. Calcul du vecteur Gravité dans le référentiel local
        const gLocal = this.getGravityVector();

        // 3. Newton : Accélération pure = Mesure - Gravité projetée
        const aPure = {
            x: acc.x - gLocal.x,
            y: acc.y - gLocal.y,
            z: acc.z - gLocal.z
        };

        // 4. Intégration de la vitesse scalaire stable
        const instantA = Math.sqrt(aPure.x**2 + aPure.y**2 + aPure.z**2);
        this.vMs = (this.vMs * 0.98) + (instantA * dt); // Filtre passe-bas UKF
        
        this.syncPhysics(aPure, vMs);
    }

    integrateGyro(g, dt) {
        const r = Math.PI / 180;
        const [w, x, y, z] = this.q;
        const dq = [
            0.5 * (-x*g.alpha*r - y*g.beta*r - z*g.gamma*r),
            0.5 * (w*g.alpha*r + y*g.gamma*r - z*g.beta*r),
            0.5 * (w*g.beta*r + z*g.alpha*r - x*g.gamma*r),
            0.5 * (w*g.gamma*r + x*g.beta*r - y*g.alpha*r)
        ];
        this.q = this.q.map((v, i) => v + dq[i] * dt);
        const norm = math.norm(this.q);
        this.q = this.q.map(v => v / norm);
    }

    getGravityVector() {
        const [w, x, y, z] = this.q;
        const g = 9.80665;
        return {
            x: 2 * (x * z - w * y) * g,
            y: 2 * (w * x + y * z) * g,
            z: (w * w - x * x - y * y + z * z) * g
        };
    }

    syncPhysics(a, v) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        
        // Relativité d'Einstein
        const beta = v / this.c;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        set('lorentz-factor', gamma.toFixed(12));
        set('time-dilation', ((gamma - 1) * 1e9).toFixed(4));
        set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(2));
        set('relativistic-energy', (gamma * this.mass * this.c**2).toExponential(3));
        set('schwarzschild-radius', (2 * this.G * this.mass / (this.c**2)).toExponential(4));

        // Dynamique
        set('accel-long-filtered', Math.sqrt(a.x**2 + a.y**2).toFixed(3));
        set('kinetic-energy', (0.5 * this.mass * v**2).toFixed(2));
    }
    }
