/**
 * GNSS SPACETIME - ORCHESTRATEUR FINAL (V102 PRO)
 * Fix : Forçage du bouton et synchronisation par Offset.
 */

(function(window) {
    const $ = id => document.getElementById(id);

    class MasterSystem {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.timeOffset = 0; // Mode autonome
            this.init();
        }

        init() {
            console.log("💎 MasterSystem: Initialisation...");
            
            // 1. Préparer la carte
            if (typeof L !== 'undefined' && $('map-container')) {
                this.map = L.map('map-container').setView([43.2965, 5.3698], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
            }

            // 2. Attacher le bouton (On écrase les anciens événements pour éviter les conflits)
            const btn = $('gps-pause-toggle');
            if (btn) {
                btn.onclick = (e) => this.handleStartStop(e);
            }

            // 3. Lancer la boucle de temps (0.001s)
            this.startClock();
        }

        async handleStartStop(e) {
            e.preventDefault();
            const btn = $('gps-pause-toggle');

            if (!this.isRunning) {
                console.log("📡 Démarrage du moteur UKF...");
                try {
                    // Permission Capteurs (Impératif)
                    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }

                    // Initialiser le moteur de ukf-class (13).js
                    if (typeof UltimateUKFEngine !== 'undefined') {
                        this.engine = new UltimateUKFEngine();
                        window.AppUKF = this.engine;
                        
                        // Forcer l'activation
                        this.engine.isRunning = true;
                        if (this.engine.setupUI) this.engine.setupUI(); 
                        
                        this.isRunning = true;
                        this.startTime = performance.now();
                        
                        // UI Update
                        btn.innerHTML = "🛑 ARRÊT GPS";
                        btn.style.background = "#dc3545";
                        btn.style.boxShadow = "0 0 20px rgba(220, 53, 69, 0.6)";
                    } else {
                        alert("Erreur: Moteur UKF introuvable. Vérifiez l'ordre des scripts.");
                    }
                } catch (err) {
                    console.error("Échec initialisation:", err);
                }
            } else {
                // Reset complet pour éviter les mémoires tampons polluées
                location.reload();
            }
        }

        startClock() {
            const loop = () => {
                const now = new Date(Date.now() + this.timeOffset);
                const ms = now.getMilliseconds().toString().padStart(3, '0');
                
                // Affichage Heure Pro (GMT/UTC)
                if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString() + "." + ms;
                if ($('utc-datetime')) $('utc-datetime').textContent = now.toISOString().replace('T', ' ').substring(0, 23);

                if (this.isRunning && this.engine) {
                    this.updateData(now);
                }
                requestAnimationFrame(loop);
            };
            loop();
        }

        updateData(now) {
            // 1. Extraire les données du vecteur d'état (x) du fichier ukf-class
            // Indices: 0=lat, 1=lon, 2=alt, 3=vx, 4=vy
            const lat = this.engine.x.get([0, 0]);
            const lon = this.engine.x.get([1, 0]);
            const vx = this.engine.x.get([3, 0]);
            const vy = this.engine.x.get([4, 0]);
            const v_stable = Math.sqrt(vx**2 + vy**2);

            if (lat !== 0 && lon !== 0) {
                if ($('lat-ukf')) $('lat-ukf').textContent = lat.toFixed(7);
                if ($('lon-ukf')) $('lon-ukf').textContent = lon.toFixed(7);

                // 2. Suture Astro (Appel de astro.js)
                if (typeof computeAstroAll === 'function') {
                    const astro = computeAstroAll(now, lat, lon);
                    this.setAstroUI(astro);
                }
            }

            // 3. Calculs Physiques (Relativité / Mach)
            this.setPhysicsUI(v_stable);
        }

        setAstroUI(a) {
            if ($('sun-alt')) $('sun-alt').textContent = a.sun.altitude.toFixed(4) + "°";
            if ($('moon-phase-name')) $('moon-phase-name').textContent = a.moon.illumination.phase_name;
            if ($('moon-distance')) $('moon-distance').textContent = (a.moon.distance / 1000).toFixed(0) + " km";
        }

        setPhysicsUI(v) {
            const beta = v / 299792458;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            if ($('mach-number')) $('mach-number').textContent = (v / 340.29).toFixed(5);
            if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
            if ($('dynamic-pressure')) $('dynamic-pressure').textContent = (0.5 * 1.225 * v**2).toFixed(4) + " Pa";
        }
    }

    // Lancement
    window.addEventListener('load', () => { window.Master = new MasterSystem(); });
})(window);
