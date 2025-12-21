/**
 * GNSS SPACETIME - INTERFACE & LOGIQUE SYSTÈME
 * Gestion de 100% des IDs HTML et des interactions boutons
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;

    class FullSystemManager {
        constructor() {
            // Initialisation du moteur UKF
            this.engine = new window.ProfessionalUKF();
            
            // Paramètres de session
            this.startTime = Date.now();
            this.vMax = 0;
            this.isTracking = false;
            this.isNightMode = true;
            this.isNetherMode = false;
            
            this.init();
        }

        init() {
            console.log("🛠️ Initialisation des contrôles du Dashboard...");
            this.setupButtons();
            this.setupInputs();
            this.startGlobalClock();
            this.renderLoop();
        }

        /**
         * 1. ACTIVATION DE TOUS LES BOUTONS
         */
        setupButtons() {
            // Marche / Arrêt GPS
            if ($('gps-pause-toggle')) {
                $('gps-pause-toggle').onclick = async () => {
                    if (!this.isTracking) {
                        try {
                            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                                await DeviceMotionEvent.requestPermission();
                            }
                            this.startSensors();
                            this.isTracking = true;
                            $('gps-pause-toggle').innerHTML = "⏸ PAUSE SYSTÈME";
                            $('gps-pause-toggle').style.background = "#dc3545";
                            this.set('ukf-status', "FUSION ACTIVE");
                        } catch (e) { alert("Erreur d'accès aux capteurs"); }
                    } else {
                        location.reload(); 
                    }
                };
            }

            // Arrêt d'urgence
            if ($('emergency-stop-btn')) {
                $('emergency-stop-btn').onclick = () => {
                    this.isTracking = false;
                    this.set('emergency-stop-status', "ACTIF 🔴");
                    console.warn("🛑 ARRÊT D'URGENCE DÉCLENCHÉ");
                };
            }

            // Mode Nuit / Thème
            if ($('toggle-mode-btn')) {
                $('toggle-mode-btn').onclick = () => {
                    this.isNightMode = !this.isNightMode;
                    document.body.style.filter = this.isNightMode ? "brightness(0.8) contrast(1.2)" : "none";
                    $('toggle-mode-btn').textContent = this.isNightMode ? "Mode Jour" : "Mode Nuit";
                };
            }

            // Réinitialisations
            if ($('reset-dist-btn')) $('reset-dist-btn').onclick = () => { this.engine.totalDist = 0; };
            if ($('reset-max-btn')) $('reset-max-btn').onclick = () => { this.vMax = 0; };
            if ($('reset-all-btn')) $('reset-all-btn').onclick = () => { location.reload(); };

            // Mode Nether (Ratio 1:8)
            if ($('nether-toggle-btn')) {
                $('nether-toggle-btn').onclick = () => {
                    this.isNetherMode = !this.isNetherMode;
                    $('nether-toggle-btn').textContent = this.isNetherMode ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                    $('nether-toggle-btn').style.color = this.isNetherMode ? "#ff4500" : "#fff";
                };
            }
        }

        /**
         * 2. GESTION DES ENTRÉES (INPUTS)
         */
        setupInputs() {
            if ($('mass-input')) {
                $('mass-input').oninput = (e) => {
                    const m = parseFloat(e.target.value) || 70;
                    this.engine.mass = m;
                    this.set('mass-display', m.toFixed(3) + " kg");
                };
            }

            if ($('celestial-body-select')) {
                $('celestial-body-select').onchange = (e) => {
                    const gravities = { "terre": 9.8067, "lune": 1.62, "mars": 3.71, "jupiter": 24.79 };
                    const g = gravities[e.target.value] || 9.8067;
                    this.set('gravity-base', g + " m/s²");
                };
            }
        }

        /**
         * 3. CAPTEURS & FUSION
         */
        startSensors() {
            window.addEventListener('devicemotion', (e) => {
                if (!this.isTracking) return;
                const dt = 0.016; // Approx 60Hz
                this.engine.predict(e.acceleration || {x:0,y:0,z:0}, e.rotationRate || {alpha:0,beta:0,gamma:0}, dt);
            });

            navigator.geolocation.watchPosition((p) => {
                this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                this.set('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
            }, null, { enableHighAccuracy: true });
        }

        /**
         * 4. MISE À JOUR VISUELLE (BOUCLE DE RENDU)
         */
        renderLoop() {
            const step = () => {
                const x = this.engine.x;
                const v = Math.sqrt(x.get([3,0])**2 + x.get([4,0])**2 + x.get([5,0])**2);
                const kmh = v * 3.6;
                if (v > this.vMax) this.vMax = v;

                // Affichage Vitesse
                this.set('speed-main-display', (v < 0.1 ? (v*1000).toFixed(2) : kmh.toFixed(2)));
                this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                this.set('speed-max-session', (this.vMax * 3.6).toFixed(2) + " km/h");
                
                // Distance avec support Nether
                let dist = this.engine.totalDist;
                if (this.isNetherMode) dist *= 8;
                this.set('total-distance-3d', (dist / 1000).toFixed(4) + " km");

                // Relativité
                const rel = this.engine.getRelativityData();
                this.set('lorentz-factor', rel.gamma.toFixed(15));
                this.set('time-dilation-vitesse', rel.dilation.toFixed(4) + " ns/j");
                this.set('schwarzschild-radius', rel.schwarzschild.toExponential(4));

                // IMU & Niveau à bulle
                this.set('accel-x', x.get([10,0]).toFixed(3));
                this.set('accel-y', x.get([11,0]).toFixed(3));
                
                // Minecraft Clock (Tick 0-24000)
                const now = new Date();
                const mcTicks = Math.floor(((now.getHours()*3600 + now.getMinutes()*60)/86400)*24000);
                this.set('time-minecraft', mcTicks.toString().padStart(5, '0'));

                requestAnimationFrame(step);
            };
            step();
        }

        startGlobalClock() {
            setInterval(() => {
                const now = new Date();
                this.set('local-time', now.toLocaleTimeString());
                this.set('utc-datetime', now.toISOString());
                this.set('elapsed-time', ((Date.now() - this.startTime)/1000).toFixed(2) + " s");
            }, 100);
        }

        set(id, val) { const el = $(id); if (el) el.textContent = val; }
    }

    window.addEventListener('load', () => { window.AppManager = new FullSystemManager(); });

})(window);
