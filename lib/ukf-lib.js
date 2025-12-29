/**
 * UKF-LIB PRO - Moteur Tensoriel & Relativiste
 * Gère la fusion 9-axes et la physique avancée.
 */
class SpaceTimeUKF {
    constructor() {
        this.v = math.matrix([0, 0, 0]); // [vx, vy, vz] en m/s
        this.q = [1, 0, 0, 0];           // Quaternion [w, x, y, z]
        this.isRunning = false;
        this.mass = 70.0;
        this.c = 299792458;
        this.G = 6.67430e-11;
        this.lastTs = performance.now();
    }

    // Mise à jour de l'orientation et calcul de l'accélération propre
    predict(motion) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.max((now - this.lastTs) / 1000, 0.001);
        this.lastTs = now;

        const acc = motion.accelerationIncludingGravity;
        const gyro = motion.rotationRate;
        if (!acc || !gyro) return;

        // 1. Intégration Gyro -> Quaternion (Salto/Inclinaison)
        this.updateQuaternion(gyro, dt);

        // 2. Projection Monde (Soustraction de Gravité par rotation inverse)
        const aWorld = this.getWorldAcc(acc);

        // 3. Intégration Vitesse
        this.v = math.add(this.v, math.multiply(aWorld, dt));
        const vMs = math.norm(this.v);

        this.syncPhysicsUI(aWorld, vMs, dt);
    }

    updateQuaternion(g, dt) {
        const rad = Math.PI / 180;
        const [w, x, y, z] = this.q;
        const dq = [
            0.5 * (-x * g.alpha * rad - y * g.beta * rad - z * g.gamma * rad),
            0.5 * ( w * g.alpha * rad + y * g.gamma * rad - z * g.beta * rad),
            0.5 * ( w * g.beta * rad + z * g.alpha * rad - x * g.gamma * rad),
            0.5 * ( w * g.gamma * rad + x * g.beta * rad - y * g.alpha * rad)
        ];
        this.q = this.q.map((v, i) => v + dq[i] * dt);
        const n = Math.sqrt(this.q.reduce((a, b) => a + b*b, 0));
        this.q = this.q.map(v => v / n);
    }

    getWorldAcc(a) {
        const [w, x, y, z] = this.q;
        // Matrice de rotation inverse (Monde -> Local)
        const rMat = [
            [1-2*(y*y+z*z), 2*(x*y-w*z), 2*(x*z+w*y)],
            [2*(x*y+w*z), 1-2*(x*x+z*z), 2*(y*z-w*x)],
            [2*(x*z-w*y), 2*(y*z+w*x), 1-2*(x*x+y*y)]
        ];
        // Accel Monde = (R * a_local) - [0,0,9.806]
        const awx = rMat[0][0]*a.x + rMat[0][1]*a.y + rMat[0][2]*a.z;
        const awy = rMat[1][0]*a.x + rMat[1][1]*a.y + rMat[1][2]*a.z;
        const awz = rMat[2][0]*a.x + rMat[2][1]*a.y + rMat[2][2]*a.z - 9.80665;
        return math.matrix([awx, awy, awz]);
    }

    syncPhysicsUI(aWorld, vMs, dt) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        
        // Relativité
        const beta = vMs / this.c;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        set('lorentz-factor', gamma.toFixed(10));
        set('time-dilation', ((gamma - 1) * 1e9).toFixed(4) + " ns/s");
        set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j");
        
        const energy = gamma * this.mass * Math.pow(this.c, 2);
        set('relativistic-energy', energy.toExponential(3) + " J");
        set('rest-mass-energy', (this.mass * Math.pow(this.c, 2)).toExponential(3) + " J");
        
        // Rayon de Schwarzschild
        const rs = (2 * this.G * this.mass) / Math.pow(this.c, 2);
        set('schwarzschild-radius', rs.toExponential(4) + " m");

        // Dynamique
        const accLong = math.subset(aWorld, math.index(0));
        set('accel-long-2', accLong.toFixed(3) + " m/s²");
        set('kinetic-energy', (0.5 * this.mass * vMs**2).toFixed(2) + " J");
    }
                   }
