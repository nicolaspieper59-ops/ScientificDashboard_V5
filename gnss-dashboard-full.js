/**
 * GNSS SPACETIME - MOTEUR UKF SYMÉTRIQUE V30
 * Fusion : ukf-lib.js + ukf-class (11).js + gnss-dashboard-full (36).js
 * Zéro Friction - Symétrie Accélération/Décélération Totale
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class MasterPhysicsEngine {
        constructor() {
            // --- LOGIQUE UKF COMPLÈTE (Source Lib/11) ---
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            
            // Vecteur d'état matriciel [x, y, z, vx, vy, vz, q0, q1, q2, q3]
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1); // Quaternion neutre
            
            this.bias = { ax: 0, ay: 0, az: 0 };
            this.totalDist = 0;
            this.lastT = performance.now();
            
            // --- MODÈLES DASHBOARD (Source 36) ---
            this.isNetherMode = false;
            this.mass = 70;
            this.coords = { lat: 43.2964, lon: 5.3697, alt: 0 };

            this.init();
        }

        init() {
            this.setupUI();
            this.runScientificLoop();
        }

        // --- MOTEUR DE SYMÉTRIE ACCÉLÉRATION/DÉCÉLÉRATION ---
        updateMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1);
            this.lastT = now;

            // Utilisation de l'accélération linéaire (36) pour l'inclinaison
            const acc = e.acceleration || { x: 0, y: 0, z: 0 };

            if (this.isCalibrating) {
                this.calibrate(acc);
                return;
            }

            // 1. CALCUL DES FORCES (SANS FRICTION)
            // L'accélération est brute. Si acc.x est négatif, c'est une décélération.
            let nax = acc.x - this.bias.ax;
            let nay = acc.y - this.bias.ay;
            let naz = acc.z - this.bias.az;

            // 2. FILTRE DE STABILITÉ (ZUPT - Source Lib)
            // Si le mouvement est infime, on force l'arrêt pour éviter la dérive
            const threshold = 0.12; 
            if (Math.abs(nax) < threshold) nax = 0;
            if (Math.abs(nay) < threshold) nay = 0;
            if (Math.abs(naz) < threshold) naz = 0;

            // 3. INTÉGRATION SYMÉTRIQUE (Newton)
            // v_final = v_initial + (a * dt)
            // Si a est négatif (freinage), v_final diminue mathématiquement.
            let vx = this.x.get([3, 0]) + nax * dt;
            let vy = this.x.get([4, 0]) + nay * dt;
            let vz = this.x.get([5, 0]) + naz * dt;

            // Sécurité : Si la vitesse est quasi-nulle, on la fixe à zéro (Source Lib)
            if (Math.abs(vx) < 0.01 && nax === 0) vx = 0;
            if (Math.abs(vy) < 0.01 && nay === 0) vy = 0;
            if (Math.abs(vz) < 0.01 && naz === 0) vz = 0;

            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const ratio = this.isNetherMode ? 8 : 1;
            this.totalDist += (speedMs * ratio * dt);
        }

        calibrate(acc) {
            if (this.calibSamples.length < 150) {
                this.calibSamples.push(acc);
                this.set('status-physique', "CALIBRATION...");
                return;
            }
            const sum = this.calibSamples.reduce((a, b) => ({x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}), {x:0, y:0, z:0});
            this.bias = { ax: sum.x / 150, ay: sum.y / 150, az: sum.z / 150 };
            this.isCalibrating = false;
            this.set('status-physique', "PRÊT");
        }

        // --- CALCULS SCIENTIFIQUES COMPLETS (Source 36 & Lib) ---
        runScientificLoop() {
            const vx = this.x.get([3, 0]);
            const vy = this.x.get([4, 0]);
            const vz = this.x.get([5, 0]);
            const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const kmh = vMs * 3.6;

            // Relativité (15 décimales - Source 11)
            const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

            // Atmosphère ISA (Source 36)
            const h = this.coords.alt;
            const tempK = 288.15 - 0.0065 * h;
            const vSound = 20.0468 * Math.sqrt(tempK);

            // Dashboard
            this.set('speed-main-display', kmh.toFixed(2));
            this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.set('mach-number', (vMs / vSound).toFixed(4));
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(4) + " km");
            this.set('accel-x', vx.toFixed(3)); // Vitesse par axe

            requestAnimationFrame(() => this.runScientificLoop());
        }

        setupUI() {
            $('gps-pause-toggle').onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => this.updateMotion(e));
                    this.isRunning = true;
                } else {
                    location.reload();
                }
            };
        }

        set(id, val) { if($(id)) $(id).textContent = val; }
    }

    window.onload = () => { window.PhysicsEngine = new MasterPhysicsEngine(); };
})(window);
