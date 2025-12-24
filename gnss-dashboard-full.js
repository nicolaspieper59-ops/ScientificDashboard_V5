/**
 * GNSS SPACETIME - SCIENTIFIC ENGINE V5
 * Intégration DeviceMotionEvent & Gyroscope
 */

((window) => {
    const C = 299792458;
    const G_EARTH = 9.80665;

    class ScientificEngine {
        constructor() {
            this.isRunning = false;
            this.lastT = performance.now();
            
            // Vecteur d'état : [vx, vy, vz, distance]
            this.physics = { vx: 0, vy: 0, vz: 0, dist: 0, vMax: 0 };
            
            // Filtre passe-bas pour l'inclinaison
            this.tilt = { x: 0, y: 0 };

            this.init();
        }

        init() {
            const btn = document.getElementById('gps-pause-toggle');
            if (!btn) return;

            btn.onclick = async () => {
                if (!this.isRunning) {
                    await this.requestPermissions();
                    this.startInternalLoop();
                    btn.textContent = "⏸ SYSTÈME ACTIF";
                    btn.style.backgroundColor = "#28a745";
                    this.isRunning = true;
                } else {
                    location.reload();
                }
            };
        }

        async requestPermissions() {
            // Android 13+ et iOS demandent une autorisation explicite
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const res = await DeviceMotionEvent.requestPermission();
                    if (res !== 'granted') alert("Accès capteurs refusé.");
                } catch (e) { console.error(e); }
            }

            // Écouteur principal
            window.addEventListener('devicemotion', (e) => this.handleMotion(e), true);
        }

        handleMotion(e) {
            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1);
            this.lastT = now;

            // 1. GESTION DE LA VITESSE (Accélération Linéaire)
            const acc = e.acceleration || { x: 0, y: 0, z: 0 };
            
            // Deadzone pour éliminer le bruit au repos
            const threshold = 0.15;
            const ax = Math.abs(acc.x) > threshold ? acc.x : 0;
            const ay = Math.abs(acc.y) > threshold ? acc.y : 0;
            const az = Math.abs(acc.z) > threshold ? acc.z : 0;

            // Intégration Newtonienne (V = V + a*t)
            this.physics.vx += ax * dt;
            this.physics.vy += ay * dt;
            this.physics.vz += az * dt;

            // 2. GESTION DE L'ORIENTATION (Niveau à bulle)
            // On utilise IncludingGravity pour savoir où est le "bas"
            const gAcc = e.accelerationIncludingGravity;
            if (gAcc) {
                // Lissage (Low-pass filter) pour une bulle stable
                this.tilt.x = this.tilt.x * 0.9 + gAcc.x * 0.1;
                this.tilt.y = this.tilt.y * 0.9 + gAcc.y * 0.1;
                this.updateBubble();
            }
        }

        updateBubble() {
            const bubble = document.getElementById('bubble');
            if (bubble) {
                // On multiplie par 5 pour amplifier le mouvement visuel
                const tx = -this.tilt.x * 5; 
                const ty = this.tilt.y * 5;
                bubble.style.transform = `translate(${tx}px, ${ty}px)`;
            }
        }

        startInternalLoop() {
            const updateUI = () => {
                if (!this.isRunning) return;

                const vMs = Math.sqrt(this.physics.vx**2 + this.physics.vy**2 + this.physics.vz**2);
                const kmh = vMs * 3.6;
                this.physics.dist += vMs * 0.016; // Approx 60fps

                // --- RELATIVITÉ ---
                const beta = vMs / C;
                const gamma = 1 / Math.sqrt(1 - beta**2);
                const dilation = (gamma - 1) * 86400 * 1e9; // ns/jour

                // --- AFFICHAGE DOM ---
                this.set('speed-main-display', kmh.toFixed(1));
                this.set('speed-stable-kmh', kmh.toFixed(2) + " km/h");
                this.set('lorentz-factor', gamma.toFixed(15));
                this.set('time-dilation-vitesse', dilation.toFixed(3) + " ns/j");
                this.set('total-distance', (this.physics.dist / 1000).toFixed(3) + " km");

                requestAnimationFrame(updateUI);
            };
            updateUI();
        }

        set(id, val) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    }

    window.addEventListener('load', () => {
        window.ProcessEngine = new ScientificEngine();
    });

})(window);
