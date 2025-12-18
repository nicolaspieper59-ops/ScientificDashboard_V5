/**
 * GNSS SpaceTime Engine - V70 "ARMORED EDITION"
 * - Rejet des chocs brutaux (ralentisseurs, chutes, nids-de-poule)
 * - Filtration des vibrations (pavés, moteur)
 * - Conservation de l'inertie (Momentum)
 */

class ProfessionalUKF {
    constructor() {
        this.n = 21;
        this.initialized = false;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.bias = { ax: 0, ay: 0, az: 0 };
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // --- FILTRES DE SÉCURITÉ PHYSIQUE ---
        this.accelBuffer = { x: 0, y: 0, z: 0 };
        this.lpf = 0.10;        // Suspension (basse fréquence)
        this.maxHumanAcc = 15;  // Max 15 m/s² (~1.5g). Au-delà, c'est un choc, on ignore.
        
        this.lastAccWorld = [0, 0, 0];
        this.totalDistance3D = 0;
        this.k_stokes = 0.00008; 
    }

    process(dt, accRaw, gyroRaw) {
        if (!this.isCalibrated) return this.calibrate(accRaw);
        this.predict(dt, accRaw, gyroRaw);
        return true;
    }

    calibrate(accRaw) {
        if (this.calibSamples.length < 100) {
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { ax: sum.x/100, ay: sum.y/100, az: sum.z/100 };
        this.isCalibrated = true;
        this.initialized = true;
        return true;
    }

    predict(dt, accRaw, gyroRaw) {
        // 1. PROTECTION ANTI-CHOC (Slew-Rate Limiter)
        // Si l'accélération brute est > 15 m/s², on la plafonne pour éviter les "100 km/h"
        let rawX = Math.abs(accRaw.x) > this.maxHumanAcc ? (this.maxHumanAcc * Math.sign(accRaw.x)) : accRaw.x;
        let rawY = Math.abs(accRaw.y) > this.maxHumanAcc ? (this.maxHumanAcc * Math.sign(accRaw.y)) : accRaw.y;
        let rawZ = Math.abs(accRaw.z) > this.maxHumanAcc ? (this.maxHumanAcc * Math.sign(accRaw.z)) : accRaw.z;

        // 2. FILTRE DE PAVÉS (Suspension numérique)
        this.accelBuffer.x += this.lpf * (rawX - this.accelBuffer.x);
        this.accelBuffer.y += this.lpf * (rawY - this.accelBuffer.y);
        this.accelBuffer.z += this.lpf * (rawZ - this.accelBuffer.z);

        // 3. DÉBIAISAGE & ROTATION
        const ax = this.accelBuffer.x - this.bias.ax;
        const ay = this.accelBuffer.y - this.bias.ay;
        const az = this.accelBuffer.z - (this.bias.az - 9.80665);

        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] += 9.80665; 

        // 4. INTÉGRATION NEWTONIENNE (Verlet)
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        // On ignore les bruits résiduels sous 0.02 m/s²
        if (Math.sqrt(accWorld[0]**2 + accWorld[1]**2) > 0.02) {
            vx += (this.lastAccWorld[0] + accWorld[0]) * 0.5 * dt;
            vy += (this.lastAccWorld[1] + accWorld[1]) * 0.5 * dt;
            vz += (this.lastAccWorld[2] + accWorld[2]) * 0.5 * dt;
        } else {
            // Friction naturelle (Momentum)
            const decay = 1.0 - (this.k_stokes * dt);
            vx *= decay; vy *= decay; vz *= decay;
        }

        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = [...accWorld];
        this.totalDistance3D += Math.sqrt(vx*vx + vy*vy + vz*vz) * dt;

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
        return { speedKmh: s * 3.6, distance: this.totalDistance3D, isCalibrated: this.isCalibrated };
    }
                   }
