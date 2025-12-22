/**
 * GNSS SPACETIME - FLIGHT CONTROLLER (V200)
 * Nom du fichier : gnss-dashboard-full.js
 */
(function(window) {
    const $ = id => document.getElementById(id);

    class MasterSystem {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.lastTick = 0;
            this.C = 299792458;
            this.init();
        }

        init() {
            // Setup Boutons
            const btn = $('gps-pause-toggle');
            if(btn) btn.onclick = () => this.toggleSystem();
            
            const btnReset = $('reset-all-btn');
            if(btnReset) btnReset.onclick = () => location.reload();
            
            const btnNight = $('toggle-mode-btn');
            if(btnNight) btnNight.onclick = () => document.body.classList.toggle('dark-mode');

            // Données statiques
            this.injectPhysics();
            
            // Boucle d'affichage
            this.uiLoop();
        }

        injectPhysics() {
            const m = 70.0;
            const E0 = m * this.C**2;
            const Rs = (2 * 6.674e-11 * m) / this.C**2;
            this.safeSet('rest-mass-energy', E0.toExponential(6) + " J");
            this.safeSet('schwarzschild-radius', Rs.toExponential(6) + " m");
        }

        safeSet(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }

        async toggleSystem() {
            const btn = $('gps-pause-toggle');
            
            if (!this.isRunning) {
                try {
                    // 1. Check Permissions
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }

                    // 2. Check Moteur (Le point critique)
                    if (typeof window.UltimateUKFEngine === 'undefined') {
                        throw new Error("Moteur Physique introuvable. Vérifiez ukf-class.js");
                    }

                    // 3. Démarrage
                    this.engine = new window.UltimateUKFEngine();
                    this.isRunning = true;
                    this.lastTick = performance.now();

                    // 4. Capteurs
                    navigator.geolocation.watchPosition(p => {
                        this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                    }, null, { enableHighAccuracy: true });

                    window.ondevicemotion = (e) => {
                        if(this.isRunning) {
                            const now = performance.now();
                            const dt = (now - this.lastTick) / 1000;
                            this.lastTick = now;
                            this.engine.predict(e.accelerationIncludingGravity, e.rotationRate, dt);
                        }
                    };

                    btn.innerHTML = "SYSTEM ENGAGED <i class='fas fa-check'></i>";
                    btn.style.background = "#28a745";

                } catch (err) {
                    alert("ERREUR : " + err.message);
                }
            } else {
                location.reload();
            }
        }

        uiLoop() {
            const loop = () => {
                const now = new Date();
                this.safeSet('local-time', now.toLocaleTimeString() + "." + now.getMilliseconds());

                if (this.isRunning && this.engine) {
                    // Lecture de l'état
                    const lat = this.engine.x.get([0,0]);
                    const lon = this.engine.x.get([1,0]);
                    
                    // Vitesse 3D
                    const vx = this.engine.x.get([3,0]);
                    const vy = this.engine.x.get([4,0]);
                    const vz = this.engine.x.get([5,0]);
                    const v = Math.sqrt(vx**2 + vy**2 + vz**2);

                    // Relativité
                    const gamma = 1 / Math.sqrt(1 - (v/this.C)**2);

                    this.safeSet('lat-ukf', lat.toFixed(7));
                    this.safeSet('lon-ukf', lon.toFixed(7));
                    this.safeSet('vitesse-stable-kmh', (v*3.6).toFixed(2));
                    this.safeSet('lorentz-factor', gamma.toFixed(14));
                }
                requestAnimationFrame(loop);
            };
            loop();
        }
    }
    
    // Lancement au chargement de la page
    window.addEventListener('load', () => new MasterSystem());
})(window);
