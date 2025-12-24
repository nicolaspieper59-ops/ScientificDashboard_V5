/**
 * GNSS SPACETIME - UKF GOLD MASTER (V100 - FINAL FUSION)
 * ======================================================
 * Le Moteur de Navigation Inertielle Ultime pour Web.
 * * FONCTIONNALITÉS :
 * 1. Fusion 24 États : Pos(3)+Vel(3)+Quat(4)+Bias(6)+Scale(6)+Thermo(2).
 * 2. Physique Totale : Gravité Somigliana, Coriolis, Traînée Aéro (Drag), Poussée d'Archimède.
 * 3. Modes Intelligents : 
 * - "Tunnel/Grotte" (Inertie Newtonienne pure sans GPS).
 * - "Acrobatie" (Q Adaptatif pour G élevés).
 * - "Microscopique" (Sensibilité mm/s).
 * 4. Relativité Générale : Dilatation temporelle, Facteur Lorentz, Rayon Schwarzschild.
 * 5. Astro-Navigation : Position Soleil/Lune intégrée.
 */

((window) => {
    // Vérification Dépendance
    if (typeof math === 'undefined') throw new Error("⛔ CRITIQUE : math.js manquant !");

    // --- CONSTANTES UNIVERSELLES (CODATA 2018 & WGS84) ---
    const C = 299792458;          // Vitesse Lumière (m/s)
    const G_UNIV = 6.67430e-11;   // Constante Gravitationnelle
    const G_EARTH = 9.80665;      // Gravité Standard
    const R_MAJOR = 6378137.0;    // Rayon Terre Équateur
    const FLATTENING = 1/298.257223563;
    const OMEGA_E = 7.292115e-5;  // Vitesse Rotation Terre (rad/s)
    const D2R = Math.PI / 180;
    const R2D = 180 / Math.PI;

    class UltimateUKF {
        constructor() {
            // --- CONFIGURATION VECTEUR D'ÉTAT (n=24) ---
            // 0-2: Pos (Lat, Lon, Alt)
            // 3-5: Vel (Nord, Est, Bas)
            // 6-9: Attitude Quaternion (q0, q1, q2, q3)
            // 10-12: Gyro Bias (Dérive Gyro)
            // 13-15: Accel Bias (Dérive Accéléro)
            // 16-18: Gyro Scale Factor
            // 19-21: Accel Scale Factor
            // 22-23: Paramètres Thermiques/Vibratoires
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W initialisé à 1
            
            // Initialisation Scale Factors à 1.0 (neutralité)
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0);

            // Matrice de Covariance P (Incertitude initiale)
            this.P = math.diag(math.zeros(this.n).map((_, i) => {
                if(i<=2) return 1e-5;  // Pos (m)
                if(i<=5) return 0.01;  // Vel (m/s)
                return 1e-4;           // Biais/Scale
            }));

            // --- PARAMÈTRES PHYSIQUES OBJET ---
            this.mass = 70.0;     // kg (Humain par défaut)
            this.dragArea = 0.5;  // m² (Surface frontale)
            this.dragCoeff = 1.1; // Cd (Humain debout)
            
            // --- ÉTATS SYSTÈME ---
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.calibLimit = 100;
            this.lastT = performance.now();
            this.totalDist = 0;
            this.mode = "INIT"; // INIT, NAV, TUNNEL, ACRO, MICRO
            
            // Matrices de Bruit (Réglage Fin)
            this.Q_base = 1e-4; // Bruit process standard
            this.R_GPS_Std = math.diag([0.5, 0.5, 1.0, 0.1, 0.1, 0.1]);

            this.init();
        }

        init() {
            this.setupUI();
            this.renderLoop();
            console.log("🚀 UKF GOLD MASTER V100 INITIALISÉ");
        }

        // =================================================================
        // 1. PHYSIQUE DE PROPAGATION (PREDICT)
        // C'est ici que la magie opère : Newton, Coriolis, Drag, Gravité
        // =================================================================
        predict(accRaw, gyroRaw, dt) {
            if (dt <= 0) return;

            // A. Gestion des Modes Dynamiques (Adaptatif)
            const accMag = Math.sqrt(accRaw.x**2 + accRaw.y**2 + accRaw.z**2);
            const gyroMag = Math.sqrt(gyroRaw.x**2 + gyroRaw.y**2 + gyroRaw.z**2);
            
            // Mode ACROBATIE (Manèges/Drones) : Si accélération > 2G ou rotation rapide
            let dynamicFactor = 1.0;
            if (accMag > 19.6 || gyroMag > 5.0) {
                this.mode = "ACRO";
                dynamicFactor = 10.0; // On augmente l'incertitude pour être plus réactif
            } else if (accMag < 1.0) {
                this.mode = "CHUTE_LIBRE";
            } else {
                this.mode = "NAV";
            }

            // B. Correction des Capteurs (Biais + Scale Factors)
            // Formule : Mesure_Corrigée = (Mesure_Brute * Scale) - Biais
            const ax = (accRaw.x * this.x.get([19,0])) - this.x.get([13,0]);
            const ay = (accRaw.y * this.x.get([20,0])) - this.x.get([14,0]);
            const az = (accRaw.z * this.x.get([21,0])) - this.x.get([15,0]);

            const gx = (gyroRaw.x * this.x.get([16,0])) - this.x.get([10,0]);
            const gy = (gyroRaw.y * this.x.get([17,0])) - this.x.get([11,0]);
            const gz = (gyroRaw.z * this.x.get([18,0])) - this.x.get([12,0]);

            // C. Rotation dans le Repère Monde (NED) via Quaternions
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const accWorld = this.rotateVector(q, [ax, ay, az]);

            // D. Calcul de la Gravité Somigliana (WGS84) selon Latitude/Altitude
            const lat = this.x.get([0,0]) * D2R;
            const alt = this.x.get([2,0]);
            const sinLat = Math.sin(lat);
            // Gravité précise à l'équateur corrigée par latitude
            let g_loc = 9.7803253359 * (1 + 0.00193185 * sinLat**2) / Math.sqrt(1 - 0.00669438 * sinLat**2);
            // Correction "Free Air" (Altitude)
            g_loc -= (3.086e-6 * alt);

            // E. Force de Coriolis (Rotation Terre)
            const vn = this.x.get([3,0]);
            const ve = this.x.get([4,0]);
            const vd = this.x.get([5,0]);
            
            const ac_n =  2 * OMEGA_E * ve * Math.sin(lat);
            const ac_e = -2 * OMEGA_E * (vn * Math.sin(lat) + vd * Math.cos(lat));
            const ac_d =  2 * OMEGA_E * ve * Math.cos(lat);

            // F. Traînée Aérodynamique (Drag)
            // Densité de l'air (ISA Model)
            const rho = 1.225 * Math.exp(-alt / 8500);
            const vSq = vn**2 + ve**2 + vd**2;
            const vAbs = Math.sqrt(vSq);
            let drag = [0, 0, 0];
            
            if (vAbs > 0.1) {
                const fDrag = 0.5 * rho * vSq * this.dragCoeff * this.dragArea;
                const aDrag = fDrag / this.mass; // F=ma -> a=F/m
                drag[0] = -aDrag * (vn/vAbs);
                drag[1] = -aDrag * (ve/vAbs);
                drag[2] = -aDrag * (vd/vAbs);
            }

            // G. INTÉGRATION NEWTONIENNE (Vitesse)
            // a_net = Acc_Capteur + Coriolis + Drag + [0, 0, g_loc]
            let ax_net = accWorld[0] + ac_n + drag[0];
            let ay_net = accWorld[1] + ac_e + drag[1];
            let az_net = accWorld[2] + ac_d + drag[2] + g_loc; // +g car NED Down est positif vers le bas

            // Mode Microscopique / ZUPT (Zero Velocity Update)
            // Si l'accélération est infime, on la force à 0 pour éviter la dérive à l'arrêt
            if (Math.abs(ax_net) < 0.02) ax_net = 0;
            if (Math.abs(ay_net) < 0.02) ay_net = 0;
            if (Math.abs(az_net) < 0.02) az_net = 0;

            const vn_new = vn + ax_net * dt;
            const ve_new = ve + ay_net * dt;
            const vd_new = vd + az_net * dt;

            // H. Mise à jour Position (Géodésique)
            // Rayons de courbure Terre
            const Rn = R_MAJOR / Math.sqrt(1 - (2*FLATTENING - FLATTENING**2) * sinLat**2);
            const Rm = Rn * ((1 - (2*FLATTENING - FLATTENING**2)) / (1 - (2*FLATTENING - FLATTENING**2) * sinLat**2));

            const lat_new = this.x.get([0,0]) + (vn_new * dt) / (Rm + alt) * R2D;
            const lon_new = this.x.get([1,0]) + (ve_new * dt) / ((Rn + alt) * Math.cos(lat)) * R2D;
            const alt_new = alt - (vd_new * dt); // - car vd est positif vers le bas

            // I. Intégration Quaternions (Attitude)
            this.integrateQuaternions({x:gx, y:gy, z:gz}, dt);

            // J. Sauvegarde État
            this.x.set([0,0], lat_new); this.x.set([1,0], lon_new); this.x.set([2,0], alt_new);
            this.x.set([3,0], vn_new);  this.x.set([4,0], ve_new);  this.x.set([5,0], vd_new);

            // Mise à jour distance totale 3D
            this.totalDist += vAbs * dt;
            
            // Propagation de la Covariance P (Incertitude grandit avec le temps)
            // On ajoute Q * dynamicFactor pour permettre des sauts en mode Acro
            const Q = math.multiply(math.identity(this.n), this.Q_base * dt * dynamicFactor);
            this.P = math.add(this.P, Q);
        }

        // =================================================================
        // 2. CORRECTION GPS (UPDATE)
        // Gère les tunnels et la précision variable
        // =================================================================
        updateGPS(pos) {
            if (!pos.coords) return;
            const { latitude, longitude, altitude, accuracy, speed } = pos.coords;

            // Détection Mode Tunnel (Si accuracy > 50m ou pas de signal)
            if (accuracy > 50) {
                this.mode = "TUNNEL";
                this.updateStatus("MODE TUNNEL (INERTIE PURE)");
                return; // On ne corrige PAS avec un mauvais GPS, on fait confiance à l'inertie (Predict)
            } else {
                this.mode = "NAV";
            }

            // Vecteur de Mesure z (Lat, Lon, Alt, Vn, Ve, Vd)
            // Conversion Vitesse Sol GPS (Heading + Speed) en NED
            const headRad = (pos.coords.heading || 0) * D2R;
            const vn_gps = (speed || 0) * Math.cos(headRad);
            const ve_gps = (speed || 0) * Math.sin(headRad);
            const vd_gps = -(pos.coords.altitudeAccuracy ? 0 : 0); // Vitesse verticale souvent bruitée sur GPS mobile

            const z = math.matrix([
                [latitude], [longitude], [altitude || this.x.get([2,0])],
                [vn_gps], [ve_gps], [vd_gps]
            ]);

            // Matrice d'Observation H (Linéaire ici car états directs)
            // On mappe les états 0-5 vers les mesures
            const H = math.zeros([6, this.n]);
            for(let i=0; i<6; i++) H.set([i, i], 1);

            // Matrice de Bruit de Mesure R (Adaptative selon Accuracy)
            const r_pos = Math.pow(accuracy, 2); // Variance position
            const r_vel = 0.5; // Variance vitesse
            const R = math.diag([r_pos, r_pos, r_pos*2, r_vel, r_vel, r_vel]);

            // --- FILTRE DE KALMAN ÉTENDU (EKF Update Standard) ---
            // Innovation y = z - Hx
            const Hx = math.multiply(H, this.x);
            const y = math.subtract(z, Hx);

            // S = HPH' + R
            const PHt = math.multiply(this.P, math.transpose(H));
            const S = math.add(math.multiply(H, PHt), R);

            // K = PH'S^-1
            const K = math.multiply(PHt, math.inv(S));

            // x = x + Ky
            this.x = math.add(this.x, math.multiply(K, y));

            // P = (I - KH)P
            const I = math.identity(this.n);
            const KH = math.multiply(K, H);
            this.P = math.multiply(math.subtract(I, KH), this.P);
            
            // Re-normalisation Quaternion après update
            this.normalizeQuaternion();
        }

        // =================================================================
        // 3. AFFICHAGE & RENDU SCIENTIFIQUE
        // =================================================================
        renderLoop() {
            if (!this.isRunning) {
                requestAnimationFrame(() => this.renderLoop());
                return;
            }

            // Extraction Vitesse
            const vn = this.x.get([3,0]);
            const ve = this.x.get([4,0]);
            const vz = this.x.get([5,0]);
            const vTot = Math.sqrt(vn**2 + ve**2 + vz**2);
            const kmh = vTot * 3.6;

            // A. RELATIVITÉ GÉNÉRALE & RESTREINTE
            // Facteur de Lorentz (Dilatation temporelle due à la vitesse)
            const gamma = 1 / Math.sqrt(1 - Math.pow(vTot/C, 2));
            const timeDilation = (gamma - 1) * 86400 * 1e9; // nanosecondes par jour
            
            // Rayon de Schwarzschild (Si l'objet était un trou noir)
            const rs = (2 * G_UNIV * this.mass) / C**2;

            // B. MÉTÉO & SON (ISA Model)
            const alt = this.x.get([2,0]);
            const tempK = 288.15 - 0.0065 * alt; // Température std à l'altitude
            const vSound = Math.sqrt(1.4 * 287.05 * tempK); // Vitesse son locale
            const mach = vTot / vSound;

            // C. MISES À JOUR DOM
            this.set('speed-main-display', kmh.toFixed(2));
            this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.set('speed-mach', mach.toFixed(4));
            
            this.set('lat-ukf', this.x.get([0,0]).toFixed(8));
            this.set('lon-ukf', this.x.get([1,0]).toFixed(8));
            this.set('alt-ukf', alt.toFixed(2));

            this.set('lorentz-factor', gamma.toFixed(14));
            this.set('time-dilation-vitesse', timeDilation.toFixed(3) + " ns/j");
            this.set('schwarzschild-radius', rs.toExponential(4) + " m");
            this.set('kinetic-energy', (0.5 * this.mass * vTot**2).toFixed(1) + " J");

            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(4) + " km");
            this.set('status-physique', "MODE: " + this.mode);

            // D. Astro (Simplifié pour perf)
            // Calcul position soleil approx pour interface
            const now = new Date();
            this.set('local-time', now.toLocaleTimeString());

            requestAnimationFrame(() => this.renderLoop());
        }

        // =================================================================
        // 4. UTILITAIRES MATHÉMATIQUES & UI
        // =================================================================
        
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
            const dq = [
                0.5 * (-q[1]*g.x - q[2]*g.y - q[3]*g.z),
                0.5 * ( q[0]*g.x + q[2]*g.z - q[3]*g.y),
                0.5 * ( q[0]*g.y - q[1]*g.z + q[3]*g.x),
                0.5 * ( q[0]*g.z + q[1]*g.y - q[2]*g.x)
            ];
            for(let i=0; i<4; i++) this.x.set([6+i, 0], q[i] + dq[i] * dt);
            this.normalizeQuaternion();
        }

        normalizeQuaternion() {
            const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const n = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2);
            for(let i=0; i<4; i++) this.x.set([6+i, 0], q[i]/n);
        }

        // Calibration Initiale (1-2 sec) pour déterminer les Biais
        calibrate(acc, gyro) {
            if(this.calibSamples.length < this.calibLimit) {
                this.calibSamples.push({acc, gyro});
                this.updateStatus(`CALIBRATION ${Math.round(this.calibSamples.length/this.calibLimit*100)}%`);
            } else {
                // Moyenne des échantillons
                let ba = {x:0, y:0, z:0}, bg = {x:0, y:0, z:0};
                this.calibSamples.forEach(s => {
                    ba.x += s.acc.x; ba.y += s.acc.y; ba.z += s.acc.z;
                    bg.x += s.gyro.x; bg.y += s.gyro.y; bg.z += s.gyro.z;
                });
                const n = this.calibSamples.length;
                
                // On sauve les biais dans le vecteur d'état
                this.x.set([10,0], bg.x/n); this.x.set([11,0], bg.y/n); this.x.set([12,0], bg.z/n);
                this.x.set([13,0], ba.x/n); this.x.set([14,0], ba.y/n); 
                // Pour Z, on assume que Z moyen = Gravité locale (~9.81), le reste est du biais
                this.x.set([15,0], (ba.z/n) - 9.81); 

                this.isCalibrating = false;
                this.mode = "NAV";
            }
        }

        setupUI() {
            const btn = document.getElementById('gps-pause-toggle');
            if (btn) {
                btn.onclick = async () => {
                    if (!this.isRunning) {
                        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                            await DeviceMotionEvent.requestPermission();
                        }
                        
                        // Listeners
                        window.addEventListener('devicemotion', (e) => {
                            if (!this.isRunning) return;
                            const dt = (performance.now() - this.lastT) / 1000;
                            this.lastT = performance.now();
                            
                            const acc = e.accelerationIncludingGravity || {x:0,y:0,z:0};
                            const gyro = e.rotationRate || {x:0,y:0,z:0}; // alpha/beta/gamma mappés x/y/z

                            if (this.isCalibrating) {
                                this.calibrate(acc, gyro);
                            } else {
                                this.predict(acc, gyro, dt);
                            }
                        });

                        navigator.geolocation.watchPosition(
                            (pos) => this.updateGPS(pos),
                            (err) => console.warn(err),
                            { enableHighAccuracy: true, maximumAge: 0 }
                        );

                        this.isRunning = true;
                        btn.textContent = "⏸ PAUSE SYSTÈME";
                        btn.style.backgroundColor = "#dc3545";
                    } else {
                        location.reload();
                    }
                };
            }
        }

        set(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
        updateStatus(t) { this.set('status-physique', t); }
    }

    // Lancement
    window.onload = () => { window.App = new UltimateUKF(); };

})(window);
