/**
 * GNSS SPACETIME - MAIN CONTROLLER (FINAL MASTER)
 * Liaison entre l'UKF 21-états, l'Astro-physique et l'UI
 */

((window) => {
    const $ = id => document.getElementById(id);

    class MainController {
        constructor() {
            // 1. Initialisation du moteur de fusion défini dans ukf-lib.js
            this.engine = new window.ProfessionalUKF();
            
            this.uiUpdateRate = 60; // fps
            this.isTracking = false;
            
            this.init();
        }

        init() {
            console.log("💎 Dashboard Principal : Prêt pour le déploiement scientifique.");
            this.bindControls();
            this.startUIRenderLoop();
        }

        /**
         * ÉCOUTEURS D'ÉVÉNEMENTS (CONTRÔLES UI)
         */
        bindControls() {
            const startBtn = $('gps-pause-toggle');
            if (startBtn) {
                startBtn.onclick = async () => {
                    if (!this.isTracking) {
                        await this.requestPermissions();
                        this.startSensors();
                        this.isTracking = true;
                        startBtn.textContent = "⏸ PAUSE SYSTÈME";
                        startBtn.style.background = "var(--danger)";
                    } else {
                        location.reload(); // Hard Reset pour sécurité scientifique
                    }
                };
            }

            // Mise à jour de la masse en temps réel
            if ($('mass-input')) {
                $('mass-input').oninput = (e) => {
                    this.engine.mass = parseFloat(e.target.value) || 70.0;
                    if($('mass-display')) $('mass-display').textContent = this.engine.mass.toFixed(2) + " kg";
                };
            }
        }

        async requestPermissions() {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
        }

        startSensors() {
            // A. Accéléromètre & Gyroscope (Fusion IMU)
            window.addEventListener('devicemotion', (e) => {
                const now = performance.now();
                const dt = (now - this.engine.lastT) / 1000;
                
                // Appel du moteur de prédiction (UKF)
                this.engine.predict(
                    e.acceleration || {x:0, y:0, z:0}, 
                    e.rotationRate || {alpha:0, beta:0, gamma:0},
                    dt
                );
            });

            // B. GPS (Correction de position)
            navigator.geolocation.watchPosition((pos) => {
                // Ici, on injecterait la mesure GPS dans l'UKF (Update step)
                // Pour l'instant, on met à jour les coordonnées du moteur
                this.engine.coords.lat = pos.coords.latitude;
                this.engine.coords.lon = pos.coords.longitude;
                this.engine.coords.alt = pos.coords.altitude || 0;
                
                if($('gps-accuracy-display')) $('gps-accuracy-display').textContent = pos.coords.accuracy.toFixed(1) + " m";
            }, null, { enableHighAccuracy: true });
        }

        /**
         * BOUCLE DE RENDU VISUEL (60 FPS)
         */
        startUIRenderLoop() {
            const render = () => {
                const x = this.engine.x;
                const rel = this.engine.getRelativityData();
                
                // --- VITESSE & PHYSIQUE ---
                const vx = x.get([3, 0]), vy = x.get([4, 0]), vz = x.get([5, 0]);
                const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
                const kmh = vMs * 3.6;

                // Affichage intelligent (micro vs macro)
                if (vMs < 0.05) { // Moins de 5cm/s
                    this.set('speed-main-display', (vMs * 1000).toFixed(2));
                    this.set('speed-status-text', "DÉTECTION SUB-MM (mm/s)");
                } else {
                    this.set('speed-main-display', kmh.toFixed(2));
                    this.set('speed-status-text', "VITESSE DE CROISIÈRE (km/h)");
                }

                this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                this.set('vertical-speed', vz.toFixed(2) + " m/s");
                this.set('total-distance-3d', (this.engine.totalDist / 1000).toFixed(6) + " km");

                // --- RELATIVITÉ ---
                this.set('lorentz-factor', rel.gamma.toFixed(15));
                this.set('time-dilation-vitesse', rel.dilation.toFixed(4) + " ns/j");
                this.set('relativistic-energy', rel.energy.toExponential(3) + " J");
                this.set('schwarzschild-radius', rel.schwarzschild.toExponential(5) + " m");

                // --- ASTRONOMIE (Si astro.js est chargé) ---
                if (window.calculateAstroDataHighPrec) {
                    const astro = window.calculateAstroDataHighPrec(new Date(), this.engine.coords.lat, this.engine.coords.lon);
                    this.set('sun-alt', (astro.sun.altitude * 57.29).toFixed(2) + "°");
                    this.set('moon-phase-name', astro.moon.phaseName || "N/A");
                    this.set('tst-time', astro.TST_HRS || "--:--");
                }

                // --- DIAGNOSTIC ---
                this.set('nyquist-limit', Math.round(1000 / (performance.now() - this.engine.lastT)) + " Hz");
                this.set('ukf-velocity-uncertainty', this.engine.P.get([3, 3]).toExponential(2));

                requestAnimationFrame(render);
            };
            render();
        }

        set(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }
    }

    // Lancement
    window.addEventListener('load', () => {
        window.MainApp = new MainController();
    });

})(window);
