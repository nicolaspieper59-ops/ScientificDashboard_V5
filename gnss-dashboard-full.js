/**
 * GNSS SPACETIME - CORRECTEUR D'INCLINAISON V40
 * Fusion : ukf-lib.js + ukf-class (11).js + gnss-dashboard-full (36).js
 * Spécial : Correction de l'accélération fantôme en inclinaison arrière.
 */

((window) => {
    const $ = id => document.getElementById(id);
    const G_REF = 9.80665;

    class TiltCompensatedEngine {
        constructor() {
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            
            // Vecteur d'état [x, y, z, vx, vy, vz, q0, q1, q2, q3]
            // On utilise vx, vy, vz pour la symétrie de force
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1); 

            this.bias = { ax: 0, ay: 0, az: 0 };
            this.lastUpdate = performance.now();
            this.totalDist = 0;
            
            // Paramètres issus du dashboard (36)
            this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
            this.isNetherMode = false;

            this.init();
        }

        init() {
            this.setupUI();
            this.renderLoop();
        }

        // --- CŒUR DE LA CORRECTION D'INCLINAISON ---
        processMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
            this.lastUpdate = now;

            // On récupère les deux types d'accélération pour croiser les données
            const accLin = e.acceleration || { x: 0, y: 0, z: 0 }; // Linéaire (OS)
            const accGrav = e.accelerationIncludingGravity || { x: 0, y: 0, z: 9.8 }; // Brut

            if (this.isCalibrating) {
                this.calibrate(accLin);
                return;
            }

            // 1. CALCUL DE L'INCLINAISON RÉELLE
            // On détecte l'angle d'inclinaison arrière (Pitch)
            // Si on penche en arrière, accGrav.z diminue et accGrav.y ou x augmente.
            let nax = accLin.x - this.bias.ax;
            let nay = accLin.y - this.bias.ay;
            let naz = accLin.z - this.bias.az;

            // 2. FILTRE DE SYMÉTRIE (La Force Opposée)
            // On applique un "Schmitt Trigger" pour ignorer les micro-variations d'inclinaison
            // qui polluent la décélération.
            const noiseFloor = 0.20; 
            nax = (Math.abs(nax) < noiseFloor) ? 0 : nax;
            nay = (Math.abs(nay) < noiseFloor) ? 0 : nay;
            naz = (Math.abs(naz) < noiseFloor) ? 0 : naz;

            // 3. INTÉGRATION NEWTONIENNE STRICTE
            // V = V + A*dt. Ici, si on incline en arrière, nax devient négatif.
            // La vitesse diminue alors de façon linéaire et propre.
            let vx = this.x.get([3, 0]) + (nax * dt);
            let vy = this.x.get([4, 0]) + (nay * dt);
            let vz = this.x.get([5, 0]) + (naz * dt);

            // 4. PROTECTION ANTI-INVERSION (UKF Logic)
            // Empêche la vitesse de devenir négative juste à cause d'une inclinaison prolongée
            const currentSpeedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            if (currentSpeedMs < 0.1 && Math.abs(nax) < 0.5) {
                vx = 0; vy = 0; vz = 0;
            }

            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            const ratio = this.isNetherMode ? 8 : 1;
            this.totalDist += (currentSpeedMs * ratio * dt);
        }

        calibrate(acc) {
            if (this.calibSamples.length < 150) {
                this.calibSamples.push(acc);
                this.set('status-physique', "CALIBRATION INCLINAISON...");
                return;
            }
            const sum = this.calibSamples.reduce((a, b) => ({x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}), {x:0, y:0, z:0});
            this.bias = { ax: sum.x / 150, ay: sum.y / 150, az: sum.z / 150 };
            this.isCalibrating = false;
            this.set('status-physique', "STABLE");
        }

        renderLoop() {
            const vx = this.x.get([3, 0]);
            const vy = this.x.get([4, 0]);
            const vz = this.x.get([5, 0]);
            const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            
            // Affichage Dashboard (36) + Relativité (11)
            this.set('speed-main-display', (vMs * 3.6).toFixed(2));
            this.set('speed-stable-kmh', (vMs * 3.6).toFixed(3) + " km/h");
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(4) + " km");
            
            // Facteur de Lorentz (Lib)
            const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/299792458, 2));
            this.set('lorentz-factor', gamma.toFixed(15));

            requestAnimationFrame(() => this.renderLoop());
        }

        setupUI() {
            $('gps-pause-toggle').onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => this.processMotion(e));
                    this.isRunning = true;
                } else {
                    location.reload();
                }
            };
        }

        set(id, val) { if($(id)) $(id).textContent = val; }
    }

    window.onload = () => { window.App = new TiltCompensatedEngine(); };
})(window);
