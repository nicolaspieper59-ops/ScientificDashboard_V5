// =================================================================
// PROFESSIONAL UKF - ULTIMATE CONSOLIDATION (V53 - FORCE EXTERNE)
// Intègre : 21 États, Physique Complète, ZUUV, et Force Externe Modélisée.
// NOUVEAU : Fonction predict prend F_ext_NED = [Fx_N, Fy_E, Fz_D] en Newtons.
// =================================================================

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') {
            console.error("UKF Error: math.js est requis.");
            return;
        }

        this.initialized = false;
        
        // --- CONSTANTES PHYSIQUES AVANCÉES ---
        this.Omega_E = 7.292115e-5; 
        this.R_MAJOR = 6378137.0;   
        this.FLATTENING = 1/298.257223563;
        this.E_SQUARED = 2 * this.FLATTENING - this.FLATTENING**2; 
        
        // --- PARAMÈTRES DE L'OBJET POUR LA TRAÎNÉE (Drag) ---
        this.AREA = 0.5;      
        this.Cd = 1.1;        
        this.RHO_0 = 1.225;   
        this.DEFAULT_MASS = 70.0; 

        // --- VECTEUR D'ÉTAT (21) ---
        this.n = 21; 
        this.x = math.matrix(math.zeros([this.n, 1]));
        this.x.subset(math.index(0, 0), lat);
        this.x.subset(math.index(1, 0), lon); 
        this.x.subset(math.index(2, 0), alt); 
        this.x.subset(math.index(6, 0), 1); 

        // --- PARAMÈTRES UKF & COVARIANCE (P, Q, R) ---
        this.alpha = 1e-3; this.beta = 2; this.kappa = 0;
        this.lambda = (this.alpha**2) * (this.n + this.kappa) - this.n;
        
        const c = 0.5 / (this.n + this.lambda);
        this.Wm = math.zeros([1, 2 * this.n + 1]);
        this.Wc = math.zeros([1, 2 * this.n + 1]);
        this.Wm.subset(math.index(0, 0), this.lambda / (this.n + this.lambda));
        this.Wc.subset(math.index(0, 0), this.Wm.subset(math.index(0, 0)) + (1 - this.alpha**2 + this.beta));
        for (let i = 1; i <= 2 * this.n; i++) {
            this.Wm.subset(math.index(0, i), c);
            this.Wc.subset(math.index(0, i), c);
        }
        
        this.P = math.diag(math.zeros(this.n).map((v, i) => {
            if (i <= 2) return 1e-6; 
            if (i <= 5) return 0.1; 
            return 1e-4; 
        }));

        this.R_GPS = math.diag([0.5, 0.5, 1.5, 0.2, 0.2, 0.2]); 
        this.R_MAG = math.diag([1e-4, 1e-4, 1e-4]); 
        this.R_BARO = math.diag([0.5]); 
        this.R_ZUUV = math.diag([1e-3, 1e-3, 1e-3, 1e-8, 1e-8, 1e-8]); 

        // --- OUTILS MATHS (quaternionToRotationMatrix, q_mult, etc. - non modifiés) ---
        this.D2R = Math.PI / 180; this.R2D = 180 / Math.PI;

        this.quaternionToRotationMatrix = (q) => {
            const [q0, q1, q2, q3] = q;
            return math.matrix([
                [q0*q0+q1*q1-q2*q2-q3*q3, 2*(q1*q2-q0*q3), 2*(q1*q3+q0*q2)],
                [2*(q1*q2+q0*q3), q0*q0-q1*q1+q2*q2-q3*q3, 2*(q2*q3-q0*q1)],
                [2*(q1*q3-q0*q2), 2*(q2*q3+q0*q1), q0*q0-q1*q1-q2*q2+q3*q3]
            ]);
        };
        
        this.quaternionToEuler = (q) => {
            const [q0, q1, q2, q3] = q;
            const roll = Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2));
            let pitch = 2 * (q0 * q2 - q3 * q1);
            pitch = Math.min(Math.max(pitch, -1), 1); 
            pitch = Math.asin(pitch);
            const yaw = Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3));
            return { roll, pitch, yaw };
        };
        
        this.q_mult = (q1, q2) => {
            return [
                q1[0]*q2[0] - q1[1]*q2[1] - q1[2]*q2[2] - q1[3]*q2[3],
                q1[0]*q2[1] + q1[1]*q2[0] + q1[2]*q2[3] - q1[3]*q2[2],
                q1[0]*q2[2] - q1[1]*q2[3] + q1[2]*q2[0] + q1[3]*q2[1],
                q1[0]*q2[3] + q1[1]*q2[2] - q1[2]*q2[1] + q1[3]*q2[0]
            ];
        };

        this.getCurrentMass = () => {
             const massElement = document.getElementById('masse-obj-kg');
             if (massElement) {
                 const massText = massElement.textContent || massElement.value;
                 const mass = parseFloat(massText);
                 if (!isNaN(mass) && mass > 0) return mass;
             }
             return this.DEFAULT_MASS;
        };
    }
    
    // =================================================================
    // A. FONCTION DE PROPAGATION (f) - NOUVEAU PARAMÈTRE F_ext_NED
    // =================================================================
    
    f(x_k_minus, dt, acc, gyro, F_ext_NED) {
         // ... (Extraction État, Biais, etc. - NON MODIFIÉ) ...
         const lat_deg = x_k_minus.subset(math.index(0, 0));
         const alt_m = x_k_minus.subset(math.index(2, 0));
         const V_NED = [x_k_minus.subset(math.index(3, 0)), x_k_minus.subset(math.index(4, 0)), x_k_minus.subset(math.index(5, 0))];
         const Q_prev = [x_k_minus.subset(math.index(6, 0)), x_k_minus.subset(math.index(7, 0)), x_k_minus.subset(math.index(8, 0)), x_k_minus.subset(math.index(9, 0))];
         
         const lat_rad = lat_deg * this.D2R;
         const sinLat = Math.sin(lat_rad);

         const accBias = [x_k_minus.subset(math.index(13, 0)), x_k_minus.subset(math.index(14, 0)), x_k_minus.subset(math.index(15, 0))];
         const gyroBias = [x_k_minus.subset(math.index(10, 0)), x_k_minus.subset(math.index(11, 0)), x_k_minus.subset(math.index(12, 0))];
         const acc_corr = math.subtract([acc.x, acc.y, acc.z], accBias); 
         const gyro_corr = math.subtract([gyro.x, gyro.y, gyro.z], gyroBias);

         // 2. GRAVITÉ (WGS84)
         const g_equator = 9.7803253359;
         const k = 0.00193185265241;
         const e2 = 0.00669437999014;
         let g_loc = g_equator * (1 + k * sinLat**2) / Math.sqrt(1 - e2 * sinLat**2);
         g_loc = g_loc - (3.086e-6 * alt_m); 

         // 3. FORCE DE CORIOLIS
         const Omega_N = this.Omega_E * Math.cos(lat_rad);
         const Omega_D = -this.Omega_E * sinLat;
         const a_cor_N =  2 * Omega_D * V_NED[1]; 
         const a_cor_E = -2 * (Omega_N * V_NED[2] + Omega_D * V_NED[0]);
         const a_cor_D =  2 * Omega_N * V_NED[1];

         // 4. TRAÎNÉE AÉRODYNAMIQUE (Drag)
         const currentMass = this.getCurrentMass();
         const rho = this.RHO_0 * Math.exp(-alt_m / 8500); 
         const speed_sq = V_NED[0]**2 + V_NED[1]**2 + V_NED[2]**2;
         const speed = Math.sqrt(speed_sq);
         
         let a_drag_N = 0, a_drag_E = 0, a_drag_D = 0;
         if (speed > 0.1 && currentMass > 0) {
             const F_drag = 0.5 * rho * speed_sq * this.Cd * this.AREA;
             const a_drag = F_drag / currentMass; 
             a_drag_N = -a_drag * (V_NED[0] / speed);
             a_drag_E = -a_drag * (V_NED[1] / speed);
             a_drag_D = -a_drag * (V_NED[2] / speed);
         }
         
         // 5. NOUVEAU : ACCÉLÉRATION DE LA FORCE EXTERNE (Vent/Courant)
         let a_ext_N = 0, a_ext_E = 0, a_ext_D = 0;
         if (currentMass > 0 && F_ext_NED && F_ext_NED.length === 3) {
             a_ext_N = F_ext_NED[0] / currentMass;
             a_ext_E = F_ext_NED[1] / currentMass;
             a_ext_D = F_ext_NED[2] / currentMass;
         }

         // 6. INTÉGRATION ACCÉLÉRATION NETTE
         const C_b_n = this.quaternionToRotationMatrix(Q_prev); 
         const Acc_NED_Geom = math.multiply(C_b_n, math.matrix(acc_corr));
         
         // a_net = Acc_IMU + a_Coriolis + a_Drag + a_Externe - g
         let ax_n = Acc_NED_Geom.subset(math.index(0, 0)) + a_cor_N + a_drag_N + a_ext_N;
         let ay_n = Acc_NED_Geom.subset(math.index(1, 0)) + a_cor_E + a_drag_E + a_ext_E;
         let az_n = Acc_NED_Geom.subset(math.index(2, 0)) - g_loc + a_cor_D + a_drag_D + a_ext_D; 

         // ZUPT FRONTIÈRE (Friction Numérique minimale)
         const ZUPT_FACTOR = 0.005;
         ax_n -= V_NED[0] * ZUPT_FACTOR;
         ay_n -= V_NED[1] * ZUPT_FACTOR;
         az_n -= V_NED[2] * ZUPT_FACTOR;

         // 7. Mise à jour Vitesse et Position
         const vn_new = V_NED[0] + ax_n * dt;
         const ve_new = V_NED[1] + ay_n * dt;
         const vd_new = V_NED[2] + az_n * dt;

         const Rn = this.R_MAJOR / Math.sqrt(1 - this.E_SQUARED * sinLat**2);
         const Rm = Rn * ((1 - this.E_SQUARED) / (1 - this.E_SQUARED * sinLat**2));
         
         const Lat_new = lat_deg + (vn_new * dt) / (Rm + alt_m) * this.R2D;
         const Lon_new = x_k_minus.subset(math.index(1, 0)) + (ve_new * dt) / ((Rn + alt_m) * Math.cos(lat_rad)) * this.R2D;
         const Alt_new = alt_m - (vd_new * dt);

         // 8. Mise à jour Attitude (Quaternion)
         const w_norm = math.norm(gyro_corr);
         let Q_new;
         if (w_norm > 1e-9) {
             const half_angle = w_norm * dt * 0.5;
             const sin_half = Math.sin(half_angle) / w_norm;
             const dQ = [Math.cos(half_angle), gyro_corr[0] * sin_half, gyro_corr[1] * sin_half, gyro_corr[2] * sin_half];
             Q_new = this.q_mult(Q_prev, dQ);
         } else {
             Q_new = Q_prev;
         }
         const norm_q = Math.sqrt(Q_new[0]**2 + Q_new[1]**2 + Q_new[2]**2 + Q_new[3]**2);
         Q_new = Q_new.map(q => q / norm_q);

         // 9. Construction Nouvel État
         const x_k_new = math.matrix(math.zeros([this.n, 1]));
         x_k_new.subset(math.index(0, 0), Lat_new); x_k_new.subset(math.index(1, 0), Lon_new); x_k_new.subset(math.index(2, 0), Alt_new);
         x_k_new.subset(math.index(3, 0), vn_new); x_k_new.subset(math.index(4, 0), ve_new); x_k_new.subset(math.index(5, 0), vd_new);
         x_k_new.subset(math.index(6, 0), Q_new[0]); x_k_new.subset(math.index(7, 0), Q_new[1]); x_k_new.subset(math.index(8, 0), Q_new[2]); x_k_new.subset(math.index(9, 0), Q_new[3]);
         
         for (let i = 10; i < this.n; i++) x_k_new.subset(math.index(i, 0), x_k_minus.subset(math.index(i, 0)));
         
         return x_k_new;
    }

    // =================================================================
    // D. PRÉDICTION (MODIFIÉE) - Ajout de F_ext_NED
    // =================================================================

    predict(dt, acc, gyro, F_ext_NED = [0, 0, 0]) { // NOUVELLE SIGNATURE
        if (!this.initialized) return;
        
        const rootTerm = math.sqrt(this.n + this.lambda);
        const S = math.multiply(rootTerm, math.sqrtm(this.P));
        const Chi = math.zeros([this.n, 2 * this.n + 1]);
        Chi.subset(math.index(math.range(0, this.n), 0), this.x);
        for (let i = 0; i < this.n; i++) {
            const S_col = math.subset(S, math.index(math.range(0, this.n), i));
            Chi.subset(math.index(math.range(0, this.n), i + 1), math.add(this.x, S_col));
            Chi.subset(math.index(math.range(0, this.n), i + this.n + 1), math.subtract(this.x, S_col));
        }

        const Chi_next = math.zeros([this.n, 2 * this.n + 1]);
        let x_pred = math.zeros([this.n, 1]);
        for (let i = 0; i <= 2 * this.n; i++) {
            const state = Chi.subset(math.index(math.range(0, this.n), i));
            // Passage du F_ext_NED à la fonction de propagation (f)
            const next_state = this.f(state, dt, acc, gyro, F_ext_NED); 
            Chi_next.subset(math.index(math.range(0, this.n), i), next_state);
            x_pred = math.add(x_pred, math.multiply(this.Wm.subset(math.index(0, i)), next_state));
        }
        this.x = x_pred;
        
        let P_pred = math.zeros([this.n, this.n]); 
        const Q = math.diag(math.zeros(this.n).map((v, i) => i<=5 ? 1e-4*dt : 1e-6*dt));
        P_pred = math.add(P_pred, Q);

        for (let i = 0; i <= 2 * this.n; i++) {
            const diff = math.subtract(Chi_next.subset(math.index(math.range(0, this.n), i)), this.x);
            P_pred = math.add(P_pred, math.multiply(this.Wc.subset(math.index(0, i)), math.multiply(diff, math.transpose(diff))));
        }
        this.P = P_pred;
        
        const q = [this.x.subset(math.index(6, 0)), this.x.subset(math.index(7, 0)), this.x.subset(math.index(8, 0)), this.x.subset(math.index(9, 0))];
        const nq = Math.sqrt(q[0]**2+q[1]**2+q[2]**2+q[3]**2);
        this.x.subset(math.index(6, 0), q[0]/nq); this.x.subset(math.index(7, 0), q[1]/nq); this.x.subset(math.index(8, 0), q[2]/nq); this.x.subset(math.index(9, 0), q[3]/nq);
    }
    
    // ... (Reste des fonctions UKF_Update_Core, h_GPS, h_MAG, update, etc. - NON MODIFIÉES) ...

    UKF_Update_Core(m, R, y_k, h) {
        // 
        const rootTerm = math.sqrt(this.n + this.lambda); 
        const sqrtP = math.sqrtm(this.P); 
        const S = math.multiply(rootTerm, sqrtP);
        
        const Chi = math.zeros([this.n, 2 * this.n + 1]);
        Chi.subset(math.index(math.range(0, this.n), 0), this.x);
        for (let i = 0; i < this.n; i++) {
            const S_col = math.subset(S, math.index(math.range(0, this.n), i));
            Chi.subset(math.index(math.range(0, this.n), i + 1), math.add(this.x, S_col));
            Chi.subset(math.index(math.range(0, this.n), i + this.n + 1), math.subtract(this.x, S_col));
        }
        
        const Y = math.zeros([m, 2 * this.n + 1]);
        for (let i = 0; i <= 2 * this.n; i++) {
            Y.subset(math.index(math.range(0, m), i), h(Chi.subset(math.index(math.range(0, this.n), i))));
        }
        
        let y_mean = math.zeros([m, 1]);
        for (let i = 0; i <= 2 * this.n; i++) y_mean = math.add(y_mean, math.multiply(this.Wm.subset(math.index(0, i)), math.subset(Y, math.index(math.range(0, m), i))));

        let Pyy = R; 
        let Pxy = math.zeros([this.n, m]); 
        for (let i = 0; i <= 2 * this.n; i++) {
            const Y_col = math.subset(Y, math.index(math.range(0, m), i));
            const Chi_col = Chi.subset(math.index(math.range(0, this.n), i));
            const dy = math.subtract(Y_col, y_mean);
            const dx = math.subtract(Chi_col, this.x);
            const wc = this.Wc.subset(math.index(0, i));
            Pyy = math.add(Pyy, math.multiply(wc, math.multiply(dy, math.transpose(dy))));
            Pxy = math.add(Pxy, math.multiply(wc, math.multiply(dx, math.transpose(dy))));
        }

        const K = math.multiply(Pxy, math.inv(Pyy));
        this.x = math.add(this.x, math.multiply(K, math.subtract(y_k, y_mean)));
        this.P = math.subtract(this.P, math.multiply(K, math.multiply(Pyy, math.transpose(K))));

        const q = [this.x.subset(math.index(6, 0)), this.x.subset(math.index(7, 0)), this.x.subset(math.index(8, 0)), this.x.subset(math.index(9, 0))];
        const nq = Math.sqrt(q[0]**2+q[1]**2+q[2]**2+q[3]**2);
        this.x.subset(math.index(6, 0), q[0]/nq); this.x.subset(math.index(7, 0), q[1]/nq); this.x.subset(math.index(8, 0), q[2]/nq); this.x.subset(math.index(9, 0), q[3]/nq);
    }

    h_GPS(x) { return x.subset(math.index([0, 1, 2, 3, 4, 5], 0)); }
    h_MAG(x) { 
        const B_NED = math.matrix([[22.0], [5.0], [45.0]]); 
        const q = [x.subset(math.index(6, 0)), x.subset(math.index(7, 0)), x.subset(math.index(8, 0)), x.subset(math.index(9, 0))];
        return math.multiply(math.transpose(this.quaternionToRotationMatrix(q)), B_NED); 
    }
    h_BARO(x) { return x.subset(math.index([2], 0)); }
    h_ZUUV(x) { 
        return math.matrix([
            [x.subset(math.index(3, 0))],  // vN
            [x.subset(math.index(4, 0))],  // vE
            [x.subset(math.index(5, 0))],  // vD
            [x.subset(math.index(10, 0))], // Gyro Bias X
            [x.subset(math.index(11, 0))], // Gyro Bias Y
            [x.subset(math.index(12, 0))]  // Gyro Bias Z
        ]); 
    }

    update(gps) {
        if (!this.initialized) return;
        const c = gps.coords;
        const vn = c.speed * Math.cos(c.heading * this.D2R);
        const ve = c.speed * Math.sin(c.heading * this.D2R);
        const y = math.matrix([[c.latitude], [c.longitude], [c.altitude||0], [vn||0], [ve||0], [0]]);
        this.UKF_Update_Core(6, this.R_GPS, y, this.h_GPS.bind(this));
    }
    update_Mag(mag) {
        if (!this.initialized) return;
        const y = math.matrix([[mag.x], [mag.y], [mag.z]]);
        this.UKF_Update_Core(3, this.R_MAG, y, this.h_MAG.bind(this));
    }
    update_Baro(alt) {
        if (!this.initialized) return;
        const y = math.matrix([[alt]]);
        this.UKF_Update_Core(1, this.R_BARO, y, this.h_BARO.bind(this));
    }
    update_ZUUV() {
        if (!this.initialized) return;
        const y = math.matrix(math.zeros([6, 1])); 
        this.UKF_Update_Core(6, this.R_ZUUV, y, this.h_ZUUV.bind(this));
    }

    // --- INTERFACE (Accesseurs) ---
    initialize(lat, lon, alt) {
        if (this.initialized) return;
        this.x.subset(math.index(0, 0), lat); this.x.subset(math.index(1, 0), lon); this.x.subset(math.index(2, 0), alt);
        this.P = math.multiply(this.P, 0.1); 
        this.initialized = true;
    }
    reset(lat, lon, alt) { this.initialize(lat, lon, alt); }
    isInitialized() { return this.initialized; }
    
    getState() {
        const q = [this.x.subset(math.index(6,0)), this.x.subset(math.index(7,0)), this.x.subset(math.index(8,0)), this.x.subset(math.index(9,0))];
        const e = this.quaternionToEuler(q);
        const vx=this.x.subset(math.index(3,0)), vy=this.x.subset(math.index(4,0)), vz=this.x.subset(math.index(5,0));
        return {
            lat: this.x.subset(math.index(0,0)), lon: this.x.subset(math.index(1,0)), alt: this.x.subset(math.index(2,0)),
            speed: Math.sqrt(vx**2+vy**2+vz**2), vel_D: vz,
            pitch: e.pitch, roll: e.roll, yaw: e.yaw * this.R2D 
        };
    }
}
window.ProfessionalUKF = ProfessionalUKF;
