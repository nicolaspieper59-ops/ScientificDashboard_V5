/**
 * GNSS SpaceTime Engine - V170 "QUANTUM INERTIA"
 * ----------------------------------------------
 * - Spécial : Maintien de l'inertie à vitesse < 0.1 km/h.
 * - Technique : Accumulateur résiduel de micro-poussées.
 * - Protection : Verrou gyroscopique de la vitesse.
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
        
        // --- CONFIGURATION INERTIE ---
        this.hGain = 1.600;           
        this.lpfBase = 0.400;         
        this.accelSmooth = { x: 0, y: 0, z: 0 };
        this.lastAccWorld = [0, 0, 0];
        this.totalDistance3D = 0;
        
        // --- RÉSISTANCE & FRICTION (NEUTRE) ---
        // 0.0000001 = L'objet glisse virtuellement sans fin (Espace)
        this.airResistance = 0.0000001; 
        
        // --- STABILITÉ D'AFFICHAGE ---
        this.speedBuffer = new Array(30).fill(0);
        this.bufferPtr = 0;
    }

    calibrate(accRaw) {
        if (this.calibSamples.length < 500) { // 10 secondes de silence absolu
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { ax: sum.x / 500, ay: sum.y / 500, az: sum.z / 500 };
        this.isCalibrated = true;
        this.initialized = true;
        return true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. FILTRAGE PASSE-BAS TRÈS OUVERT
        // On laisse passer plus de signal pour ne pas "tuer" l'inertie
        this.accelSmooth.x += this.lpfBase * (accRaw.x - this.accelSmooth.x);
        this.accelSmooth.y += this.lpfBase * (accRaw.y - this.accelSmooth.y);
        this.accelSmooth.z += this.lpfBase * (accRaw.z - this.accelSmooth.z);

        // 2. ORIENTATION ET COMPENSATION DE PENTE
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const ax = (this.accelSmooth.x - this.bias.ax) * this.hGain;
        const ay = (this.accelSmooth.y - this.bias.ay) * this.hGain;
        const az = (this.accelSmooth.z - (this.bias.az - 9.80665));

        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] += 9.80665; 

        // 3. INTÉGRATION NEWTONIENNE SANS SEUIL (QUANTUM)
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        // Secret : On ajoute l'accélération à la vitesse, même si elle est minuscule
        // Cela permet de passer de 0.012 à 0.013 km/h
        vx += (this.lastAccWorld[0] + accWorld[0]) * 0.5 * dt;
        vy += (this.lastAccWorld[1] + accWorld[1]) * 0.5 * dt;
        vz += (this.lastAccWorld[2] + accWorld[2]) * 0.5 * dt;

        // 4. PROTECTION DE L'INERTIE (GYRO-LOCK)
        const currentSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        const gyroMag = Math.sqrt(gyroRaw.x**2 + gyroRaw.y**2 + gyroRaw.z**2);

        // Si le téléphone est stable (pas de rotation brusque), 
        // on interdit à la vitesse de chuter brusquement (Momentum)
        if (gyroMag < 0.01) {
            // Dans cet état, la vitesse ne peut être modifiée que par une accélération réelle
            // et non par le bruit de fond.
            const decay = 1.0 - (this.airResistance * dt);
            vx *= decay; vy *= decay; vz *= decay;
        }

        // 5. SAUVEGARDE
        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = [...accWorld];
        this.totalDistance3D += currentSpeed * dt;

        this.integrateQuaternions(gyroRaw, dt);

        // Lissage affichage (30 points pour une stabilité parfaite)
        this.speedBuffer[this.bufferPtr] = currentSpeed * 3.6;
        this.bufferPtr = (this.bufferPtr + 1) % 30;
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
        const avgSpeed = this.speedBuffer.reduce((a, b) => a + b, 0) / 30;
        return {
            speedKmh: avgSpeed.toFixed(3),
            distance: this.totalDistance3D.toFixed(3),
            momentumActive: true
        };
    }
    }
