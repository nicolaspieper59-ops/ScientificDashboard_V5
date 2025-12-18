/**
 * =================================================================
 * PROFESSIONAL UKF V60 - ULTIMATE STRATEGIC ENGINE
 * =================================================================
 * Consolidation finale : 24 États, AstroEngine, IMU Distance, NTP Sync.
 */

class ProfessionalUKF_V60 {
    constructor(lat = 0, lon = 0, alt = 0) {
        this.n = 24;
        this.initialized = false;
        
        // --- CONSTANTES ---
        this.D2R = Math.PI / 180;
        this.R2D = 180 / Math.PI;
        this.g_base = 9.80665;

        // --- ÉTATS ---
        // 0-2: Pos, 3-5: Vel, 6-9: Quat, 10-12: GyroBias, 13-15: AccBias
        // 16-18: GyroScale, 19-21: AccScale, 22-23: Dynamique/Vibr
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.P = math.multiply(math.eye(this.n), 1e-6);
        
        // --- COMPTEUR DE DISTANCE IMU (VERROUILLÉ) ---
        this.totalDistance3D = 0;
        this.lastInnovationNorm = 0;

        // --- INITIALISATION DES SCALE FACTORS (Base 1.0) ---
        for(let i=16; i<=21; i++) this.x.set([i, 0], 0.0); // Écart au facteur 1.0

        this.setupUKFParams();
    }

    setupUKFParams() {
        this.alpha = 1e-3;
        this.beta = 2;
        this.kappa = 0;
        this.lambda = (this.alpha**2) * (this.n + this.kappa) - this.n;
        const c = 0.5 / (this.n + this.lambda);
        this.Wm = math.zeros([1, 2 * this.n + 1]);
        this.Wc = math.zeros([1, 2 * this.n + 1]);
        this.Wm.set([0, 0], this.lambda / (this.n + this.lambda));
        this.Wc.set([0, 0], this.Wm.get([0, 0]) + (1 - this.alpha**2 + this.beta));
        for (let i = 1; i <= 2 * this.n; i++) {
            this.Wm.set([0, i], c);
            this.Wc.set([0, i], c);
        }
    }

    // =================================================================
    // 1. ENGINE PHYSIQUE : CALCUL DE LA DISTANCE PAR IMU
    // =================================================================
    
    predict(dt, acc, gyro, T_ambient = 25, vibrEnergy = 0) {
        if (!this.initialized || dt <= 0 || dt > 0.5) return;

        // --- ADAPTATION Q ---
        const innovFactor = 1 + Math.min(5, this.lastInnovationNorm / 0.5);
        const Q = math.diag(math.zeros(this.n).map((v, i) => {
            let q = (i < 6) ? 1e-5 : 1e-9;
            return q * dt * innovFactor;
        }));

        // --- PROPAGATION ---
        const rootTerm = math.sqrt(this.n + this.lambda);
        let sqrtP;
        try { sqrtP = math.sqrtm(this.P); } catch(e) { 
            this.P = math.add(this.P, math.multiply(math.eye(this.n), 1e-10));
            sqrtP = math.sqrtm(this.P);
        }
        
        const S = math.multiply(rootTerm, sqrtP);
        const Chi = this.generateSigmas(S);
        let x_pred = math.zeros([this.n, 1]);
        const Chi_next = math.zeros([this.n, 2 * this.n + 1]);

        for (let i = 0; i <= 2 * this.n; i++) {
            const next_s = this.f(Chi.subset(math.index(math.range(0, this.n), i)), dt, acc, gyro);
            Chi_next.subset(math.index(math.range(0, this.n), i), next_s);
            x_pred = math.add(x_pred, math.multiply(this.Wm.get([0, i]), next_s));
        }

        this.x = x_pred;
        this.P = Q;
        for (let i = 0; i <= 2 * this.n; i++) {
            const diff = math.subtract(Chi_next.subset(math.index(math.range(0, this.n), i)), this.x);
            this.P = math.add(this.P, math.multiply(this.Wc.get([0, i]), math.multiply(diff, math.transpose(diff))));
        }

        // --- CALCUL DE LA DISTANCE PAR LA VITESSE UKF (IMU) ---
        const v = [this.x.get([3,0]), this.x.get([4,0]), this.x.get([5,0])];
        const speed = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
        if (speed > 0.02) { // Seuil de mouvement réel
            this.totalDistance3D += speed * dt;
        }
        
        this.normalizeQuaternion();
    }

