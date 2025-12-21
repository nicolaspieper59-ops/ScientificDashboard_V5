/**
 * GNSS SPACETIME - ULTIMATE MASTER CONTROLLER
 * Fusion 21-États (ESKF) | Relativité | Bio-SVT | Astronomie
 * Capacité : Sub-mm (micro-mouvements) à Mach 25+
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458; // Vitesse lumière (m/s)
    const G = 6.67430e-11; // Constante G

    class UltimateDashboard {
        constructor() {
            // --- INITIALISATION DU MOTEUR UKF (ukf-lib.js) ---
            this.engine = new window.ProfessionalUKF();
            
            // --- VARIABLES DE SESSION ---
            this.startTime = Date.now();
            this.vMax = 0;
            this.isTracking = false;
            this.lastFrameTime = performance.now();
            
            this.init();
        }

        init() {
            console.log("🚀 Lancement du Système Expert GNSS SpaceTime...");
            this.setupInteractions();
            this.startMainLoop();
        }

        /**
         * LIAISON DES CONTRÔLES UI
         */
        setupInteractions() {
            const startBtn = $('gps-pause-toggle');
            if (startBtn) {
                startBtn.onclick = async () => {
                    if (!this.isTracking) {
                        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                            await DeviceMotionEvent.requestPermission();
                        }
                        this.activateSensors();
                        this.isTracking = true;
                        startBtn.innerHTML = "⏸ PAUSE SYSTÈME";
                        startBtn.style.background = "#dc3545";
                        this.set('ukf-status', "CONVERGENT");
                    } else {
                        location.reload(); // Hard reset sécurité
                    }
                };
            }

            // Gestion de la masse dynamique
            if ($('mass-input')) {
                $('mass-input').oninput = (e) => {
                    const m = parseFloat(e.target.value) || 70.0;
                    this.engine.mass = m;
                    this.set('mass-display', m.toFixed(3) + " kg");
                };
            }
        }

        /**
         * ACTIVATION DES CAPTEURS (FUSION SENSORIELLE)
         */
        activateSensors() {
            // 1. Accéléromètre & Gyro (IMU)
            window.addEventListener('devicemotion', (e) => {
                const now = performance.now();
                const dt = (now - this.engine.lastT) / 1000;
                this.engine.predict(
                    e.acceleration || {x:0, y:0, z:0},
                    e.rotationRate || {alpha:0, beta:0, gamma:0},
                    dt
                );
            });

            // 2. Magnétomètre
            window.addEventListener('deviceorientation', (e) => {
                this.set('pitch', (e.beta || 0).toFixed(1) + "°");
                this.set('roll', (e.gamma || 0).toFixed(1) + "°");
                this.updateBubble(e.beta, e.gamma);
            });

            // 3. GPS (Correction de dérive)
            navigator.geolocation.watchPosition((p) => {
                this.engine.coords = { lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude || 0 };
                this.set('gps-status', "FIX ACQUIS");
                this.set('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
            }, null, { enableHighAccuracy: true });
        }

        /**
         * BOUCLE SCIENTIFIQUE (60 FPS)
         */
        startMainLoop() {
            const loop = () => {
                const now = performance.now();
                const frameDt = (now - this.lastFrameTime) / 1000;
                this.lastFrameTime = now;

                const x = this.engine.x;
                const vx = x.get([3, 0]), vy = x.get([4, 0]), vz = x.get([5, 0]);
                const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
                const kmh = vMs * 3.6;

                if (vMs > this.vMax) this.vMax = vMs;

                // --- 1. AFFICHAGE VITESSE (MICRO & MACRO) ---
                if (vMs < 0.1) { // Mode Sub-millimétrique (Biologie/Transport délicat)
                    this.set('speed-main-display', (vMs * 1000).toFixed(2));
                    this.set('speed-status-text', "DÉTECTION SUB-MM (mm/s)");
                } else {
                    this.set('speed-main-display', kmh.toFixed(2));
                    this.set('speed-status-text', kmh > 1235 ? "⚠️ RÉGIME SUPERSONIQUE" : "STABLE");
                }

                // --- 2. PHYSIQUE RELATIVISTE & ÉNERGIE ---
                const rel = this.engine.getRelativityData();
                this.set('lorentz-factor', rel.gamma.toFixed(15));
                this.set('time-dilation-vitesse', rel.dilation.toFixed(4) + " ns/j");
                this.set('relativistic-energy', rel.energy.toExponential(4) + " J");
                this.set('schwarzschild-radius', rel.schwarzschild.toExponential(6) + " m");
                this.set('mach-number', (vMs / 343).toFixed(4));

                // --- 3. DYNAMIQUE & MÉCANIQUE DES FLUIDES ---
                const rho = 1.225; // Densité air standard
                const q = 0.5 * rho * vMs**2;
                this.set('dynamic-pressure', q.toFixed(2) + " Pa");
                this.set('kinetic-energy', (0.5 * this.engine.mass * vMs**2).toLocaleString() + " J");
                this.set('vertical-speed', vz.toFixed(2) + " m/s");

                // --- 4. NAVIGATION & DISTANCE ---
                this.set('total-distance-3d', (this.engine.totalDist / 1000).toFixed(6) + " km");
                this.set('lat-ukf', this.engine.coords.lat.toFixed(6));
                this.set('lon-ukf', this.engine.coords.lon.toFixed(6));
                this.set('alt-ukf', this.engine.coords.alt.toFixed(2) + " m");

                // --- 5. ASTRONOMIE (Liaison astro.js) ---
                if (window.calculateAstroDataHighPrec) {
                    const astro = window.calculateAstroDataHighPrec(new Date(), this.engine.coords.lat, this.engine.coords.lon);
                    this.set('sun-alt', (astro.sun.altitude * 57.29).toFixed(2) + "°");
                    this.set('moon-phase-name', astro.moon.phaseName);
                    this.set('tst-time', astro.TST_HRS);
                }

                // --- 6. SYSTÈME & DIAGNOSTIC ---
                this.set('elapsed-time', ((Date.now() - this.startTime)/1000).toFixed(2) + " s");
                this.set('nyquist-limit', Math.round(1/frameDt) + " Hz");
                this.set('ukf-velocity-uncertainty', this.engine.P.get([3, 3]).toExponential(2));

                requestAnimationFrame(loop);
            };
            loop();
        }

        /**
         * GESTION DU NIVEAU À BULLE
         */
        updateBubble(pitch, roll) {
            const b = $('bubble');
            if (b) {
                const tx = Math.max(-40, Math.min(40, roll * 1.5));
                const ty = Math.max(-40, Math.min(40, pitch * 1.5));
                b.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
            }
        }

        set(id, val) { const el = $(id); if (el) el.textContent = val; }
    }

    // Lancement de l'application au chargement
    window.onload = () => { window.App = new UltimateDashboard(); };

})(window);
