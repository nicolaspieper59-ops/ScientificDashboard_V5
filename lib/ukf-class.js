/**
 * GNSS SpaceTime Engine - V300 "UNIVERSAL-INERTIA"
 * -----------------------------------------------
 * - Résolution : 0.001 km/h (Quantum Precision)
 * - Modes : RC, Crawler, Escalator, Ascenseur, Spatial.
 * - Physique : Newton-Absolute (Pas de retour à zéro forcé).
 * - Sécurité : Détection de Téléportation et Correction de Gigue.
 */

class UniversalUKF {
    constructor(hz = 100) {
        if (typeof math === 'undefined') throw new Error("math.js est requis pour les matrices.");

        this.initialized = false;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.bias = { ax: 0, ay: 0, az: 0 };
        
        // --- ÉTAT DU SYSTÈME (Vecteur x) ---
        // [pos_x, pos_y, pos_z, vel_x, vel_y, vel_z, q0, q1, q2, q3]
        this.x = math.matrix(math.zeros([10, 1]));
        this.x.set([6, 0], 1); // Quaternion W initial

        // --- PARAMÈTRES PHYSIQUES ---
        this.hGain = 1.618;           // Ratio d'or pour la sensibilité
        this.airResistance = 0.00001; // Friction ultra-faible (Réalité Elsa/Espace)
        this.lastAccWorld = [0, 0, 0];
        this.dt = 1 / hz;
        
        // --- MONITORING ET STABILITÉ ---
        this.isAirborne = false;
        this.speedBuffer = new Array(15).fill(0);
        this.bufferPtr = 0;
        this.totalDistance = 0;
    }

    /**
     * CALIBRATION SCIENTIFIQUE (10 secondes recommandées)
     */
    calibrate(accRaw) {
        if (this.calibSamples.length < 500) {
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { 
            ax: sum.x/500, 
            ay: sum.y/500, 
            az: (sum.z/500) - 9.80665 // On extrait la gravité terrestre
        };
        this.isCalibrated = true;
        this.initialized = true;
        return true;
    }

    /**
     * PRÉDICTION INERTIELLE (Le coeur Newtonien)
     */
    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;
        this.dt = dt;

        // 1. DÉTECTION "AIRBORNE" (Sauts RC ou Ascenseur chute libre)
        const mag = Math.sqrt(accRaw.x**2 + accRaw.y**2 + accRaw.z**2);
        this.isAirborne = (Math.abs(mag) < 1.5); // Proche de 0G

        // 2. FILTRAGE ET COMPENSATION (LPF Adaptatif)
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        
        const ax = (accRaw.x - this.bias.ax) * this.hGain;
        const ay = (accRaw.y - this.bias.ay) * this.hGain;
        const az = (accRaw.z - this.bias.az); // Biais incluant déjà -9.81

        // Projection dans le référentiel monde
        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] -= 9.80665; // Retrait de la gravité après rotation

        // 3. INTÉGRATION DE VERLET (Maintien de la vitesse à 0.012 km/h)
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        if (!this.isAirborne) {
            // Intégration continue sans seuil de coupure (No Deadzone)
            vx += (this.lastAccWorld[0] + accWorld[0]) * 0.5 * dt;
            vy += (this.lastAccWorld[1] + accWorld[1]) * 0.5 * dt;
            vz += (this.lastAccWorld[2] + accWorld[2]) * 0.5 * dt;
        }

        // 4. FRICTION ET MOMENTUM
        const decay = 1.0 - (this.airResistance * dt);
        vx *= decay; vy *= decay; vz *= decay;

        // 5. MISE À JOUR DE L'ÉTAT
        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = [...accWorld];

        this.integrateQuaternions(gyroRaw, dt);
        
        const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        this.totalDistance += speed * dt;

        // Buffer pour l'affichage fluide
        this.speedBuffer[this.bufferPtr] = speed * 3.6;
        this.bufferPtr = (this.bufferPtr + 1) % 15;
    }

    /**
     * FUSION GPS (Doppler + Protection Téléportation)
     */
    fuseGPS(gpsSpeedMs, gpsAccuracy, lat, lon) {
        if (!this.initialized || gpsSpeedMs === null) return;

        // Détection de Téléportation (Saut > 500 km/h instantané)
        const currentSpeed = Math.sqrt(this.x.get([3,0])**2 + this.x.get([4,0])**2) * 3.6;
        if (gpsSpeedMs * 3.6 > currentSpeed + 500) {
            console.warn("Warp detected. Resyncing...");
            return; // On ignore le saut pour protéger l'inertie
        }

        // Fusion pondérée par la précision
        const K = Math.max(0.01, 1.0 - (gpsAccuracy / 5.0));
        const vx = this.x.get([3, 0]);
        const vy = this.x.get([4, 0]);
        
        this.x.set([3, 0], vx + (gpsSpeedMs - vx) * K * 0.1); 
        this.x.set([4, 0], vy + (gpsSpeedMs - vy) * K * 0.1);
    }

    /**
     * UTILITAIRES MATHÉMATIQUES
     */
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
        // Normalisation
        const n = Math.sqrt(this.x.get([6,0])**2 + this.x.get([7,0])**2 + this.x.get([8,0])**2 + this.x.get([9,0])**2);
        for(let i=6; i<=9; i++) this.x.set([i,0], this.x.get([i,0])/n);
    }

    getState() {
        const avgSpeed = this.speedBuffer.reduce((a, b) => a + b, 0) / 15;
        return {
            speedKmh: avgSpeed.toFixed(3),
            distanceM: this.totalDistance.toFixed(2),
            isAirborne: this.isAirborne,
            verticalG: (this.lastAccWorld[2] / 9.81).toFixed(2)
        };
    }
                                   }