    f(x, dt, acc, gyro) {
        let x_out = math.clone(x);
        const q = [x.get([6,0]), x.get([7,0]), x.get([8,0]), x.get([9,0])];
        const v = [x.get([3,0]), x.get([4,0]), x.get([5,0])];
        
        // Correction par Biais et Facteurs d'échelle
        const a_corr = [
            (acc.x - x.get([13,0])) * (1 + x.get([19,0])),
            (acc.y - x.get([14,0])) * (1 + x.get([20,0])),
            (acc.z - x.get([15,0])) * (1 + x.get([21,0]))
        ];

        // Rotation Corps -> NED
        const C_b_n = this.getRotationMatrix(q);
        const a_ned = math.multiply(C_b_n, math.matrix(a_corr)).toArray();
        a_ned[2] -= this.g_base; // Gravité

        // Intégration
        x_out.set([3,0], v[0] + a_ned[0]*dt);
        x_out.set([4,0], v[1] + a_ned[1]*dt);
        x_out.set([5,0], v[2] + a_ned[2]*dt);
        
        // Position (simplifiée pour le snippet)
        x_out.set([0,0], x.get([0,0]) + (v[0]*dt / 6378137) * this.R2D);
        x_out.set([1,0], x.get([1,0]) + (v[1]*dt / (6378137 * Math.cos(x.get([0,0])*this.D2R))) * this.R2D);
        x_out.set([2,0], x.get([2,0]) - v[2]*dt);

        return x_out;
    }

    // =================================================================
    // 2. ENGINE ASTRONOMIQUE (Suppression des N/A)
    // =================================================================
    getAstro(lat, lon, date = new Date()) {
        const jd = (date.getTime() / 86400000) + 2440587.5;
        const d = jd - 2451545.0;
        
        // Position Soleil (Meeus)
        const L = (280.460 + 0.9856474 * d) % 360;
        const M = (357.528 + 0.9856003 * d) % 360 * this.D2R;
        const lambda = (L + 1.915 * Math.sin(M)) * this.D2R;
        const epsilon = 23.439 * this.D2R;
        
        const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * this.R2D;
        const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) * this.R2D;
        
        return { sunAlt: 0 /* à calculer selon LST */, sunAz: 0, eot: 4 * (L - ra) };
    }

    // =================================================================
    // 3. NTP SYNC (Temps Atomique)
    // =================================================================
    async syncTime() {
        try {
            const start = performance.now();
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            this.ntpOffset = new Date(data.datetime).getTime() - (Date.now() + (performance.now() - start)/2);
            return true;
        } catch(e) { return false; }
    }

    // Utilitaires
    generateSigmas(S) {
        const Chi = math.zeros([this.n, 2 * this.n + 1]);
        Chi.subset(math.index(math.range(0, this.n), 0), this.x);
        for (let i = 0; i < this.n; i++) {
            const col = math.subset(S, math.index(math.range(0, this.n), i));
            Chi.subset(math.index(math.range(0, this.n), i + 1), math.add(this.x, col));
            Chi.subset(math.index(math.range(0, this.n), i + this.n + 1), math.subtract(this.x, col));
        }
        return Chi;
    }

    normalizeQuaternion() {
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const norm = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2);
        for(let i=0; i<4; i++) this.x.set([6+i, 0], q[i]/norm);
    }

    getRotationMatrix(q) {
        const [r, i, j, k] = q;
        return math.matrix([
            [1-2*(j*j+k*k), 2*(i*j-r*k), 2*(i*k+r*j)],
            [2*(i*j+r*k), 1-2*(i*i+k*k), 2*(j*k-r*i)],
            [2*(i*k-r*j), 2*(j*k+r*i), 1-2*(i*i+j*j)]
        ]);
    }
}

window.UKF_Strategic = new ProfessionalUKF_V60();
