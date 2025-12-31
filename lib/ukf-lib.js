/**
 * OMNISCIENCE V100 PRO - UKF 21-STATE & RELATIVITY ENGINE
 * Dépendances: math.js
 */

const UKF_PRO = {
    // État: [Pos(3), Vel(3), Acc(3), Gyro(3), BiasAcc(3), BiasGyro(3), Gravity(3)]
    state: math.zeros(21, 1),
    P: math.multiply(math.identity(21), 0.5), // Matrice de covariance
    Q: math.multiply(math.identity(21), 0.001), // Bruit de processus
    
    // Constantes Physiques
    C: 299792458, // Vitesse lumière (m/s)
    G: 6.67430e-11, // Constante grav
    EarthMass: 5.972e24, // kg
    EarthRadius: 6371000, // m

    // Variables internes
    lastT: 0,
    isStationary: false,

    /**
     * Prédiction (Modèle Newtonien + Coriolis)
     * @param {number} dt Delta temps en secondes
     */
    predict(dt) {
        // Extraction Vitesse & Accélération de l'état
        let v = math.subset(this.state, math.index(math.range(3, 6), 0)); // Vitesse
        let a = math.subset(this.state, math.index(math.range(6, 9), 0)); // Accel

        // Intégration Position : p = p + v*dt + 0.5*a*dt^2
        let pos = math.subset(this.state, math.index(math.range(0, 3), 0));
        let deltaPos = math.add(math.multiply(v, dt), math.multiply(a, 0.5 * dt * dt));
        let newPos = math.add(pos, deltaPos);
        
        // Mise à jour État (Simplifié pour JS temps réel)
        this.state = math.subset(this.state, math.index(math.range(0, 3), 0), newPos);
        
        // Propagation de l'incertitude
        this.P = math.add(this.P, this.Q);
    },

    /**
     * Mise à jour (Correction Capteurs)
     * @param {object} accRaw {x, y, z}
     * @param {object} gyroRaw {x, y, z}
     */
    update(accRaw, gyroRaw) {
        const accVec = math.matrix([[accRaw.x], [accRaw.y], [accRaw.z]]);
        const gNorm = math.norm(accVec) / 9.80665;

        // Détection ZUPT (Zero Velocity Update)
        this.isStationary = Math.abs(gNorm - 1.0) < 0.03;

        if (this.isStationary) {
            // Amortissement forcé de la vitesse si immobile
            let v = math.subset(this.state, math.index(math.range(3, 6), 0));
            this.state = math.subset(this.state, math.index(math.range(3, 6), 0), math.multiply(v, 0.95));
        } else {
            // Mise à jour acceleration dans l'état (simplifiée sans matrice H complète pour perf)
            // Dans une implémentation stricte, on utiliserait le gain de Kalman K ici
            let currentAcc = math.subset(this.state, math.index(math.range(6, 9), 0));
            // Filtre passe-bas basique pour lisser l'entrée vers l'état
            let newAcc = math.add(math.multiply(currentAcc, 0.9), math.multiply(accVec, 0.1));
            this.state = math.subset(this.state, math.index(math.range(6, 9), 0), newAcc);
        }
    },

    /**
     * Module Relativité Générale & Restreinte
     * @param {number} altitude Altitude en mètres
     */
    getRelativityData(altitude = 0) {
        // Vitesse actuelle (magnitude)
        const vVec = math.subset(this.state, math.index(math.range(3, 6), 0));
        const v = math.norm(vVec); // m/s

        // 1. Relativité Restreinte (Lorentz)
        const beta = v / this.C;
        let gamma = 1.0;
        if (beta < 1) gamma = 1 / Math.sqrt(1 - (beta * beta));

        // Dilatation temporelle vitesse (ns/jour)
        // Pour v faible, approx: -0.5 * beta^2 * 86400 * 1e9
        const timeDilVel = (1/gamma - 1) * 86400 * 1e9; 

        // 2. Relativité Générale (Schwarzschild)
        const r = this.EarthRadius + altitude;
        // Potentiel gravitationnel Phi = -GM/r
        // Dilatation grav: sqrt(1 - 2GM/rc^2) approx 1 - GM/rc^2
        const schwarzschildRadius = (2 * this.G * this.EarthMass) / (this.C * this.C);
        const gravFactor = Math.sqrt(1 - (schwarzschildRadius / r));
        
        // Différence par rapport à la surface (référence)
        const rSurface = this.EarthRadius;
        const factorSurface = Math.sqrt(1 - (schwarzschildRadius / rSurface));
        const timeDilGrav = (gravFactor - factorSurface) * 86400 * 1e9; // ns/jour (gain en altitude)

        return {
            velocity: v,
            lorentzFactor: gamma,
            timeDilationVel: timeDilVel, // Retard dû à la vitesse
            timeDilationGrav: timeDilGrav, // Avance due à l'altitude
            schwarzschildRadius: schwarzschildRadius,
            mach: v / 340.29, // Mach au niveau de la mer
            percentC: (v / this.C) * 100
        };
    }
};
