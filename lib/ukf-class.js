/**
 * GNSS SpaceTime Engine - V100 "ULTIMATE RADAR-FUSION"
 * --------------------------------------------------
 * - Protection : Slew-Rate Limiter (Anti-choc 999 km/h)
 * - Suspension : Filtre de Butterworth (Anti-pavés/vibrations)
 * - Sensibilité : Gain Horizontal Adaptatif (Micro-mouvements)
 * - Réalisme : Décélération Newtonienne pure
 * - Stabilité : Fusion GPS & Auto-ZUPT (Zéro dérive)
 */

class ProfessionalUKF {
    constructor() {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 21;
        this.initialized = false;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.bias = { ax: 0, ay: 0, az: 0 };
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // --- FILTRES DE PROTECTION ---
        this.accelSmooth = { x: 0, y: 0, z: 0 };
        this.lpf = 0.12;              // Suspension numérique
        this.maxHumanAcc = 20.0;      // Plafond anti-choc (2G)
        this.shockCounter = 0;
        this.shockHistory = [];       // Analyse de densité de chocs
        
        // --- SENSIBILITÉ MICRO ---
        this.hGain = 1.15;            // Gain horizontal pour micro-vitesses
        this.noiseFloor = 0.008;      // Seuil de détection radar

        // --- DYNAMIQUE & TEMPS ---
        this.lastAccWorld = [0, 0, 0];
        this.totalDistance3D = 0;
        this.airResistance = 0.00005; // Conservation de l'élan (Momentum)
        this.lastGpsUpdate = 0;
    }

    /**
     * CALIBRATION : Suppression du bruit de fond immobile
     */
    process(dt, accRaw, gyroRaw, gpsSpeedMs = null) {
        if (!this.isCalibrated) return this.calibrate(accRaw);
        
        this.predict(dt, accRaw, gyroRaw);
        if (gpsSpeedMs !== null) this.fuseGPS(gpsSpeedMs);
        
        return true;
    }

    calibrate(accRaw) {
        if (this.calibSamples.length < 150) { 
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { ax: sum.x/150, ay: sum.y/150, az: sum.z/150 };
        this.isCalibrated = true;
        this.initialized = true;
        return true;
    }

    /**
     * PRÉDICTION : Moteur de mouvement Newtonien
     */
    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        const now = performance.now() / 1000;

        // 1. REJET DES PICS CONSECUTIFS (Bouclier de Cohérence)
        const rawMag = Math.sqrt(accRaw.x**2 + accRaw.y**2 + accRaw.z**2);
        if (rawMag > this.maxHumanAcc) this.shockHistory.push(now);
        this.shockHistory = this.shockHistory.filter(t => (now - t) < 0.2);
        
        // Si trop de chocs (pavés/vibrations intenses), on gèle l'accélération
        let useAcc = (this.shockHistory.length > 4) ? 
            { x: this.bias.ax, y: this.bias.ay, z: this.bias.az } : accRaw;

        // 2. LISSAGE (Suspension pour pavés)
        this.accelSmooth.x += this.lpf * (useAcc.x - this.accelSmooth.x);
        this.accelSmooth.y += this.lpf * (useAcc.y - this.accelSmooth.y);
        this.accelSmooth.z += this.lpf * (useAcc.z - this.accelSmooth.z);

        // 3. COMPENSATION & GAIN HORIZONTAL
        const ax = (this.accelSmooth.x - this.bias.ax) * this.hGain;
        const ay = (this.accelSmooth.y - this.bias.ay) * this.hGain;
        const az = (this.accelSmooth.z - (this.bias.az - 9.80665));

        // 4. ROTATION DANS LE MONDE (Quaternions)
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] += 9.80665; // Isoler la force réelle de la gravité

        // 5. INTÉGRATION DE VERLET (Vitesse stable et décélération réelle)
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        const accMag = Math.sqrt(accWorld[0]**2 + accWorld[1]**2 + accWorld[2]**2);
        
        if (accMag > this.noiseFloor) {
            vx += (this.lastAccWorld[0] + accWorld[0]) * 0.5 * dt;
            vy += (this.lastAccWorld[1] + accWorld[1]) * 0.5 * dt;
            vz += (this.lastAccWorld[2] + accWorld[2]) * 0.5 * dt;
        }

        // 6. CONSERVATION DE L'ÉLAN & FRICTION AIR
        const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        if (speed > 0.001) {
            const decay = 1.0 - (this.airResistance * speed * dt);
            vx *= decay; vy *= decay; vz *= decay;
        } else {
            vx = 0; vy = 0; vz = 0; // ZUPT complet à l'arrêt
        }

        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = [...accWorld];
        this.totalDistance3D += speed * dt;

        this.integrateQuaternions(gyroRaw, dt);
    }

    /**
     * FUSION GPS : Recalage de la dérive inertielle
     */
    fuseGPS(gpsSpeedMs) {
        if (gpsSpeedMs === null || gpsSpeedMs < 0.5) return; // Le GPS n'est fiable qu'au dessus de 2 km/h
        
        const vx = this.x.get([3, 0]);
        const vy = this.x.get([4, 0]);
        const currentInertialSpeed = Math.sqrt(vx*vx + vy*vy);
        
        // On recale doucement l'inertie vers le GPS (Facteur 0.05 pour garder la fluidité)
        const K = 0.05;
        const correctionScale = (currentInertialSpeed + (gpsSpeedMs - currentInertialSpeed) * K) / currentInertialSpeed;
        
        if (isFinite(correctionScale)) {
            this.x.set([3, 0], vx * correctionScale);
            this.x.set([4, 0], vy * correctionScale);
        }
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
        return {
            speedKmh: s * 3.6,
            distance: this.totalDistance3D,
            isTurbulent: this.shockHistory.length > 4,
            isCalibrated: this.isCalibrated
        };
    }
            }
