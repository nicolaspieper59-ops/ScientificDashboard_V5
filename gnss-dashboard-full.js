/**
 * GNSS SPACETIME - UKF GOLD MASTER (V103 - LOCAL VENDOR MODE)
 * Optimisé pour math.min.js en local
 */

((window) => {
    // Vérification de sécurité au démarrage
    window.addEventListener('load', () => {
        if (typeof math === 'undefined') {
            alert("⚠️ ÉCHEC : 'vendor/math.min.js' n'est pas détecté. Vérifiez le chemin du fichier.");
            return;
        }
        console.log("✅ Math.js local chargé avec succès.");
        window.App = new UltimateUKF();
    });

    const C = 299792458;
    const G_EARTH = 9.80665;
    const D2R = Math.PI / 180;
    const R2D = 180 / Math.PI;

    class UltimateUKF {
        constructor() {
            this.n = 24;
            // Utilisation sécurisée des matrices math.js
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W (Neutre)
            
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0); // Scale Factors

            // Initialisation de la covariance P
            this.P = math.diag(math.zeros(this.n).map((_, i) => i <= 2 ? 1e-5 : 0.01));

            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.totalDist = 0;
            this.vMax = 0;
            this.lastT = performance.now();

            this.setupUI();
            this.renderLoop();
        }

        setupUI() {
            const btn = document.getElementById('gps-pause-toggle');
            if (!btn) return;

            btn.onclick = async () => {
                if (!this.isRunning) {
                    // Déverrouillage des capteurs Android/iOS
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        const response = await DeviceMotionEvent.requestPermission();
                        if (response !== 'granted') return;
                    }

                    // Activation des flux de données
                    window.addEventListener('devicemotion', (e) => this.handleMotion(e), true);
                    
                    navigator.geolocation.watchPosition(
                        (p) => this.updateGPS(p),
                        (e) => console.warn(e),
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

        handleMotion(e) {
            if (!this.isRunning) return;
            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1);
            this.lastT = now;

            const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};

            let ax = acc.x || 0, ay = acc.y || 0, az = acc.z || 0;

            if (this.isCalibrating) {
                this.calibrate(ax, ay, az);
                return;
            }

            // Correction via les états du filtre (Biais 13, 14, 15)
            ax -= this.x.get([13,0]);
            ay -= this.x.get([14,0]);
            az -= (this.x.get([15,0]) + G_EARTH);

            // Intégration Newtonienne simplifiée pour la réactivité
            const vx = this.x.get([3,0]) + ax * dt;
            const vy = this.x.get([4,0]) + ay * dt;
            const vz = this.x.get([5,0]) + az * dt;

            this.x.set([3,0], vx); this.x.set([4,0], vy); this.x.set([5,0], vz);
            
            const speed = Math.sqrt(vx**2 + vy**2 + vz**2);
            this.totalDist += speed * dt;
            if (speed * 3.6 > this.vMax) this.vMax = speed * 3.6;
        }

        updateGPS(pos) {
            const { latitude, longitude, altitude, speed, accuracy } = pos.coords;
            // Injection des coordonnées GPS dans l'état UKF [0,1,2]
            this.x.set([0,0], latitude);
            this.x.set([1,0], longitude);
            this.x.set([2,0], altitude || 0);
            
            const el = document.getElementById('gps-accuracy-display');
            if(el) el.textContent = accuracy.toFixed(1) + " m";
        }

        calibrate(ax, ay, az) {
            if(this.calibSamples.length < 60) {
                this.calibSamples.push({ax, ay, az});
                this.setHTML('status-physique', `CALIBRATION ${Math.round(this.calibSamples.length/60*100)}%`);
            } else {
                let sumX=0, sumY=0, sumZ=0;
                this.calibSamples.forEach(s => { sumX+=s.ax; sumY+=s.ay; sumZ+=s.az; });
                const n = this.calibSamples.length;
                this.x.set([13,0], sumX/n);
                this.x.set([14,0], sumY/n);
                this.x.set([15,0], (sumZ/n) - G_EARTH);
                this.isCalibrating = false;
            }
        }

        renderLoop() {
            if (this.isRunning) {
                const vx = this.x.get([3,0]), vy = this.x.get([4,0]), vz = this.x.get([5,0]);
                const vTot = Math.sqrt(vx**2 + vy**2 + vz**2);
                const kmh = vTot * 3.6;

                this.setHTML('speed-main-display', kmh.toFixed(1));
                this.setHTML('speed-stable-kmh', kmh.toFixed(2) + " km/h");
                this.setHTML('total-distance', (this.totalDist / 1000).toFixed(3) + " km");
                
                // Relativité
                const gamma = 1 / Math.sqrt(1 - Math.pow(vTot/C, 2));
                this.setHTML('lorentz-factor', gamma.toFixed(14));
                this.setHTML('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

                // Niveau à bulle
                const bubble = document.getElementById('bubble');
                if (bubble) {
                    const roll = Math.atan2(vy, G_EARTH) * R2D;
                    const pitch = Math.atan2(vx, G_EARTH) * R2D;
                    bubble.style.transform = `translate(${roll * 2}px, ${pitch * 2}px)`;
                }
            }
            requestAnimationFrame(() => this.renderLoop());
        }

        setHTML(id, val) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    }

})(window);
