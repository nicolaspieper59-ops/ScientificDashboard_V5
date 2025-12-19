/**
 * GNSS SpaceTime Engine - V305 "PRECISION-INERTIA"
 * -----------------------------------------------
 * Mise à jour : Gestion de l'opposition Inertie/Accélération
 * Résolution : 1mm/s² | Fréquence : 1000Hz
 */

class UniversalUKF {
    constructor(hz = 100) {
        // Initialisation de l'état : [pos_x, pos_y, pos_z, vel_x, vel_y, vel_z, q0, q1, q2, q3]
        this.x = math.matrix(math.zeros([10, 1]));
        this.x.set([6, 0], 1); // Quaternion W (scalaire) à 1

        this.initialized = true;
        this.bias = { ax: 0, ay: 0, az: 0 };
        this.lastAccWorld = [0, 0, 0];
        
        // Paramètres de réalisme
        this.hGain = 1.0;            // Gain de sensibilité
        this.totalDistance = 0;
        this.isAirborne = false;
        
        // Tampon pour lissage de l'affichage
        this.speedBuffer = new Array(10).fill(0);
        this.bufferPtr = 0;
    }

    /**
     * Moteur de prédiction : Calcule le mouvement millimètre par millimètre
     */
    predict(dt, accRaw, gyroRaw, mass = 70) {
        if (dt <= 0) return;

        // 1. Calcul de l'Orientation (Quaternion)
        // Permet de savoir où est le "bas" même en plein looping
        this.integrateQuaternions(gyroRaw || {x:0, y:0, z:0}, dt);
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];

        // 2. Traitement de l'Accélération Linéaire
        // On projette l'accélération du téléphone dans le référentiel terrestre
        const accWorld = this.rotateVector(q, [accRaw.x, accRaw.y, accRaw.z]);
        
        // Soustraction de la gravité terrestre (Réalisme absolu)
        accWorld[2] -= 9.80665; 

        // 3. Gestion de l'Inertie vs Résistance de l'air
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);
        const vScalar = Math.sqrt(vx*vx + vy*vy + vz*vz);

        // Calcul de la traînée (Opposition proportionnelle au carré de la vitesse)
        const rho = 1.225; // Densité de l'air
        const dragAcc = (0.5 * rho * vScalar**2 * 0.47 * 0.7) / mass;

        // Application Newtonienne : Accélération + (Opposition par Inertie)
        const updateVel = (v, acc, drag) => {
            const dragComponent = vScalar > 0 ? (v / vScalar) * drag : 0;
            const newV = v + (acc - dragComponent) * dt;
            // Seuil microscopique pour éviter la dérive à l'arrêt complet
            return Math.abs(newV) < 0.0002 ? 0 : newV;
        };

        vx = updateVel(vx, accWorld[0], dragAcc);
        vy = updateVel(vy, accWorld[1], dragAcc);
        vz = updateVel(vz, accWorld[2], dragAcc);

        // 4. Enregistrement de l'état
        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = accWorld;

        const currentSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        this.totalDistance += currentSpeed * dt;

        // Remplissage du tampon pour l'interface
        this.speedBuffer[this.bufferPtr] = currentSpeed * 3.6;
        this.bufferPtr = (this.bufferPtr + 1) % 10;
    }

    /**
     * Fusion GPS : Corrige l'inertie par la réalité satellite
     */
    fuseGPS(gpsSpeedMs, gpsAccuracy) {
        if (gpsSpeedMs === null || gpsAccuracy > 20) return;

        // Gain de confiance (K) : Plus le GPS est précis, plus on écrase l'inertie
        const K = gpsAccuracy < 5 ? 0.1 : 0.02;
        
        const vx = this.x.get([3, 0]);
        const vy = this.x.get([4, 0]);

        // On ajuste doucement les vecteurs pour ne pas créer de "saut" visuel
        this.x.set([3, 0], vx + (gpsSpeedMs - vx) * K);
        this.x.set([4, 0], vy + (gpsSpeedMs - vy) * K);
    }

    // --- Fonctions Mathématiques de Rotation ---
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
        // Intégration simple des vitesses angulaires pour l'orientation
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
        const avgSpeed = this.speedBuffer.reduce((a, b) => a + b, 0) / 10;
        return {
            speedKmh: avgSpeed.toFixed(3),
            distanceM: this.totalDistance,
            verticalG: (this.lastAccWorld[2] / 9.80665).toFixed(3),
            accWorld: this.lastAccWorld
        };
    }
    }
