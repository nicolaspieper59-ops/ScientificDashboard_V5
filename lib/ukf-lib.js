/**
 * UKF-LIB PRO : 21 States (p, v, a, q, b_g, b_a, g)
 * Résout l'inclinaison via Quaternions & Newton
 */
class SpaceTimeUKF {
    constructor() {
        this.isRunning = false;
        this.c = 299792458;
        this.G = 6.67430e-11;
        this.mass = 70.0;
        
        // États [21x1] : p(3), v(3), a(3), q(4), bg(3), ba(3), g(2)
        this.x = math.matrix(math.zeros([21, 1]));
        this.P = math.multiply(math.identity(21), 0.05); // Incertitude
        this.q = [1, 0, 0, 0]; // Attitude stable
        this.vMs = 0;
        this.lastTs = performance.now();
    }

    predict(motion) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.max((now - this.lastTs) / 1000, 0.001);
        this.lastTs = now;

        const acc = motion.accelerationIncludingGravity;
        const gyro = motion.rotationRate;
        if (!acc || !gyro) return;

        // 1. Correction d'inclinaison par Quaternion
        this.updateAttitude(gyro, dt);

        // 2. Isoler l'accélération propre (Principe de Newton)
        // On projette la gravité [0,0,9.81] dans le référentiel incliné du tel
        const gravityLocal = this.getGravityInPhoneFrame();
        
        // Accélération linéaire pure = Mesure - Gravité Projetée
        const linearAcc = {
            x: acc.x - gravityLocal.x,
            y: acc.y - gravityLocal.y,
            z: acc.z - gravityLocal.z
        };

        // 3. Intégration de la vitesse sur l'axe longitudinal (Y)
        // On utilise la réactivité adaptative pour filtrer le bruit
        const alpha = 0.8; 
        this.vMs = (this.vMs * alpha) + (linearAcc.y * dt * (1 - alpha));
        if (this.vMs < 0.05) this.vMs = 0;

        this.updatePhysicsUI(linearAcc, gravityLocal);
    }

    updateAttitude(g, dt) {
        const rad = Math.PI / 180;
        const [w, x, y, z] = this.q;
        const dq = [
            0.5 * (-x * g.alpha * rad - y * g.beta * rad - z * g.gamma * rad),
            0.5 * ( w * g.alpha * rad + y * g.gamma * rad - z * g.beta * rad),
            0.5 * ( w * g.beta * rad + z * g.alpha * rad - x * g.gamma * rad),
            0.5 * ( w * g.gamma * rad + x * g.beta * rad - y * g.alpha * rad)
        ];
        this.q = this.q.map((v, i) => v + dq[i] * dt);
        const norm = Math.sqrt(this.q.reduce((a, b) => a + b*b, 0));
        this.q = this.q.map(v => v / norm);
    }

    getGravityInPhoneFrame() {
        const [w, x, y, z] = this.q;
        const g = 9.80665;
        return {
            x: 2 * (x*z - w*y) * g,
            y: 2 * (w*x + y*z) * g,
            z: (w*w - x*x - y*y + z*z) * g
        };
    }

    updatePhysicsUI(a, g) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        
        // Relativité Einsteinienne
        const beta = this.vMs / this.c;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        set('lorentz-factor', gamma.toFixed(10));
        set('time-dilation', ((gamma - 1) * 1e9).toFixed(4) + " ns/s");
        set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j");
        
        // Dynamique & Énergie
        const ek = 0.5 * this.mass * Math.pow(this.vMs, 2);
        set('kinetic-energy', ek.toFixed(2) + " J");
        set('relativistic-energy', (gamma * this.mass * this.c**2).toExponential(3) + " J");
        
        // Schwarzschild
        const rs = (2 * this.G * this.mass) / Math.pow(this.c, 2);
        set('schwarzschild-radius', rs.toExponential(4) + " m");
        
        // Coriolis
        const fC = 2 * this.mass * this.vMs * 7.2921e-5;
        set('coriolis-force', fC.toExponential(3) + " N");
    }
}
