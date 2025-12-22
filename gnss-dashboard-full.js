/**
 * GNSS SPACETIME - FLIGHT CONTROLLER V200
 * Gestion Temps Réel & Relativité Restreinte
 */
(function(window) {
    const $ = id => document.getElementById(id);

    class FlightController {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.C = 299792458; 
            this.lastTick = 0;
            this.init();
        }

        init() {
            // UI Setup
            const btn = $('gps-pause-toggle');
            if(btn) btn.onclick = () => this.engageSystem();
            
            $('reset-all-btn').onclick = () => location.reload();
            $('toggle-mode-btn').onclick = () => document.body.classList.toggle('dark-mode');

            this.updateStaticPhysics();
            this.uiLoop();
        }

        updateStaticPhysics() {
            // Affichage E0 et Rs (Théorique)
            const mass = 70.0; 
            const E0 = mass * this.C**2;
            const Rs = (2 * 6.674e-11 * mass) / this.C**2;
            
            this.safeSet('rest-mass-energy', E0.toExponential(6) + " J");
            this.safeSet('schwarzschild-radius', Rs.toExponential(6) + " m");
        }

        safeSet(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }

        async engageSystem() {
            const btn = $('gps-pause-toggle');
            if (this.isRunning) { location.reload(); return; }

            try {
                // 1. Permissions Capteurs (Hardware Low-Level)
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }

                // 2. Démarrage Moteur
                if (typeof window.UltimateUKFEngine === 'undefined') throw new Error("Moteur Physique manquant");
                
                this.engine = new window.UltimateUKFEngine();
                this.isRunning = true;
                this.lastTick = performance.now();

                // 3. Branchement Interruptions Capteurs
                // GPS (1 Hz)
                navigator.geolocation.watchPosition(p => {
                    this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                }, err => console.error(err), { enableHighAccuracy: true, maximumAge: 0 });

                // IMU (100 Hz approx via Browser)
                window.ondevicemotion = (e) => {
                    const now = performance.now();
                    const dt = (now - this.lastTick) / 1000;
                    this.lastTick = now;

                    // Injection des données brutes dans le moteur strapdown
                    this.engine.predict(
                        e.accelerationIncludingGravity, // Accel
                        e.rotationRate,                 // Gyro
                        dt                              // Delta Time Précis
                    );
                };

                // UI Feedback
                btn.innerHTML = "SYSTEM ENGAGED <i class='fas fa-check-circle'></i>";
                btn.style.background = "#28a745";
                btn.style.color = "#fff";

            } catch (err) {
                alert("ECHEC SYSTÈME : " + err.message);
            }
        }

        uiLoop() {
            const loop = () => {
                const now = new Date();
                this.safeSet('local-time', now.toLocaleTimeString() + `.${now.getMilliseconds().toString().padStart(3,'0')}`);

                if (this.isRunning && this.engine) {
                    // Lecture de l'État Vrai (Post-Filtrage)
                    const lat = this.engine.x.get([0,0]);
                    const lon = this.engine.x.get([1,0]);
                    
                    // Calcul Vitesse Réelle 3D
                    const vn = this.engine.x.get([3,0]);
                    const ve = this.engine.x.get([4,0]);
                    const vd = this.engine.x.get([5,0]);
                    const v_norm = Math.sqrt(vn**2 + ve**2 + vd**2);

                    // Relativité Restreinte (Temps Réel)
                    const beta = v_norm / this.C;
                    const gamma = 1 / Math.sqrt(1 - beta**2);

                    // Mise à jour UI
                    this.safeSet('lat-ukf', lat.toFixed(8)); // Précision géodésique
                    this.safeSet('lon-ukf', lon.toFixed(8));
                    this.safeSet('vitesse-stable-kmh', (v_norm * 3.6).toFixed(2));
                    this.safeSet('mach-number', (v_norm / 340.29).toFixed(6));
                    this.safeSet('lorentz-factor', gamma.toFixed(15));
                }
                requestAnimationFrame(loop);
            };
            loop();
        }
    }
    window.onload = () => new FlightController();
})(window);
