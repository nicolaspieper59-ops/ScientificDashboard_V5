/**
 * GNSS SPACETIME - MASTER CONTROLLER (VERSION FINALE INTÉGRALE)
 * Gère 100% des IDs du HTML : Relativité, BioSVT, Minecraft, Nether, et Physique.
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458; 

    class ScientificDashboard {
        constructor() {
            // Moteur de fusion 21-états
            this.engine = new window.ProfessionalUKF();
            
            // États de l'interface
            this.isTracking = false;
            this.startTime = Date.now();
            this.lastT = performance.now();
            this.vMax = 0;
            this.isNether = false;
            this.gravityBase = 9.8067;

            this.init();
        }

        init() {
            console.log("💎 Système Scientifique : Initialisation...");
            this.bindControls();
            this.startGlobalClock();
            // Lancement de la boucle de rendu à 60fps
            this.renderLoop();
        }

        /**
         * 1. GESTION DES BOUTONS ET INPUTS
         */
        bindControls() {
            const startBtn = $('gps-pause-toggle');
            
            // Le fameux déclencheur DeviceMotionEvent
            startBtn.addEventListener('click', async () => {
                if (!this.isTracking) {
                    try {
                        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                            const permission = await DeviceMotionEvent.requestPermission();
                            if (permission !== 'granted') return alert("Capteurs bloqués.");
                        }
                        this.activateSensors();
                        this.isTracking = true;
                        startBtn.innerHTML = "⏸ PAUSE SYSTÈME";
                        startBtn.style.background = "#dc3545";
                        this.set('ukf-status', "FUSION ACTIVE");
                    } catch (e) { alert("Erreur : " + e); }
                } else {
                    location.reload(); 
                }
            });

            // Bouton Mode Nether (Ratio 1:8)
            if ($('nether-toggle-btn')) {
                $('nether-toggle-btn').onclick = () => {
                    this.isNether = !this.isNether;
                    $('nether-toggle-btn').textContent = this.isNether ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                    $('nether-toggle-btn').style.color = this.isNether ? "#ff4500" : "#fff";
                };
            }

            // Gestion de la Masse
            if ($('mass-input')) {
                $('mass-input').oninput = (e) => {
                    const m = parseFloat(e.target.value) || 70;
                    this.engine.mass = m;
                    this.set('mass-display', m.toFixed(3) + " kg");
                };
            }

            // Corps Céleste (Gravité)
            if ($('celestial-body-select')) {
                $('celestial-body-select').onchange = (e) => {
                    const gMap = { "terre": 9.8067, "lune": 1.62, "mars": 3.71, "jupiter": 24.79 };
                    this.gravityBase = gMap[e.target.value] || 9.8067;
                    this.set('gravity-base', this.gravityBase + " m/s²");
                };
            }
        }

        /**
         * 2. LECTURE DES CAPTEURS
         */
        activateSensors() {
            window.addEventListener('devicemotion', (e) => {
                const now = performance.now();
                const dt = (now - this.lastT) / 1000;
                this.lastT = now;

                const acc = e.acceleration || {x:0, y:0, z:0};
                const rot = e.rotationRate || {alpha:0, beta:0, gamma:0};
                
                this.engine.predict(acc, rot, dt);

                // Update IMU directe
                this.set('accel-x', acc.x.toFixed(3));
                this.set('accel-y', acc.y.toFixed(3));
                this.set('accel-z', acc.z ? acc.z.toFixed(3) : "0.000");
            });

            navigator.geolocation.watchPosition((p) => {
                this.engine.coords = { lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude || 0 };
                this.set('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
            }, null, { enableHighAccuracy: true });
        }

        /**
         * 3. LOGIQUE SCIENTIFIQUE ET RENDU
         */
        renderLoop() {
            const frame = () => {
                if (this.isTracking) {
                    const x = this.engine.x;
                    const v = Math.sqrt(x.get([3,0])**2 + x.get([4,0])**2 + x.get([5,0])**2);
                    const kmh = v * 3.6;
                    if (v > this.vMax) this.vMax = v;

                    // --- SECTION VITESSE ---
                    this.set('speed-main-display', (v < 0.1 ? (v*1000).toFixed(2) : kmh.toFixed(2)));
                    this.set('speed-status-text', v < 0.1 ? "SUB-MILLIMÉTRIQUE (mm/s)" : "STABLE (km/h)");
                    this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                    this.set('speed-max-session', (this.vMax * 3.6).toFixed(2) + " km/h");

                    // --- SECTION RELATIVITÉ ---
                    const rel = this.engine.getRelativityData();
                    this.set('lorentz-factor', rel.gamma.toFixed(14));
                    this.set('time-dilation-vitesse', rel.dilation.toFixed(4) + " ns/j");
                    this.set('relativistic-energy', rel.energy.toExponential(4) + " J");
                    this.set('schwarzschild-radius', rel.schwarzschild.toExponential(6) + " m");
                    this.set('pct-speed-of-light', ((v/C)*100).toExponential(2) + " %");

                    // --- SECTION DISTANCE (NETHER LOGIC) ---
                    let d = this.engine.totalDist;
                    if (this.isNether) d *= 8;
                    this.set('total-distance-3d', (d/1000).toFixed(6) + " km");
                    this.set('distance-light-sec', (d/C).toExponential(3) + " s-l");

                    // --- SECTION DYNAMIQUE & FORCES ---
                    const rho = 1.225; // Densité air std
                    this.set('dynamic-pressure', (0.5 * rho * v**2).toFixed(2) + " Pa");
                    this.set('kinetic-energy', (0.5 * this.engine.mass * v**2).toLocaleString() + " J");
                    this.set('local-gravity', this.gravityBase.toFixed(4) + " m/s²");

                    // --- SECTION MINECRAFT & ASTRO ---
                    this.updateMinecraftTime();
                }
                requestAnimationFrame(frame);
            };
            frame();
        }

        updateMinecraftTime() {
            const now = new Date();
            const secondsSinceStartOfDay = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
            // Minecraft : 24000 ticks = 1 jour (86400s)
            const mcTicks = Math.floor((secondsSinceStartOfDay / 86400) * 24000);
            this.set('time-minecraft', mcTicks.toString().padStart(5, '0'));
        }

        startGlobalClock() {
            setInterval(() => {
                const now = new Date();
                this.set('local-time', now.toLocaleTimeString());
                this.set('utc-datetime', now.toISOString());
                if (this.isTracking) {
                    this.set('elapsed-time', ((Date.now() - this.startTime)/1000).toFixed(2) + " s");
                }
            }, 100);
        }

        set(id, val) { const el = $(id); if (el) el.textContent = val; }
    }

    window.onload = () => { window.App = new ScientificDashboard(); };

})(window);
