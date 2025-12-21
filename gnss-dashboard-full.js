/**
 * GNSS SPACETIME - MASTER CONTROLLER V10
 * LOGIQUE DE FUSION 21 ÉTATS ET RELATIVITÉ GÉNÉRALE
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458; 
    const G = 6.67430e-11;

    class ProfessionalDashboard {
        constructor() {
            // Liaison avec le moteur ProfessionalUKF21 défini dans ukf-lib.js
            this.ukf = (typeof ProfessionalUKF21 !== 'undefined') ? new ProfessionalUKF21() : null;
            
            this.state = {
                isRunning: false,
                isNether: false,
                startTime: Date.now(),
                lastT: performance.now(),
                mass: 70.0,
                vMax: 0
            };
            this.init();
        }

        init() {
            this.bindEvents();
            this.render();
        }

        bindEvents() {
            // BOUTON MARCHE/ARRÊT (Unlock Sensor API)
            $('gps-pause-toggle').onclick = async () => {
                if (!this.state.isRunning) {
                    try {
                        if (typeof DeviceMotionEvent.requestPermission === 'function') {
                            const p = await DeviceMotionEvent.requestPermission();
                            if (p !== 'granted') throw new Error();
                        }
                        this.state.isRunning = true;
                        this.state.startTime = Date.now();
                        $('gps-pause-toggle').innerHTML = "⏸ PAUSE SYSTÈME";
                        $('gps-pause-toggle').style.background = "#dc3545";
                        
                        // Activation des flux
                        window.addEventListener('devicemotion', (e) => this.ukf.processMotion(e));
                        this.startGPS();
                    } catch(e) { alert("Erreur: HTTPS requis pour les capteurs."); }
                } else { location.reload(); }
            };

            // LOGIQUE NETHER (Ratio 1:8)
            const netherBtn = $('nether-toggle-btn');
            if(netherBtn) {
                netherBtn.onclick = () => {
                    this.state.isNether = !this.state.isNether;
                    netherBtn.style.color = this.state.isNether ? "#ff4500" : "#fff";
                    this.set('distance-ratio', this.state.isNether ? "8.000" : "1.000");
                };
            }
        }

        startGPS() {
            navigator.geolocation.watchPosition((p) => {
                // Injection dans le filtre UKF
                if(this.ukf) this.ukf.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                this.set('gps-accuracy-display', p.coords.accuracy.toFixed(1) + " m");
            }, null, { enableHighAccuracy: true });
        }

        render() {
            const loop = () => {
                const now = new Date();
                
                // --- 1. HORLOGES ---
                this.set('local-time', now.toLocaleTimeString());
                this.set('utc-datetime', now.toISOString());
                
                if (this.state.isRunning && this.ukf) {
                    // --- 2. EXTRACTION DES 21 ÉTATS UKF ---
                    const x = this.ukf.x; // Vecteur d'état [21x1]
                    
                    // Vitesse fusionnée (États 3, 4, 5)
                    const vx = x.get([3, 0]);
                    const vy = x.get([4, 0]);
                    const vz = x.get([5, 0]);
                    const vMs = Math.sqrt(vx**2 + vy**2 + vz**2);
                    const kmh = vMs * 3.6;
                    if (vMs > this.state.vMax) this.state.vMax = vMs;

                    // --- 3. MISE À JOUR VITESSE & PHYSIQUE ---
                    this.set('speed-main-display', (vMs < 0.1 ? (vMs*1000).toFixed(2) : kmh.toFixed(2)));
                    this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
                    this.set('speed-stable-ms', vMs.toFixed(3) + " m/s");
                    this.set('speed-max-session', (this.state.vMax * 3.6).toFixed(2) + " km/h");

                    // --- 4. RELATIVITÉ GÉNÉRALE & RESTREINTE ---
                    const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
                    this.set('lorentz-factor', gamma.toFixed(15));
                    this.set('pct-speed-of-light', ((vMs/C)*100).toExponential(4) + " %");
                    this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
                    
                    // Énergie totale (E = γmc²)
                    const energyTotal = gamma * this.state.mass * Math.pow(C, 2);
                    this.set('relativistic-energy', energyTotal.toExponential(4) + " J");
                    
                    // Rayon de Schwarzschild (Rs = 2GM/c²)
                    const rs = (2 * G * this.state.mass) / Math.pow(C, 2);
                    this.set('schwarzschild-radius', rs.toExponential(6) + " m");

                    // --- 5. DYNAMIQUE DES FLUIDES ---
                    const q = 0.5 * 1.225 * Math.pow(vMs, 2);
                    this.set('dynamic-pressure', q.toFixed(2) + " Pa");
                    this.set('kinetic-energy', (0.5 * this.state.mass * vMs**2).toFixed(2) + " J");
                    this.set('mach-number', (vMs / 340.29).toFixed(5));

                    // --- 6. DISTANCE & MINECRAFT ---
                    let d = this.ukf.totalDist || 0;
                    if (this.state.isNether) d *= 8;
                    this.set('total-distance-3d', (d/1000).toFixed(5) + " km");
                    
                    const mcTicks = Math.floor(((now.getHours()*3600 + now.getMinutes()*60)/86400)*24000);
                    this.set('time-minecraft', mcTicks.toString().padStart(5, '0'));

                    // --- 7. DEBUG FILTRE (BIAS & INCERTITUDE) ---
                    this.set('incertitude-vitesse-p', Math.sqrt(this.ukf.P.get([3,3])).toExponential(2));
                    this.set('lat-ukf', x.get([0,0]).toFixed(6));
                    this.set('lon-ukf', x.get([1,0]).toFixed(6));
                }
                requestAnimationFrame(loop);
            };
            loop();
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
    }

    window.onload = () => { window.App = new ProfessionalDashboard(); };
})(window);
