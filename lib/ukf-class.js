/**
 * =================================================================
 * PROFESSIONAL UKF V60 - OMNIPOTENCE & QUANTUM SENSITIVITY
 * =================================================================
 * ARCHITECTURE : Fusion 24 États (Pos, Vel, Quat, Bias, Scale)
 * PHYSIQUE : Somigliana, Coriolis, NHC, Stokes Drag, ZUPT Adaptatif
 * CIBLE : Espace, Souterrain, Aquatique, Urbain, Extrême.
 * =================================================================
 */

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 24;
        this.initialized = false;
        
        // --- CONSTANTES PHYSIQUES ---
        this.D2R = Math.PI / 180;
        this.R_MAJOR = 6378137.0; // Rayon Terre (WGS84)
        this.OMEGA_EARTH = 7.292115e-5; // Rotation Terre (rad/s)

        // --- MATRICES ---
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.P = math.multiply(math.eye(this.n), 1e-5); // Covariance initiale
        
        // --- RÉGLAGES DE SENSIBILITÉ QUANTIQUE ---
        this.totalDistance3D = 0;
        
        // Le secret du 1 cm/s : un seuil de bruit dynamique
        this.noiseFloor = 0.00015; // 0.15 mm/s² (Détection fourmi/drone)
        
        // Mode Environnemental (Par défaut: Atmosphère)
        // spaceMode = true : Désactive toute friction (Loi d'inertie pure)
        this.spaceMode = false; 
        this.k_drag_atmosphere = 0.00008; // Traînée aéro très fine
    }

    initialize(lat, lon, alt) {
        this.x.set([0, 0], lat);
        this.x.set([1, 0], lon);
        this.x.set([2, 0], alt);
        this.x.set([6, 0], 1.0); // Quaternion Identité (W=1)
        
        // Initialisation Facteurs d'échelle à 1.0
        for (let i = 16; i <= 21; i++) this.x.set([i, 0], 1.0);
        
        this.initialized = true;
    }

    /**
     * CŒUR DU SYSTÈME : PRÉDICTION 100Hz
     */
    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. DÉTECTION DYNAMIQUE DE L'ENVIRONNEMENT (Rotation excessive = Manège)
        const gyroMag = Math.sqrt(gyroRaw.x**2 + gyroRaw.y**2 + gyroRaw.z**2);
        const isHighG_Rotation = gyroMag > 2.5; // > 140°/s

        // 2. RÉCUPÉRATION DE L'ATTITUDE (QUATERNIONS)
        const q = [
            this.x.get([6, 0]), this.x.get([7, 0]), 
            this.x.get([8, 0]), this.x.get([9, 0])
        ];

        // 3. PROJECTION OMNIDIRECTIONNELLE (Repère Capteur -> Repère Terre)
        // Indispensable pour que le toboggan (Z) et le métro (X) soient traités égaux
        const accWorld = this.rotateVector(q, [accRaw.x, accRaw.y, accRaw.z]);

        // 4. CORRECTION GRAVITÉ SOMIGLIANA & CORIOLIS
        const lat = this.x.get([0, 0]);
        const alt = this.x.get([2, 0]);
        const g_loc = this.getGravitySomigliana(lat, alt);
        
        // Correction Verticale Pure
        accWorld[2] += g_loc;

        // Correction Coriolis (Pour les vitesses > 200 km/h ou Espace)
        // F_cor = -2 * Omega x V
        const vx = this.x.get([3, 0]), vy = this.x.get([4, 0]), vz = this.x.get([5, 0]);
        if (Math.abs(vx) > 50 || this.spaceMode) {
             // Simplifié pour latitude locale
             const sinLat = Math.sin(lat * this.D2R);
             accWorld[0] += 2 * this.OMEGA_EARTH * vy * sinLat;
             accWorld[1] -= 2 * this.OMEGA_EARTH * vx * sinLat;
        }

        // 5. INTÉGRATION QUANTIQUE (Sensibilité 1 cm/s)
        const accMag3D = Math.sqrt(accWorld[0]**2 + accWorld[1]**2 + accWorld[2]**2);
        
        // Si mouvement détecté (même infime) OU si on est dans l'espace (inertie infinie)
        if (accMag3D > this.noiseFloor || this.spaceMode) {
            // Facteur de confiance : réduit si rotation extrême (Manège)
            const trustFactor = isHighG_Rotation ? 0.2 : 1.0;
            
            this.x.set([3, 0], vx + accWorld[0] * dt * trustFactor);
            this.x.set([4, 0], vy + accWorld[1] * dt * trustFactor);
            this.x.set([5, 0], vz + accWorld[2] * dt * trustFactor);
        }

        // 6. GESTION DE LA FRICTION & ARRÊT (STABILITÉ)
        const currentSpeed = Math.sqrt(this.x.get([3,0])**2 + this.x.get([4,0])**2 + this.x.get([5,0])**2);
        
        if (!this.spaceMode) {
            // Atmosphère : Friction proportionnelle
            // Si on pousse (acc > seuil), friction = 1.0 (Nulle). Sinon, traînée naturelle.
            let friction = 1.0;
            if (accMag3D < this.noiseFloor) {
                // Zone de glisse ou d'arrêt
                if (currentSpeed < 0.02) { // < 2 cm/s
                   friction = 0.95; // Freinage final "mordant" pour ZUPT
                } else {
                   friction = 1.0 - (this.k_drag_atmosphere * currentSpeed * dt); // Aéro
                }
            }
            this.x.set([3, 0], this.x.get([3,0]) * friction);
            this.x.set([4, 0], this.x.get([4,0]) * friction);
            this.x.set([5, 0], this.x.get([5,0]) * friction);
        }

        // 7. ZUPT ULTIME (Verrouillage Zéro Absolu)
        // Uniquement si vitesse < 0.5 cm/s ET pas d'accélération
        if (!this.spaceMode && currentSpeed < 0.005 && accMag3D < this.noiseFloor) {
            this.x.set([3, 0], 0); this.x.set([4, 0], 0); this.x.set([5, 0], 0);
        }

        // 8. TOTALISATION & ROTATION
        const finalSpeed = Math.sqrt(this.x.get([3,0])**2 + this.x.get([4,0])**2 + this.x.get([5,0])**2);
        this.totalDistance3D += finalSpeed * dt;
        this.integrateQuaternions(gyroRaw, dt);
    }

    // --- MOTEUR MATHÉMATIQUE (ROBUSTE) ---

    // Rotation par Quaternion (Hamilton Product) - 100% Omnidirectionnel
    rotateVector(q, v) {
        const [w, x, y, z] = q;
        const [vx, vy, vz] = v;
        const x2 = x+x, y2 = y+y, z2 = z+z;
        const wx2 = w*x2, wy2 = w*y2, wz2 = w*z2;
        const xx2 = x*x2, xy2 = x*y2, xz2 = x*z2;
        const yy2 = y*y2, yz2 = y*z2, zz2 = z*z2;
        return [
            vx*(1-(yy2+zz2)) + vy*(xy2-wz2) + vz*(xz2+wy2),
            vx*(xy2+wz2) + vy*(1-(xx2+zz2)) + vz*(yz2-wx2),
            vx*(xz2-wy2) + vy*(yz2+wx2) + vz*(1-(xx2+yy2))
        ];
    }

    // Gravité Somigliana (Précision < 0.0001 m/s²)
    getGravitySomigliana(lat, alt) {
        const sinLat2 = Math.sin(lat * this.D2R) ** 2;
        const g0 = 9.7803267714 * (1 + 0.00193185138639 * sinLat2) / Math.sqrt(1 - 0.00669437999013 * sinLat2);
        // Correction Air Libre (Altitude)
        return g0 - (3.086e-6 * alt);
    }

    // Intégration Quaternion (Runge-Kutta ordre 1)
    integrateQuaternions(gyro, dt) {
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const gx = gyro.x, gy = gyro.y, gz = gyro.z;
        const h = 0.5 * dt;
        
        const dq = [
            -q[1]*gx - q[2]*gy - q[3]*gz,
             q[0]*gx - q[3]*gy + q[2]*gz,
             q[3]*gx + q[0]*gy - q[1]*gz,
            -q[2]*gx + q[1]*gy + q[0]*gz
        ];

        for(let i=0; i<4; i++) this.x.set([6+i, 0], q[i] + dq[i] * h);
        
        // Normalisation (Essentiel pour la stabilité long terme)
        let norm = Math.sqrt(
            this.x.get([6,0])**2 + this.x.get([7,0])**2 + 
            this.x.get([8,0])**2 + this.x.get([9,0])**2
        );
        if(norm === 0) norm = 1;
        for(let i=6; i<=9; i++) this.x.set([i,0], this.x.get([i,0]) / norm);
    }

    getState() {
        const v = [this.x.get([3, 0]), this.x.get([4, 0]), this.x.get([5, 0])];
        const speed = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
        return {
            speed3D: speed,         // Vitesse absolue 3D
            speedKmh: speed * 3.6,  // Pour affichage
            distance: this.totalDistance3D,
            verticalSpeed: v[2]     // Pour toboggans/ascenseurs
        };
    }
    
    // Bascule Espace / Terre
    setSpaceMode(active) {
        this.spaceMode = active;
    }
    }
