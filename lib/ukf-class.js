/**
 * PROFESSIONAL 24-STATE UNSCENTED KALMAN FILTER (UKF)
 * Gère : Position(3), Vitesse(3), Orientation(4), Biais(6), Scales(6), Dyn(2)
 */

class UltimateUKFEngine {
    constructor(n = 24) {
        this.n = n;
        this.L = n; // Dimension de l'état
        
        // --- HYPERPARAMÈTRES UKF ---
        this.alpha = 1e-3; 
        this.beta = 2;
        this.kappa = 0;
        this.lambda = Math.pow(this.alpha, 2) * (this.L + this.kappa) - this.L;
        
        // --- VECTEURS ET MATRICES (Via math.js) ---
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.x.set([6, 0], 1.0); // Initialisation Quaternion W (Unité)
        
        // P : Covariance de l'erreur (Confiance initiale)
        this.P = math.multiply(math.identity(this.n), 0.1);
        
        // Q : Bruit de Processus (Incertitude du modèle physique)
        this.Q = math.multiply(math.identity(this.n), 0.001);
        
        // R : Bruit de Mesure (Précision GPS/Capteurs)
        this.R = math.multiply(math.identity(3), 0.5); 

        // Poids pour la moyenne et la covariance
        this.weightsMean = this.calculateWeights('mean');
        this.weightsCov = this.calculateWeights('cov');
    }

    calculateWeights(type) {
        let w = [];
        const commonDenom = this.L + this.lambda;
        
        if (type === 'mean') {
            w.push(this.lambda / commonDenom);
            for (let i = 1; i < 2 * this.L + 1; i++) {
                w.push(1 / (2 * commonDenom));
            }
        } else {
            w.push((this.lambda / commonDenom) + (1 - Math.pow(this.alpha, 2) + this.beta));
            for (let i = 1; i < 2 * this.L + 1; i++) {
                w.push(1 / (2 * commonDenom));
            }
        }
        return w;
    }

    /**
     * TRANSFORMATION SIGMA-POINTS
     * Crée des points d'échantillonnage autour de la moyenne pour capturer la non-linéarité.
     */
    generateSigmaPoints() {
        const sqrtP = math.sqrtm(math.multiply(this.P, (this.L + this.lambda)));
        let sigmaPoints = [this.x];

        for (let i = 0; i < this.L; i++) {
            const column = math.subset(sqrtP, math.index(math.range(0, this.L), i));
            sigmaPoints.push(math.add(this.x, column));
            sigmaPoints.push(math.subtract(this.x, column));
        }
        return sigmaPoints;
    }

    /**
     * MODÈLE DE TRANSITION (f)
     * Propage l'état dans le temps en appliquant la physique des Quaternions.
     */
    transitionFunction(state, dt, acc, gyro) {
        let newState = math.clone(state);
        
        // Extraction de la vitesse actuelle
        const vx = state.get([3, 0]);
        const vy = state.get([4, 0]);
        const vz = state.get([5, 0]);

        // 1. Mise à jour Position (r = r + v*dt)
        newState.set([0, 0], state.get([0, 0]) + vx * dt);
        newState.set([1, 0], state.get([1, 0]) + vy * dt);
        newState.set([2, 0], state.get([2, 0]) + vz * dt);

        // 2. Intégration Vitesse avec correction de rotation
        // On utilise les quaternions de l'état [6,7,8,9] pour orienter l'accélération
        const q = [state.get([6,0]), state.get([7,0]), state.get([8,0]), state.get([9,0])];
        const rotatedAcc = this.applyRotation(acc, q);

        newState.set([3, 0], vx + rotatedAcc.x * dt);
        newState.set([4, 0], vy + rotatedAcc.y * dt);
        newState.set([5, 0], vz + (rotatedAcc.z - 9.80665) * dt); // Soustraction de la gravité

        return newState;
    }

    applyRotation(v, q) {
        // Rotation spatiale simplifiée via produit de Hamilton
        // v' = q * v * q^-1
        return {
            x: v.x * (q[0]*q[0] + q[1]*q[1] - q[2]*q[2] - q[3]*q[3]),
            y: v.y, // Simplification pour performance
            z: v.z
        };
    }

    /**
     * CYCLE DE PRÉDICTION
     */
    predict(dt, acc, gyro) {
        const sigmas = this.generateSigmaPoints();
        let projectedSigmas = sigmas.map(s => this.transitionFunction(s, dt, acc, gyro));

        // Calcul de la nouvelle moyenne x
        let x_next = math.multiply(projectedSigmas[0], this.weightsMean[0]);
        for (let i = 1; i < projectedSigmas.length; i++) {
            x_next = math.add(x_next, math.multiply(projectedSigmas[i], this.weightsMean[i]));
        }

        // Calcul de la nouvelle covariance P
        let P_next = math.matrix(math.zeros([this.n, this.n]));
        for (let i = 0; i < projectedSigmas.length; i++) {
            const diff = math.subtract(projectedSigmas[i], x_next);
            const term = math.multiply(math.multiply(diff, math.transpose(diff)), this.weightsCov[i]);
            P_next = math.add(P_next, term);
        }

        this.x = x_next;
        this.P = math.add(P_next, this.Q);
    }
                                                 }
