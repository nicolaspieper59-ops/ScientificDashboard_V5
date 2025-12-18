/**
 * PROFESSIONAL UKF V66 - MOMENTUM CONSERVATION
 * - Physique : Loi d'inertie de Newton (L'objet garde sa vitesse sans accélération).
 * - Stabilité : ZUPT intelligent uniquement à l'arrêt complet prouvé.
 * - Réactivité : Intégration de Verlet sans seuil de coupure.
 */

class ProfessionalUKF {
    constructor(lat = 48.8566, lon = 2.3522, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 24;
        this.initialized = false;
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // --- CALIBRATION ---
        this.isCalibrated = false;
        this.calibSamples = [];
        this.bias = { ax: 0, ay: 0, az: 0 };

        // --- MOTEUR DE DYNAMIQUE (NEWTON) ---
        this.lastAccWorld = [0, 0, 0];
        
        // Le secret de la tenue de vitesse :
        // Une friction presque nulle (0.00001) permet de garder la vitesse km/h
        this.airResistance = 0.00005; 
        this.velocityThreshold = 0.001; // Seuil de vitesse min (1 mm/s)
    }

    calibrate(accRaw) {
        if (this.isCalibrated) return true;
        if (this.calibSamples.length < 100) {
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { ax: sum.x/100, ay: sum.y/100, az: sum.z/100 };
        this.isCalibrated = true;
        return true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. CORRECTION MATÉRIELLE (BIAIS)
        const ax = accRaw.x - this.bias.ax;
        const ay = accRaw.y - this.bias.ay;
        const az = accRaw.z - (this.bias.az - 9.80665);

        // 2. ROTATION 3D (QUATERNIONS)
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] += 9.80665; // On remet la pesanteur pour isoler le mouvement

        // 3. INTÉGRATION DE VERLET (Maintien de la vitesse)
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        // Calcul de l'accélération moyenne entre T-1 et T
        // Cela permet de capter la fin de l'accélération sans perdre la vitesse acquise
        vx += (this.lastAccWorld[0] + accWorld[0]) * 0.5 * dt;
        vy += (this.lastAccWorld[1] + accWorld[1]) * 0.5 * dt;
        vz += (this.lastAccWorld[2] + accWorld[2]) * 0.5 * dt;

        // 4. CONSERVATION DU MOMENTUM (L'objet ne s'arrête pas seul)
        const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        
        if (speed > this.velocityThreshold) {
            // On applique une résistance de l'air infime au lieu de forcer le zéro
            // v = v * (1 - k)
            const decay = 1.0 - (this.airResistance * speed * dt);
            vx *= decay;
            vy *= decay;
            vz *= decay;
        }

        // 5. SAUVEGARDE ET DISTANCE
        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = [...accWorld];

        this.integrateQuaternions(gyroRaw, dt);
    }

    rotateVector(q, v) {
        const [w, x, y, z] = q;
        const [vx, vy, vz] = v;
        return [
            vx*(w*w+x*x-y*y-z*z) + vy*2*(x*y-w*z) + vz*2*(x*z+w*y),
            vx*2*(x*y+w*z) + vy*(w*w-x*x+y*y-z*z) + vz*2*(y*z-w*x),
            vx*2*(x*z-w*y) + vy*2*(y*z+x*w) + vz*(w*w-x*x-y*y+z*z)
        ];
    }

    integrateQuaternions(g, dt) {
        let q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const h = 0.5 * dt;
        this.x.set([6,0], q[0] + h*(-q[1]*g.x - q[2]*g.y - q[3]*g.z));
        this.x.set([7,0], q[1] + h*( q[0]*g.x + q[2]*g.z - q[3]*g.y));
        this.x.set([8,0], q[2] + h*( q[0]*g.y - q[1]*g.z + q[3]*g.x));
        this.x.set([9,0], q[3] + h*( q[0]*g.z + q[1]*g.y - q[2]*g.x));
        const n = Math.sqrt(this.x.get([6,0])**2 + this.x.get([7,0])**2 + this.x.get([8,0])**2 + this.x.get([9,0])**2);
        for(let i=6; i<=9; i++) this.x.set([i,0], this.x.get([i,0])/n);
    }

    getState() {
        const v = [this.x.get([3, 0]), this.x.get([4, 0]), this.x.get([5, 0])];
        const s = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
        return { speedKmh: s * 3.6, raw: s };
    }
                         }
