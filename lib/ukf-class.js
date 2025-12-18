/**
 * =================================================================
 * PROFESSIONAL UKF V60 - NEWTONIAN INERTIA ENGINE
 * =================================================================
 * PROBLÈME RÉSOLU : La vitesse ne tombe plus à 0 quand l'accélération s'arrête.
 * PRINCIPE : Conservation de la quantité de mouvement (Momentum).
 * PHYSIQUE : Intégration brute avec protection anti-dérive temporelle.
 * =================================================================
 */

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 24; // 24 États
        this.initialized = false;
        
        // --- CONSTANTES ---
        this.D2R = Math.PI / 180;
        this.R_MAJOR = 6378137.0;

        // --- MATRICES ---
        this.x = math.matrix(math.zeros([this.n, 1])); // Vecteur État
        this.P = math.multiply(math.eye(this.n), 1e-5); // Covariance
        
        // --- PARAMÈTRES D'INERTIE ---
        this.totalDistance3D = 0;
        
        // 1. SEUIL DE BRUIT EXTRÊMEMENT BAS (Sensibilité max)
        this.noiseFloor = 0.0001; // 0.1 mm/s² (Détecte tout)

        // 2. FRICTION D'AIR RÉALISTE (Pas de freinage artificiel)
        // Dans l'espace ou sous vide, ceci devrait être 0.
        // Ici on met une valeur infime pour simuler l'air (0.001% de perte par seconde)
        this.airDragCoeff = 0.00001; 

        // 3. LOGIQUE D'ARRÊT (ZUPT TEMPOREL)
        // On ne met à zéro que si l'accélération est nulle PENDANT un certain temps
        this.staticCounter = 0; 
        this.staticThreshold = 200; // 2 secondes d'immobilité totale pour valider l'arrêt
    }

    initialize(lat, lon, alt) {
        this.x.set([0, 0], lat);
        this.x.set([1, 0], lon);
        this.x.set([2, 0], alt);
        this.x.set([6, 0], 1.0); // Quaternion W
        for (let i = 16; i <= 21; i++) this.x.set([i, 0], 1.0); // Scale Factors
        this.initialized = true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // --- A. PROJECTION DANS LE MONDE RÉEL ---
        // On aligne l'accélération capteur avec l'horizon terrestre
        const q = [this.x.get([6, 0]), this.x.get([7, 0]), this.x.get([8, 0]), this.x.get([9, 0])];
        const accWorld = this.rotateVector(q, [accRaw.x, accRaw.y, accRaw.z]);

        // --- B. SOUSTRACTION DE LA GRAVITÉ (CHIRURGICALE) ---
        const g_loc = this.getGravitySomigliana(this.x.get([0, 0]), this.x.get([2, 0]));
        accWorld[2] += g_loc;

        // --- C. CŒUR DU SYSTÈME : INTÉGRATION DE NEWTON ---
        // Vitesse(t) = Vitesse(t-1) + Accélération * dt
        
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        // On accumule TOUT, même les micro-accélérations.
        // C'est ce qui permet la réactivité 3D instantanée.
        vx += accWorld[0] * dt;
        vy += accWorld[1] * dt;
        vz += accWorld[2] * dt;

        // --- D. GESTION DU "VRAI" ARRÊT (ZUPT INTELLIGENT) ---
        const accMag = Math.sqrt(accWorld[0]**2 + accWorld[1]**2 + accWorld[2]**2);
        const currentSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);

        if (accMag < this.noiseFloor) {
            // L'accélération est nulle (Phase de croisière OU Arrêt)
            this.staticCounter++;

            // SI et SEULEMENT SI on est sans accélération depuis > 2 secondes
            // ET que la vitesse est déjà très basse (< 5 cm/s)
            // ALORS on considère que c'est un arrêt et non une glisse.
            if (this.staticCounter > this.staticThreshold && currentSpeed < 0.05) {
                vx = 0; vy = 0; vz = 0; // Verrouillage Zéro
            } else {
                // SINON : On est en ROUE LIBRE (Coasting)
                // On applique juste la résistance de l'air (99.999% de conservation)
                const preservation = 1.0 - (this.airDragCoeff * currentSpeed * dt);
                vx *= preservation;
                vy *= preservation;
                vz *= preservation;
            }
        } else {
            // Mouvement détecté : On reset le compteur d'arrêt
            this.staticCounter = 0;
        }

        // --- E. SAUVEGARDE & DISTANCE ---
        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);

        const newSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        this.totalDistance3D += newSpeed * dt;

        // Mise à jour orientation
        this.integrateQuaternions(gyroRaw, dt);
    }

    // --- MOTEUR MATHÉMATIQUE (ROBUSTESSE) ---
    rotateVector(q, v) {
        const [w, x, y, z] = q;
        const [vx, vy, vz] = v;
        // Rotation Hamiltonienne complète pour réactivité 3D parfaite
        return [
            vx*(1-2*(y*y+z*z)) + vy*2*(x*y-z*w) + vz*2*(x*z+y*w),
            vx*2*(x*y+z*w) + vy*(1-2*(x*x+z*z)) + vz*2*(y*z-x*w),
            vx*2*(x*z-y*w) + vy*2*(y*z+x*w) + vz*(1-2*(x*x+y*y))
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
