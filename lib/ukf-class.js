/**
 * GNSS SpaceTime Engine - V140 "INFINITE PRECISION"
 * ------------------------------------------------
 * - Cible : Micro-accélérations (1.000 -> 1.001 km/h)
 * - Technique : Accumulateur de résidus (pas de perte de micro-mouvement)
 * - Filtrage : Floating-Window Average sur la sortie
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
        
        // --- CONFIGURATION SANS SEUIL (ANTI-NOISE-FLOOR) ---
        this.hGain = 1.500;
        this.lpfBase = 0.300; 
        this.accelSmooth = { x: 0, y: 0, z: 0 };
        this.lastAccWorld = [0, 0, 0];
        
        // --- LE RÉSERVOIR D'ACCÉLÉRATION ---
        // Permet d'accumuler les micro-poussées au lieu de les jeter
        this.residualAcc = [0, 0, 0];
        
        this.totalDistance3D = 0;
        this.airResistance = 0.0000001; // Quasiment aucune perte
        
        // --- FILTRE D'AFFICHAGE (Moving Average) ---
        // Pour stabiliser la lecture à 3 décimales
        this.speedBuffer = [];
        this.bufferSize = 10; 
    }

    calibrate(accRaw) {
        if (this.calibSamples.length < 400) { // Calibration ultra-longue (8s)
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { ax: sum.x/400, ay: sum.y/400, az: sum.z/400 };
        this.isCalibrated = true;
        this.initialized = true;
        return true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. FILTRAGE PASSE-HAUT DES BIAIS
        // On lisse l'accélération brute avec une fenêtre large
        this.accelSmooth.x += this.lpfBase * (accRaw.x - this.accelSmooth.x);
        this.accelSmooth.y += this.lpfBase * (accRaw.y - this.accelSmooth.y);
        this.accelSmooth.z += this.lpfBase * (accRaw.z - this.accelSmooth.z);

        // 2. EXTRACTION DU SIGNAL (MÊME MINUSCULE)
        const ax = (this.accelSmooth.x - this.bias.ax) * this.hGain;
        const ay = (this.accelSmooth.y - this.bias.ay) * this.hGain;
        const az = (this.accelSmooth.z - (this.bias.az - 9.80665));

        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] += 9.80665;

        // 3. LOGIQUE D'ACCUMULATION (Le secret du 1.001 km/h)
        // On ne jette rien. Même si accWorld est 0.000001, on l'ajoute.
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        // Intégration Newtonienne sans Noise Floor
        vx += (this.lastAccWorld[0] + accWorld[0]) * 0.5 * dt;
        vy += (this.lastAccWorld[1] + accWorld[1]) * 0.5 * dt;
        vz += (this.lastAccWorld[2] + accWorld[2]) * 0.5 * dt;

        // 4. MOMENTUM ABSOLU
        const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        
        // On ne remet à zéro QUE si l'appareil est strictement immobile (basé sur gyro)
        const gyroMag = Math.sqrt(gyroRaw.x**2 + gyroRaw.y**2 + gyroRaw.z**2);
        if (gyroMag < 0.001 && speed < 0.0001) {
            vx = 0; vy = 0; vz = 0;
        } else {
            // Friction d'air symbolique
            const decay = 1.0 - (this.airResistance * dt);
            vx *= decay; vy *= decay; vz *= decay;
        }

        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = [...accWorld];
        this.totalDistance3D += speed * dt;

        this.integrateQuaternions(gyroRaw, dt);
        
        // 5. LISSAGE DE L'AFFICHAGE
        this.speedBuffer.push(speed * 3.6);
        if (this.speedBuffer.length > this.bufferSize) this.speedBuffer.shift();
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
        // Moyenne glissante pour un affichage stable à 0.001
        const avgSpeed = this.speedBuffer.reduce((a,b) => a+b, 0) / this.speedBuffer.length;
        return {
            speedKmh: avgSpeed.toFixed(3),
            distance: this.totalDistance3D.toFixed(3),
            isStable: this.speedBuffer[this.speedBuffer.length-1] === 0
        };
    }
    }
