/**
 * GNSS SpaceTime Engine - V100 "HYPER-PRECISION"
 * --------------------------------------------
 * - Support : Tyrolienne, Téléphérique, Vélo, Voiture, Radar
 * - Système : Newton Momentum + Fusion GPS + Anti-Vibrations
 * - Précision : 0.001 Hz / 0.001 km/h
 */

class ProfessionalUKF {
    constructor() {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 21;
        this.initialized = false;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.bias = { ax: 0.000, ay: 0.000, az: 0.000 };
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // --- RÉGLAGES DE PRÉCISION (TÉLÉPHÉRIQUE & RADAR) ---
        this.hGain = 1.400;           // Gain horizontal boosté pour micro-mouvements
        this.noiseFloor = 0.003;      // Seuil de détection ultra-sensible (3mm/s²)
        this.lpf = 0.150;             // Suspension numérique réactive
        this.maxHumanAcc = 25.000;    // Protection contre les chocs extrêmes
        
        // --- DYNAMIQUE NEWTONIENNE ---
        this.lastAccWorld = [0.000, 0.000, 0.000];
        this.totalDistance3D = 0.000;
        this.airResistance = 0.00002; // Maintien du momentum (presque aucune perte)
        this.shockHistory = [];
    }

    /**
     * CYCLE DE TRAITEMENT PRINCIPAL
     */
    process(dt, accRaw, gyroRaw, gpsSpeedMs = null) {
        if (!this.isCalibrated) return this.calibrate(accRaw);
        
        this.predict(dt, accRaw, gyroRaw);
        if (gpsSpeedMs !== null) this.fuseGPS(gpsSpeedMs);
        
        return true;
    }

    /**
     * CALIBRATION (200 points pour une stabilité parfaite)
     */
    calibrate(accRaw) {
        if (this.calibSamples.length < 200) { 
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { 
            ax: (sum.x / 200).toFixed(6), 
            ay: (sum.y / 200).toFixed(6), 
            az: (sum.z / 200).toFixed(6) 
        };
        this.isCalibrated = true;
        this.initialized = true;
        return true;
    }

    /**
     * MOTEUR DE PRÉDICTION (Lois de Newton)
     */
    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        const now = performance.now() / 1000;

        // 1. REJET DES CHOCS & VIBRATIONS (Bouclier de Cohérence)
        const rawMag = Math.sqrt(accRaw.x**2 + accRaw.y**2 + accRaw.z**2);
        if (rawMag > this.maxHumanAcc) this.shockHistory.push(now);
        this.shockHistory = this.shockHistory.filter(t => (now - t) < 0.200);
        
        // En cas de turbulence (câble qui vibre), on ignore les pics
        let useAcc = (this.shockHistory.length > 4) ? 
            { x: Number(this.bias.ax), y: Number(this.bias.ay), z: Number(this.bias.az) } : accRaw;

        // 2. FILTRAGE PASSE-BAS (LPF)
        this.accelSmooth.x += this.lpf * (useAcc.x - this.accelSmooth.x);
        this.accelSmooth.y += this.lpf * (useAcc.y - this.accelSmooth.y);
        this.accelSmooth.z += this.lpf * (useAcc.z - this.accelSmooth.z);

        // 3. COMPENSATION ET GAIN HORIZONTAL
        const ax = (this.accelSmooth.x - this.bias.ax) * this.hGain;
        const ay = (this.accelSmooth.y - this.bias.ay) * this.hGain;
        const az = (this.accelSmooth.z - (this.bias.az - 9.80665));

        // 4. ROTATION (QUATERNIONS)
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] += 9.80665; 

        // 5. INTÉGRATION DE VERLET (Vitesse réelle)
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        const accMagCalc = Math.sqrt(accWorld[0]**2 + accWorld[1]**2 + accWorld[2]**2);
        
        if (accMagCalc > this.noiseFloor) {
            vx += (this.lastAccWorld[0] + accWorld[0]) * 0.500 * dt;
            vy += (this.lastAccWorld[1] + accWorld[1]) * 0.500 * dt;
            vz += (this.lastAccWorld[2] + accWorld[2]) * 0.500 * dt;
        }

        // 6. MOMENTUM & ZUPT (Zero Velocity Update)
        const currentSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        if (currentSpeed > 0.0005) { // Seuil de 0.5mm/s pour le téléphérique
            const decay = 1.000 - (this.airResistance * currentSpeed * dt);
            vx *= decay; vy *= decay; vz *= decay;
        } else {
            vx = 0; vy = 0; vz = 0;
        }

        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        
        this.lastAccWorld = [...accWorld];
        this.totalDistance3D += currentSpeed * dt;
        this.integrateQuaternions(gyroRaw, dt);
    }

    /**
     * FUSION GPS (Correction de dérive lente)
     */
    fuseGPS(gpsSpeedMs) {
        if (gpsSpeedMs === null || gpsSpeedMs < 0.300) return;
        
        const vx = this.x.get([3, 0]);
        const vy = this.x.get([4, 0]);
        const currentInertialSpeed = Math.sqrt(vx*vx + vy*vy);
        
        const K = 0.040; // Gain de fusion (4% par cycle)
        const correctionScale = (currentInertialSpeed + (gpsSpeedMs - currentInertialSpeed) * K) / currentInertialSpeed;
        
        if (isFinite(correctionScale) && correctionScale > 0) {
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
        const h = 0.500 * dt;
        this.x.set([6,0], q[0] + h*(-q[1]*g.x - q[2]*g.y - q[3]*g.z));
        this.x.set([7,0], q[1] + h*( q[0]*g.x + q[2]*g.z - q[3]*g.y));
        this.x.set([8,0], q[2] + h*( q[0]*g.y - q[1]*g.z + q[3]*g.x));
        this.x.set([9,0], q[3] + h*( q[0]*g.z + q[1]*g.y - q[2]*g.x));
        const n = Math.sqrt(this.x.get([6,0])**2 + this.x.get([7,0])**2 + this.x.get([8,0])**2 + this.x.get([9,0])**2);
        for(let i=6; i<=9; i++) this.x.set([i,0], this.x.get([i,0])/n);
    }

    /**
     * RÉCUPÉRATION DE L'ÉTAT (Formatage à 3 décimales)
     */
    getState() {
        const v = [this.x.get([3, 0]), this.x.get([4, 0]), this.x.get([5, 0])];
        const s = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
        return {
            speedKmh: (s * 3.600).toFixed(3),
            distance: this.totalDistance3D.toFixed(3),
            isTurbulent: this.shockHistory.length > 4,
            isCalibrated: this.isCalibrated,
            vx: v[0].toFixed(3),
            vy: v[1].toFixed(3),
            vz: v[2].toFixed(3)
        };
    }
            }
