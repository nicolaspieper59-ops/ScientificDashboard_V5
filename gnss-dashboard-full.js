/**
 * GNSS SPACETIME DASHBOARD - ARCHITECTURE MAÎTRE V8
 * Fusion ESKF 21-états | Relativité | Bio-SVT | Mécanique des Fluides
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458; 
    const G = 6.67430e-11;

    class GlobalSystemController {
        constructor() {
            // Moteur de fusion (nécessite ukf-lib.js chargé)
            this.engine = new window.ProfessionalUKF();
            
            // État du système
            this.isTracking = false;
            this.startTime = Date.now();
            this.lastT = performance.now();
            this.vMax = 0;
            this.totalDist = 0;

            this.init();
        }

        init() {
            console.log("🚀 Initialisation du Dashboard Professionnel...");
            this.bindEvents();
            this.startMainClock();
            this.renderLoop();
        }

        bindEvents() {
            // Bouton Marche/Arrêt
            const mainBtn = $('gps-pause-toggle');
            if (mainBtn) {
                mainBtn.onclick = async () => {
                    if (!this.isTracking) {
                        await this.requestSensors();
                        this.isTracking = true;
                        mainBtn.innerHTML = "⏸ PAUSE SYSTÈME";
                        mainBtn.classList.add('active');
                        this.set('ukf-status', "FUSION ACTIVE");
                    } else {
                        location.reload(); 
                    }
                };
            }

            // Réinitialisations
            if ($('reset-all-btn')) $('reset-all-btn').onclick = () => location.reload();
            if ($('reset-dist-btn')) $('reset-dist-btn').onclick = () => this.totalDist = 0;

            // Inputs dynamiques
            if ($('mass-input')) {
                $('mass-input').oninput = (e) => {
                    const m = parseFloat(e.target.value);
                    this.engine.mass = m;
                    this.set('mass-display', m.toFixed(3) + " kg");
                };
            }
        }

        async requestSensors() {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            
            window.addEventListener('devicemotion', (e) => this.updateInertial(e));
            window.addEventListener('deviceorientation', (e) => this.updateOrientation(e));
            
            navigator.geolocation.watchPosition(
                (p) => this.updateGPS(p),
                null, 
                { enableHighAccuracy: true, maximumAge: 0 }
            );
        }

        updateInertial(e) {
            if (!this.isTracking) return;
            const now = performance.now();
            const dt = (now - this.lastT) / 1000;
            this.lastT = now;

            const acc = e.acceleration || {x:0, y:0, z:0};
            const rot = e.rotationRate || {alpha:0, beta:0, gamma:0};

            // Injection dans le filtre UKF (Calcul sub-mm et haute vitesse)
            this.engine.predict(acc, rot, dt);
            
            // Mise à jour IMU brute
            this.set('accel-x', acc.x.toFixed(3));
            this.set('accel-y', acc.y.toFixed(3));
            this.set('accel-z', acc.z ? acc.z.toFixed(3) : "N/A");
            this.set('nyquist-limit', Math.round(1/dt) + " Hz");
        }

        updateGPS(p) {
            this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
            this.set('gps-status', "FIX GPS ACQUIS");
            this.set('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
        }

        updateOrientation(e) {
            this.set('pitch', (e.beta || 0).toFixed(1) + "°");
            this.set('roll', (e.gamma || 0).toFixed(1) + "°");
            const bubble = $('bubble');
            if (bubble) {
                bubble.style.transform = `translate(calc(-50% + ${e.gamma}px), calc(-50% + ${e.beta}px))`;
            }
        }

        /**
         * LOGIQUE DE RENDU DES DONNÉES (ID par ID)
         */
        renderLoop() {
            const update = () => {
                const x = this.engine.x;
                const v = Math.sqrt(x.get([3,0])**2 + x.get([4,0])**2 + x.get([5,0])**2);
                const kmh = v * 3.6;
                if (v > this.vMax) this.vMax = v;

                // --- VITESSE & DISTANCE ---
                this.set('speed-main-display', (v < 0.1 ? (v*1000).toFixed(2) : kmh.toFixed(2)));
                this.set('speed-status-text', v < 0.1 ? "MODE MICROSCOPIQUE (mm/s)" : "MODE VÉHICULE (km/h)");
                this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                this.set('speed-stable-ms', v.toFixed(3) + " m/s");
                this.set('total-distance-3d', (this.engine.totalDist / 1000).toFixed(6) + " km");

                // --- RELATIVITÉ ---
                const rel = this.engine.getRelativityData();
                this.set('lorentz-factor', rel.gamma.toFixed(15));
                this.set('time-dilation-vitesse', rel.dilation.toFixed(5) + " ns/j");
                this.set('relativistic-energy', rel.energy.toExponential(3) + " J");
                this.set('schwarzschild-radius', rel.schwarzschild.toExponential(5) + " m");
                this.set('pct-speed-of-light', (v/C * 100).toExponential(2) + " %");

                // --- MÉCANIQUE DES FLUIDES & DYNAMIQUE ---
                const rho = 1.225; // Densité air
                const q = 0.5 * rho * v**2;
                this.set('dynamic-pressure', q.toFixed(2) + " Pa");
                this.set('kinetic-energy', (0.5 * this.engine.mass * v**2).toFixed(2) + " J");
                this.set('force-g-long', (Math.sqrt(x.get([10,0])**2 + x.get([11,0])**2)/9.81).toFixed(3));

                // --- ASTRONOMIE & MINECRAFT ---
                this.updateAstroAndMinecraft();

                // --- DIAGNOSTIC FILTRE ---
                this.set('ukf-velocity-uncertainty', this.engine.P.get([3,3]).toExponential(2));

                requestAnimationFrame(update);
            };
            update();
        }

        updateAstroAndMinecraft() {
            const now = new Date();
            // Heure Minecraft (24000 ticks par jour)
            const mcTicks = Math.floor(((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400) * 24000);
            this.set('time-minecraft', mcTicks);
            
            this.set('local-time', now.toLocaleTimeString());
            this.set('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 19));
        }

        set(id, val) { const el = $(id); if (el) el.textContent = val; }
        startMainClock() { setInterval(() => this.set('elapsed-time', ((Date.now() - this.startTime)/1000).toFixed(2) + " s"), 100); }
    }

    window.addEventListener('load', () => { window.App = new GlobalSystemController(); });
})(window);
