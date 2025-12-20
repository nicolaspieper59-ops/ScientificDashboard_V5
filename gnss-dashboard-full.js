/**
 * GNSS SPACETIME - MOTEUR PHYSIQUE SYMÉTRIQUE "GOLD"
 * Fusion : ukf-lib.js + ukf-class (11).js + gnss-dashboard-full (36).js
 * Logique : Symétrie vectorielle totale (Accélération = -Décélération)
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class UltimatePhysicsEngine {
        constructor() {
            // --- ÉTATS UKF COMPLETS (Source: ukf-class 11 / lib) ---
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            
            // Vecteur d'état matriciel : [x, y, z, vx, vy, vz, q0, q1, q2, q3]
            // On utilise vx, vy, vz pour une précision 3D totale
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1); // Quaternion neutre
            
            this.bias = { ax: 0, ay: 0, az: 0 };
            this.totalDist = 0;
            this.lastT = performance.now();
            
            // --- PARAMÈTRES DASHBOARD (Source: 36) ---
            this.isNetherMode = false;
            this.mass = 70;
            this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };

            this.init();
        }

        init() {
            this.setupUI();
            this.runScientificLoop();
        }

        // --- CŒUR DU CALCUL : SYMÉTRIE ET INERTIE ---
        updateMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1);
            this.lastT = now;

            // Utilisation de l'accélération LINEAIRE (propre, sans gravité)
            // C'est ce qui permet au dashboard (36) de bien gérer l'inclinaison
            const acc = e.acceleration || { x: 0, y: 0, z: 0 };

            if (this.isCalibrating) {
                this.calibrate(acc);
                return;
            }

            // 1. CALCUL DES FORCES (SYMÉTRIE VECTORIELLE)
            // On soustrait le biais calculé pour avoir un "zéro" parfait
            let nax = acc.x - this.bias.ax;
            let nay = acc.y - this.bias.ay;
            let naz = acc.z - this.bias.az;

            // 2. FILTRE DE BRUIT (Deadzone de la Lib UKF)
            // Si l'accélération est trop faible, on considère qu'elle est nulle
            const threshold = 0.12; 
            if (Math.abs(nax) < threshold) nax = 0;
            if (Math.abs(nay) < threshold) nay = 0;
            if (Math.abs(naz) < threshold) naz = 0;

            // 3. INTÉGRATION NEWTONIENNE (SANS AUCUNE FRICTION)
            // Vitesse = Vitesse + (Accélération * Temps)
            // Si nax est positif -> Accélération. Si nax est négatif -> Décélération.
            let vx = this.x.get([3, 0]) + (nax * dt);
            let vy = this.x.get([4, 0]) + (nay * dt);
            let vz = this.x.get([5, 0]) + (naz * dt);

            // Verrouillage de l'arrêt (Source: ukf-lib)
            // Si la vitesse est infime et qu'on n'accélère pas, on force le zéro
            if (Math.abs(vx) < 0.05 && nax === 0) vx = 0;
            if (Math.abs(vy) < 0.05 && nay === 0) vy = 0;
            if (Math.abs(vz) < 0.05 && naz === 0) vz = 0;

            // Mise à jour du vecteur d'état matriciel
            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            // Calcul de la distance parcourue (incluant Mode Nether 1:8)
            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const ratio = this.isNetherMode ? 8 : 1;
            this.totalDist += (speedMs * ratio * dt);
        }

        calibrate(acc) {
            if (this.calibSamples.length < 150) {
                this.calibSamples.push(acc);
                this.set('status-physique', "CALIBRATION " + Math.round((this.calibSamples.length/150)*100) + "%");
                return;
            }
            const sum = this.calibSamples.reduce((a, b) => ({x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}), {x:0, y:0, z:0});
            this.bias = { ax: sum.x/150, ay: sum.y/150, az: sum.z/150 };
            this.isCalibrating = false;
            this.set('status-physique', "PRÊT (SYMÉTRIQUE)");
        }

        // --- CALCULS SCIENTIFIQUES (Source: Dashboard 36 + Lib) ---
        runScientificLoop() {
            const vx = this.x.get([3, 0]);
            const vy = this.x.get([4, 0]);
            const vz = this.x.get([5, 0]);
            const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const kmh = vMs * 3.6;

            // Relativité (Facteur de Lorentz - Source 11)
            const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

            // Atmosphère ISA (Vitesse du son - Source 36)
            const h = this.coords.alt;
            const tempK = 288.15 - (0.0065 * h);
            const vSound = 20.0468 * Math.sqrt(tempK);

            // Rayon de Schwarzschild (Source Lib)
            const rs = (2 * 6.67430e-11 * this.mass) / Math.pow(C, 2);

            // Affichage
            this.set('speed-main-display', kmh.toFixed(2));
            this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.set('mach-number', (vMs / vSound).toFixed(4));
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(4) + " km");
            this.set('schwarzschild-radius', rs.toExponential(4));

            requestAnimationFrame(() => this.runScientificLoop());
        }

        setupUI() {
            const btn = $('gps-pause-toggle');
            btn.onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => this.updateMotion(e));
                    this.isRunning = true;
                    btn.textContent = "⏸ PAUSE SYSTÈME";
                } else {
                    location.reload();
                }
            };

            const nBtn = $('nether-toggle-btn');
            if(nBtn) {
                nBtn.onclick = () => {
                    this.isNetherMode = !this.isNetherMode;
                    nBtn.style.color = this.isNetherMode ? "#ff4500" : "white";
                };
            }
        }

        set(id, val) { if($(id)) $(id).textContent = val; }
    }

    window.onload = () => { window.App = new UltimatePhysicsEngine(); };
})(window);
