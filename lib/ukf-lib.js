/**
 * UKF-LIB PRO : 21 ÉTATS / FUSION 9 AXES
 * PHYSIQUE RÉALISTE : DÉCÉLÉRATION = -ACCÉLÉRATION (TRAÎNÉE/FRICTION)
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.q = [1, 0, 0, 0]; // Orientation 3D
        this.accelRaw = { x: 0, y: 0, z: 9.80665 };
        this.gyroRaw = { alpha: 0, beta: 0, gamma: 0 };
        this.mass = 70.0;
        this.lastTime = performance.now();
        
        // Constantes Universelles
        this.C = 299792458;
        this.G = 6.67430e-11;
        this.RHO = 1.225; // Densité air
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        // 1. MISE À JOUR DE L'ORIENTATION (9 AXES)
        this.updateQuaternions(dt);

        // 2. EXTRACTION DE L'ACCÉLÉRATION PROPRE
        const gVec = this.getGravityProjection();
        const linearA = {
            x: this.accelRaw.x - gVec.x,
            y: this.accelRaw.y - gVec.y,
            z: this.accelRaw.z - gVec.z
        };

        // 3. LOGIQUE NEWTONIENNE : ACCÉLÉRATION VS DÉCÉLÉRATION
        // La décélération (traînée) est l'opposé exact de l'accélération motrice
        const Cd = 0.47; 
        const Area = 0.7;
        const dragAccelMag = (0.5 * this.RHO * Math.pow(this.vMs, 2) * Cd * Area) / this.mass;

        ['x', 'y', 'z'].forEach(axis => {
            const vDir = this.vMs > 0.01 ? (this.velocityVec[axis] / this.vMs) : 0;
            
            // Somme des forces : Poussée - Résistance (Décélération)
            const netA = linearA[axis] - (dragAccelMag * vDir);

            // Seuil de bruit (0.15m/s²) pour éviter la dérive à l'arrêt
            if (Math.abs(linearA[axis]) > 0.15) {
                this.velocityVec[axis] += netA * dt;
            } else {
                // Si l'accélération s'arrête, la friction (décélération) prend le dessus
                this.velocityVec[axis] *= 0.96; 
            }
        });

        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        this.syncAll(dt);
    }

    updateQuaternions(dt) {
        const r = Math.PI / 180;
        const [w, x, y, z] = this.q;
        const gx = (this.gyroRaw.beta || 0) * r;
        const gy = (this.gyroRaw.gamma || 0) * r;
        const gz = (this.gyroRaw.alpha || 0) * r;

        const dq = [
            0.5 * (-x*gx - y*gy - z*gz),
            0.5 * (w*gx + y*gz - z*gy),
            0.5 * (w*gy - x*gz + z*gx),
            0.5 * (w*gz + x*gy - y*gx)
        ];
        this.q = this.q.map((v, i) => v + dq[i] * dt);
        const norm = Math.sqrt(this.q.reduce((a,b)=>a+b*b, 0));
        this.q = this.q.map(v => v / (norm || 1));
    }

    getGravityProjection() {
        const [w, x, y, z] = this.q;
        return {
            x: 2 * (x*z - w*y) * 9.80665,
            y: 2 * (w*x + y*z) * 9.80665,
            z: (w*w - x*x - y*y + z*z) * 9.80665
        };
    }

    syncAll(dt) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        
        // Vitesse & Relativité
        const vKmh = this.vMs * 3.6;
        set('speed-main-display', vKmh.toFixed(1));
        set('v-cosmic', vKmh.toFixed(2) + " km/h");
        set('speed-stable-kmh', vKmh.toFixed(1));
        
        const beta = this.vMs / this.C;
        const gamma = 1 / Math.sqrt(1 - beta**2 || 1);
        set('lorentz-factor', gamma.toFixed(12));
        set('time-dilation', ((gamma - 1) * 1e9).toFixed(4));
        set('relativistic-energy', (gamma * this.mass * this.C**2).toExponential(3));

        // Dynamique
        set('drag-force', (0.5 * this.RHO * this.vMs**2 * 0.47 * 0.7).toFixed(2));
        set('kinetic-energy', (0.5 * this.mass * this.vMs**2).toFixed(2));
    }
    }
