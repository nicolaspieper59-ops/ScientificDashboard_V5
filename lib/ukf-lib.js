/**
 * UKF-LIB PRO : FUSION 9 AXES & NEWTON DYNAMICS
 * Gère la décélération comme opposé de l'accélération.
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.q = [1, 0, 0, 0]; // Quaternion pour l'orientation
        this.accelRaw = { x: 0, y: 0, z: 9.81 };
        this.gyroRaw = { alpha: 0, beta: 0, gamma: 0 };
        this.mass = 70.0;
        this.lastTime = performance.now();
        
        // Constantes Physiques
        this.C = 299792458;
        this.G = 6.67430e-11;
        this.RHO = 1.225; // Densité de l'air
        this.CD = 0.47;  // Coefficient de traînée
        this.AREA = 0.7; // Surface frontale
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        // 1. Mise à jour de l'orientation (Quaternions)
        this.integrateGyro(dt);

        // 2. Projection de la Gravité
        const gLocal = this.getGravityVector();

        // 3. Accélération Linéaire Pure (Sans Gravité)
        const aPure = {
            x: this.accelRaw.x - gLocal.x,
            y: this.accelRaw.y - gLocal.y,
            z: this.accelRaw.z - gLocal.z
        };

        // 4. LOI DE DÉCÉLÉRATION (L'opposé de l'accélération)
        // La force de traînée s'oppose au mouvement
        const dragForceMag = 0.5 * this.RHO * (this.vMs**2) * this.CD * this.AREA;
        const dragAccelMag = dragForceMag / this.mass;

        ['x', 'y', 'z'].forEach(axis => {
            const vDir = this.vMs > 1e-3 ? (this.velocityVec[axis] / this.vMs) : 0;
            
            // Accélération résultante = Poussée - Freinage (Opposé)
            const netA = aPure[axis] - (dragAccelMag * vDir);
            
            // Intégration d'Euler
            if (Math.abs(aPure[axis]) > 0.15) {
                this.velocityVec[axis] += netA * dt;
            } else {
                // Si aucune force n'est appliquée, la décélération (friction) prend le dessus
                this.velocityVec[axis] *= 0.97; 
            }
        });

        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        this.syncHTML(dt);
    }

    integrateGyro(dt) {
        const r = Math.PI / 180;
        const [w, x, y, z] = this.q;
        const gx = (this.gyroRaw.beta || 0) * r;
        const gy = (this.gyroRaw.gamma || 0) * r;
        const gz = (this.gyroRaw.alpha || 0) * r;

        const dq = [
            0.5 * (-x * gx - y * gy - z * gz),
            0.5 * (w * gx + y * gz - z * gy),
            0.5 * (w * gy - x * gz + z * gx),
            0.5 * (w * gz + x * gy - y * gx)
        ];

        this.q = this.q.map((v, i) => v + dq[i] * dt);
        const norm = Math.sqrt(this.q.reduce((a, b) => a + b * b, 0));
        this.q = this.q.map(v => v / (norm || 1));
    }

    getGravityVector() {
        const [w, x, y, z] = this.q;
        return {
            x: 2 * (x * z - w * y) * 9.81,
            y: 2 * (w * x + y * z) * 9.81,
            z: (w * w - x * x - y * y + z * z) * 9.81
        };
    }

    syncHTML(dt) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        
        // Vitesse & Relativité
        set('speed-main-display', (this.vMs * 3.6).toFixed(1));
        set('v-cosmic', (this.vMs * 3.6).toFixed(2) + " km/h");
        
        const beta = this.vMs / this.C;
        const gamma = 1 / Math.sqrt(1 - beta**2 || 1);
        set('lorentz-factor', gamma.toFixed(12));
        set('time-dilation', ((gamma - 1) * 1e9).toFixed(4));
        set('relativistic-energy', (gamma * this.mass * this.C**2).toExponential(3));
        
        // Physique
        set('kinetic-energy', (0.5 * this.mass * this.vMs**2).toFixed(2));
        set('drag-force', (0.5 * this.RHO * this.vMs**2 * this.CD * this.AREA).toFixed(2));
    }
                         }
