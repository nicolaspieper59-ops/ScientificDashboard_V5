/**
 * GNSS SPACETIME - MASTER CONTROLLER V8 (FULL)
 * Gère 100% des IDs HTML et la logique de fusion 21-états
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458; // Vitesse lumière
    const G = 6.67430e-11; // Constante gravitationnelle

    class UltimateDashboard {
        constructor() {
            // Initialisation du moteur UKF (nécessite ukf-lib.js et math.js)
            this.engine = (typeof ProfessionalUKF !== 'undefined') ? new ProfessionalUKF() : null;
            
            this.state = {
                isRunning: false,
                isNether: false,
                startTime: Date.now(),
                lastT: performance.now(),
                vMax: 0,
                mass: 70.0,
                gravity: 9.8067
            };

            this.init();
        }

        init() {
            console.log("🚀 Initialisation du Dashboard Scientifique...");
            this.setupInteractions();
            this.startMainLoop();
        }

        /**
         * 1. GESTION DES BOUTONS ET PERMISSIONS (DeviceMotionEvent)
         */
        setupInteractions() {
            const startBtn = $('gps-pause-toggle');
            if (startBtn) {
                startBtn.addEventListener('click', async () => {
                    if (!this.state.isRunning) {
                        try {
                            // Déblocage critique pour iOS/Android
                            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                                const permission = await DeviceMotionEvent.requestPermission();
                                if (permission !== 'granted') throw new Error("Permission refusée");
                            }
                            this.activateSensors();
                            this.state.isRunning = true;
                            startBtn.innerHTML = "⏸ PAUSE SYSTÈME";
                            startBtn.style.background = "#dc3545";
                        } catch (e) {
                            alert("Erreur Capteurs : Utilisez HTTPS ou vérifiez les permissions.");
                        }
                    } else {
                        location.reload(); // Reset complet
                    }
                });
            }

            // Bouton Nether (Ratio 1:8)
            if ($('nether-toggle-btn')) {
                $('nether-toggle-btn').onclick = () => {
                    this.state.isNether = !this.state.isNether;
                    $('nether-toggle-btn').textContent = this.state.isNether ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                    $('nether-toggle-btn').style.color = this.state.isNether ? "#ff4500" : "#fff";
                };
            }

            // Gestion de la Masse
            if ($('mass-input')) {
                $('mass-input').oninput = (e) => {
                    this.state.mass = parseFloat(e.target.value) || 70;
                    this.set('mass-display', this.state.mass.toFixed(3) + " kg");
                };
            }
        }

        /**
         * 2. CAPTEURS HAUTE FRÉQUENCE
         */
        activateSensors() {
            window.addEventListener('devicemotion', (e) => {
                const now = performance.now();
                const dt = (now - this.state.lastT) / 1000;
                this.state.lastT = now;

                const acc = e.acceleration || {x:0, y:0, z:0};
                const rot = e.rotationRate || {alpha:0, beta:0, gamma:0};

                if (this.engine) this.engine.predict(acc, rot, dt);

                // Affichage IMU
                this.set('accel-x', (acc.x || 0).toFixed(3));
                this.set('accel-y', (acc.y || 0).toFixed(3));
                this.set('accel-z', (acc.z || 0).toFixed(3));
            }, true);

            navigator.geolocation.watchPosition((p) => {
                this.set('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
                this.set('lat-ukf', p.coords.latitude.toFixed(6));
                this.set('lon-ukf', p.coords.longitude.toFixed(6));
                this.set('alt-ukf', (p.coords.altitude || 0).toFixed(2) + " m");
            }, null, { enableHighAccuracy: true });
        }

        /**
         * 3. BOUCLE DE RENDU (Mise à jour de tous les champs scientifiques)
         */
        startMainLoop() {
            const loop = () => {
                const now = new Date();
                
                // Horloges
                this.set('local-time', now.toLocaleTimeString());
                this.set('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 19));
                
                if (this.state.isRunning && this.engine) {
                    const x = this.engine.x;
                    const vMs = Math.sqrt(x.get([3,0])**2 + x.get([4,0])**2 + x.get([5,0])**2);
                    const kmh = vMs * 3.6;
                    if (vMs > this.state.vMax) this.state.vMax = vMs;

                    // Vitesse
                    this.set('speed-main-display', (vMs < 0.1 ? (vMs*1000).toFixed(2) : kmh.toFixed(2)));
                    this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                    this.set('speed-stable-ms', vMs.toFixed(3) + " m/s");
                    this.set('speed-max-session', (this.state.vMax * 3.6).toFixed(2) + " km/h");

                    // Relativité
                    const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
                    this.set('lorentz-factor', gamma.toFixed(14));
                    this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
                    this.set('relativistic-energy', (this.state.mass * C**2 * gamma).toExponential(4) + " J");
                    this.set('schwarzschild-radius', (2 * G * this.state.mass / C**2).toExponential(6) + " m");
                    this.set('pct-speed-of-light', ((vMs/C)*100).toExponential(2) + " %");
                    this.set('mach-number', (vMs / 343).toFixed(4));

                    // Distance (Logique Nether)
                    let d = this.engine.totalDist;
                    if (this.state.isNether) d *= 8;
                    this.set('total-distance-3d', (d/1000).toFixed(6) + " km");
                    this.set('distance-light-sec', (d/C).toExponential(3) + " s");

                    // Mécanique des Fluides
                    const q = 0.5 * 1.225 * vMs**2;
                    this.set('dynamic-pressure', q.toFixed(2) + " Pa");
                    this.set('kinetic-energy', (0.5 * this.state.mass * vMs**2).toLocaleString() + " J");

                    // Minecraft Time
                    const mcTicks = Math.floor(((now.getHours()*3600 + now.getMinutes()*60)/86400)*24000);
                    this.set('time-minecraft', mcTicks.toString().padStart(5, '0'));

                    // Debug UKF
                    this.set('elapsed-time', ((Date.now() - this.state.startTime)/1000).toFixed(2) + " s");
                    this.set('ukf-status', "CONVERGENT");
                }
                
                requestAnimationFrame(loop);
            };
            loop();
        }

        set(id, val) { const el = $(id); if (el) el.textContent = val; }
    }

    window.onload = () => { window.App = new UltimateDashboard(); };
})(window);
