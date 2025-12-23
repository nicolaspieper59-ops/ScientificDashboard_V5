/**
 * GNSS SPACETIME - ORCHESTRATEUR UNIVERSEL (V12.0)
 * Gère : Géodésie, Biométrie (Oiseaux/Gastéropodes), Manèges & Relativité
 */
(function(window) {
    const $ = id => document.getElementById(id);

    class MasterDashboard {
        constructor() {
            this.engine = null;
            this.isRunning = false;
            this.lastT = performance.now();
            
            // Constantes pour la Vérité Cosmique
            this.C = 299792458; // m/s
            this.V_EARTH_ORBIT = 29780; // m/s
            this.V_GALACTIC = 230000; // m/s

            this.init();
        }

        init() {
            // Sécurité : Attendre que les librairies soient présentes
            if (typeof math === 'undefined') {
                console.error("⛔ Math.js manquant !");
                return;
            }

            // Liaison des contrôles HTML
            if ($('gps-pause-toggle')) $('gps-pause-toggle').onclick = () => this.toggleSystem();
            
            // Lancement de la boucle de rendu
            this.renderLoop();
            console.log("🌌 Dashboard SpaceTime Prêt.");
        }

        async toggleSystem() {
            if (this.isRunning) {
                this.isRunning = false;
                if ($('gps-pause-toggle')) $('gps-pause-toggle').textContent = "▶️ REPRENDRE";
                return;
            }

            // Initialisation du moteur UKF défini dans ukf-lib.js
            if (!this.engine) {
                if (typeof window.ProfessionalUKF === 'undefined') {
                    alert("Erreur : ukf-lib.js n'est pas chargé ou contient une erreur.");
                    return;
                }
                this.engine = new window.ProfessionalUKF();
            }

            // Permission pour les capteurs IMU
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try { await DeviceMotionEvent.requestPermission(); } catch(e) { console.error(e); }
            }

            this.isRunning = true;
            if ($('gps-pause-toggle')) $('gps-pause-toggle').textContent = "⏸️ PAUSE";

            // Surveillance GNSS (Haute Précision)
            navigator.geolocation.watchPosition(
                p => this.updateGPS(p),
                e => this.handleLoss(e),
                { enableHighAccuracy: true, timeout: 5000 }
            );

            // Surveillance Accéléromètres/Gyroscopes (IMU)
            window.addEventListener('devicemotion', e => this.handleIMU(e));
        }

        updateGPS(pos) {
            if (!this.isRunning) return;
            this.engine.update({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                alt: pos.coords.altitude || 0
            });
            if ($('gps-status')) {
                $('gps-status').textContent = "📡 GNSS FIX";
                $('gps-status').style.color = "#00ff00";
            }
        }

        handleLoss(err) {
            if (this.engine) this.engine.isCaveMode = true;
            if ($('gps-status')) {
                $('gps-status').textContent = "🧗 MODE GROTTE/TUNNEL (INS)";
                $('gps-status').style.color = "orange";
            }
        }

        handleIMU(event) {
            if (!this.isRunning || !this.engine) return;

            const now = performance.now();
            const dt = (now - this.lastT) / 1000;
            this.lastT = now;

            // Suture Astro pour les marées (si astro.js chargé)
            let astro = (typeof window.computeAstroAll === 'function') ? 
                        window.computeAstroAll(new Date(), this.engine.x.get([0,0]), this.engine.x.get([1,0])) : null;

            // Calcul UKF (RK4 + Coriolis + Marées)
            this.engine.predict(dt, event.accelerationIncludingGravity, event.rotationRate, astro);
        }

        renderLoop() {
            const frame = () => {
                if (this.isRunning && this.engine) {
                    const s = this.engine.getState();
                    
                    // --- 1. AFFICHAGE NAVIGATION ---
                    if ($('lat-ukf')) $('lat-ukf').textContent = s.lat.toFixed(8);
                    if ($('lon-ukf')) $('lon-ukf').textContent = s.lon.toFixed(8);
                    if ($('speed-main-display')) $('speed-main-display').textContent = (s.v * 3.6).toFixed(2) + " km/h";

                    // --- 2. ANALYSE BIOMÉTRIQUE & DYNAMIQUE ---
                    let mode = "HUMAIN";
                    if (s.v < 0.005) mode = "GASTROPODE (Micro-dérive)";
                    else if (s.v > 0.05 && s.v < 2) mode = "INSECTE / MARCHE";
                    else if (s.v >= 2 && s.v < 15) mode = "OISEAU / VÉLO";
                    else if (s.v >= 15) mode = "MANÈGE / TOBOGGAN / AVION";
                    
                    if ($('status-physique')) $('status-physique').textContent = "MODE : " + mode;

                    // --- 3. VÉRITÉ COSMIQUE (Immobilité impossible) ---
                    const v_rot_terre = 465.1 * Math.cos(s.lat * Math.PI / 180);
                    const v_totale = s.v + v_rot_terre + this.V_EARTH_ORBIT + this.V_GALACTIC;
                    
                    const gamma = 1 / Math.sqrt(1 - Math.pow(v_totale / this.C, 2));
                    const time_drift = (gamma - 1) * 86400 * 1e9; // Nanosecondes par jour

                    if ($('v-cosmic')) $('v-cosmic').textContent = (v_totale * 3.6).toLocaleString() + " km/h";
                    if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(16);
                    if ($('time-dilation-vitesse')) $('time-dilation-vitesse').textContent = time_drift.toFixed(2) + " ns/j";
                    
                    // Mise à jour du Niveau à Bulle (IMU)
                    this.updateSpiritLevel(s.pitch, s.roll);
                }
                requestAnimationFrame(frame);
            };
            frame();
        }

        updateSpiritLevel(p, r) {
            const bubble = $('spirit-level-bubble');
            if (bubble) {
                const moveX = (r || 0) * 2; 
                const moveY = (p || 0) * 2;
                bubble.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
            }
        }
    }

    // Instanciation globale
    window.onload = () => { window.masterApp = new MasterDashboard(); };
})(window);
