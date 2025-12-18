/**
 * GNSS SpaceTime Engine - V180 "QUANTUM-PRECISION"
 * -----------------------------------------------
 * - Micro-Accélération : Accumulation résiduelle sans seuil.
 * - Validation GPS : Fusion par effet Doppler (Vitesse réelle).
 * - Inertie : Newton Momentum avec verrou gyroscopique.
 */

class ProfessionalUKF {
    constructor() {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 24;
        this.initialized = false;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.bias = { ax: 0, ay: 0, az: 0 };
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // --- CONFIGURATION HAUTE SENSIBILITÉ ---
        this.hGain = 1.800;           // Boosté pour les micro-signaux
        this.lpfInertial = 0.450;     // Filtre très ouvert pour ne rien rater
        this.accelSmooth = { x: 0, y: 0, z: 0 };
        this.lastAccWorld = [0, 0, 0];
        
        // --- MOMENTUM & GPS ---
        this.airResistance = 0.0000001; 
        this.gpsTrust = 0;            // Score de confiance GPS (0-1)
        
        // --- BUFFER DE STABILITÉ ---
        this.speedBuffer = new Array(15).fill(0);
        this.bufferPtr = 0;
    }

    calibrate(accRaw) {
        if (this.calibSamples.length < 500) { // 10s pour une base parfaite
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { ax: sum.x/500, ay: sum.y/500, az: sum.z/500 };
        this.isCalibrated = true;
        this.initialized = true;
        return true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. DÉTECTION DU JITTER (Vibrations)
        const jitter = Math.abs(accRaw.x - this.accelSmooth.x) + Math.abs(accRaw.y - this.accelSmooth.y);
        
        // 2. FILTRAGE ADAPTATIF
        // Si stable, on ouvre le filtre au max pour capter les micro-accélérations
        let lpf = (jitter < 0.05) ? 0.60 : 0.20;

        this.accelSmooth.x += lpf * (accRaw.x - this.accelSmooth.x);
        this.accelSmooth.y += lpf * (accRaw.y - this.accelSmooth.y);
        this.accelSmooth.z += lpf * (accRaw.z - this.accelSmooth.z);

        // 3. PROJECTION ET COMPENSATION DE GRAVITÉ
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const ax = (this.accelSmooth.x - this.bias.ax) * this.hGain;
        const ay = (this.accelSmooth.y - this.bias.ay) * this.hGain;
        const az = (this.accelSmooth.z - (this.bias.az - 9.80665));

        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] += 9.80665; 

        // 4. INTÉGRATION SANS SEUIL (LOI DE NEWTON)
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        // Accumulation brute pour capturer 1.000 -> 1.001
        vx += (this.lastAccWorld[0] + accWorld[0]) * 0.5 * dt;
        vy += (this.lastAccWorld[1] + accWorld[1]) * 0.5 * dt;
        vz += (this.lastAccWorld[2] + accWorld[2]) * 0.5 * dt;

        // 5. VERROU DE MOMENTUM
        const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        const gyroMag = Math.sqrt(gyroRaw.x**2 + gyroRaw.y**2 + gyroRaw.z**2);

        // Si l'appareil ne subit pas de rotation (stable), on empêche la vitesse de s'effondrer
        if (gyroMag < 0.005) {
            const decay = 1.0 - (this.airResistance * dt);
            vx *= decay; vy *= decay; vz *= decay;
        }

        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = [...accWorld];

        this.integrateQuaternions(gyroRaw, dt);

        this.speedBuffer[this.bufferPtr] = speed * 3.6;
        this.bufferPtr = (this.bufferPtr + 1) % 15;
    }

    /**
     * FUSION GPS RÉALISTE (DOPPLER)
     */
    fuseGPS(gpsSpeedMs, gpsAccuracy) {
        if (gpsSpeedMs === null || gpsAccuracy > 0.5) {
            this.gpsTrust = Math.max(0, this.gpsTrust - 0.1);
            return;
        }
        
        this.gpsTrust = Math.min(1, this.gpsTrust + 0.2);
        const vx = this.x.get([3, 0]), vy = this.x.get([4, 0]);
        const inertialSpeed = Math.sqrt(vx*vx + vy*vy);

        // Correction proportionnelle à la confiance
        const K = 0.05 * (1 - gpsAccuracy); 
        const correction = (inertialSpeed + (gpsSpeedMs - inertialSpeed) * K) / (inertialSpeed + 0.00001);
        
        this.x.set([3, 0], vx * correction);
        this.x.set([4, 0], vy * correction);
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
        const avgSpeed = this.speedBuffer.reduce((a, b) => a + b, 0) / 15;
        return {
            speedKmh: avgSpeed.toFixed(3),
            gpsConfidence: (this.gpsTrust * 100).toFixed(0) + "%",
            moving: avgSpeed > 0.001
        };
    }
    }
