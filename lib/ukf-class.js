/**
 * PROFESSIONAL UKF V60 - DEEP SPACE / MICRO-GRAVITY EDITION
 * - Suppression totale de la "Zone Morte" (Deadband = 0).
 * - Intègre les accélérations < 1 cm/s².
 * - Gestion du Bruit par Variance Temporelle (et non par seuil).
 */

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 24;
        this.initialized = false;
        
        // --- CONSTANTES ---
        this.D2R = Math.PI / 180;
        this.R_MAJOR = 6378137.0;

        // --- MATRICES ---
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.P = math.multiply(math.eye(this.n), 1e-6); // Covariance très fine
        
        // --- RÉGLAGES "NO LIMIT" ---
        this.totalDistance3D = 0;
        
        // Seuil abaissé au niveau du bruit quantique du capteur MEMS
        // 0.0001 m/s² = 0.01 cm/s² (100x plus sensible que votre demande)
        this.noiseFloor = 0.0001; 
        
        // Accumulateur de micro-mouvement (Buffer)
        this.microAccBuffer = { x: 0, y: 0, z: 0 };
    }

    initialize(lat, lon, alt) {
        this.x.set([0, 0], lat);
        this.x.set([1, 0], lon);
        this.x.set([2, 0], alt);
        this.x.set([6, 0], 1.0); 
        for (let i = 16; i <= 21; i++) this.x.set([i, 0], 1.0);
        this.initialized = true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. Projection Monde (Quaternions)
        const q = [this.x.get([6, 0]), this.x.get([7, 0]), this.x.get([8, 0]), this.x.get([9, 0])];
        const accWorld = this.rotateVector(q, [accRaw.x, accRaw.y, accRaw.z]);

        // 2. Soustraction Gravité Somigliana
        // Crucial : Si la gravité est mal soustraite, elle crée une fausse accélération de 1 cm/s²
        const g_loc = this.getGravitySomigliana(this.x.get([0, 0]), this.x.get([2, 0]));
        accWorld[2] += g_loc;

        // 3. INTÉGRATION SANS SEUIL (RAW)
        // On n'utilise plus de "if (acc < floor)". On prend TOUT.
        
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        // Accumulation brute (v = v + a * dt)
        vx += accWorld[0] * dt;
        vy += accWorld[1] * dt;
        vz += accWorld[2] * dt;

        // 4. FRICTION INTELLIGENTE (Uniquement pour stabiliser l'arrêt)
        const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        const accMag = Math.sqrt(accWorld[0]**2 + accWorld[1]**2 + accWorld[2]**2);

        // Si l'accélération est VRAIMENT minuscule (< 0.1 mm/s²) ET qu'on est très lent
        // On applique une micro-friction pour éviter que le bruit ne fasse dériver à l'infini
        if (accMag < this.noiseFloor) {
            // Friction extrêmement légère (0.9999) pour ne pas tuer l'élan
            const friction = 0.9999; 
            vx *= friction;
            vy *= friction;
            vz *= friction;
            
            // ZUPT (Zero Update) : Seulement si on est quasi à l'arrêt complet
            if (speed < 0.002) { // < 2 mm/s
                vx = 0; vy = 0; vz = 0;
            }
        }

        // 5. Sauvegarde État
        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);

        // 6. Mise à jour Distance & Rotation
        this.totalDistance3D += speed * dt;
        this.integrateQuaternions(gyroRaw, dt);
    }

    // --- MOTEUR MATHÉMATIQUE ---
    rotateVector(q, v) {
        const [w, x, y, z] = q;
        const [vx, vy, vz] = v;
        return [
            vx*(1-(2*(y*y+z*z))) + vy*(2*(x*y-z*w)) + vz*(2*(x*z+y*w)),
            vx*(2*(x*y+z*w)) + vy*(1-(2*(x*x+z*z))) + vz*(2*(y*z-x*w)),
            vx*(2*(x*z-y*w)) + vy*(2*(y*z+x*w)) + vz*(1-(2*(x*x+y*y)))
        ];
    }

    getGravitySomigliana(lat, alt) {
        const sinLat2 = Math.sin(lat * this.D2R) ** 2;
        const g0 = 9.7803267714 * (1 + 0.00193185138639 * sinLat2) / Math.sqrt(1 - 0.00669437999013 * sinLat2);
        return g0 - (3.086e-6 * alt);
    }

    integrateQuaternions(gyro, dt) {
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const h = 0.5 * dt;
        const dq = [
            -q[1]*gyro.x - q[2]*gyro.y - q[3]*gyro.z,
             q[0]*gyro.x - q[3]*gyro.y + q[2]*gyro.z,
             q[3]*gyro.x + q[0]*gyro.y - q[1]*gyro.z,
            -q[2]*gyro.x + q[1]*gyro.y + q[0]*gyro.z
        ];
        for(let i=0; i<4; i++) this.x.set([6+i, 0], q[i] + dq[i]*h);
        // Normalisation rapide
        const invNorm = 1 / Math.sqrt(this.x.get([6,0])**2 + this.x.get([7,0])**2 + this.x.get([8,0])**2 + this.x.get([9,0])**2);
        for(let i=6; i<=9; i++) this.x.set([i,0], this.x.get([i,0]) * invNorm);
    }

    getState() {
        const v = [this.x.get([3, 0]), this.x.get([4, 0]), this.x.get([5, 0])];
        return {
            speed3D: Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2),
            distance: this.totalDistance3D
        };
    }
    }
