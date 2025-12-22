/**
 * GNSS SPACETIME - MASTER ORCHESTRATOR (V112)
 * Gestion de l'UI et Suture avec l'UKF
 */
(function(window) {
    const $ = id => document.getElementById(id);

    class MasterSystem {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.startTime = Date.now();
            this.C = 299792458;
            this.G = 6.67430e-11;
            this.mass = 70.0;
            this.init();
        }

        init() {
            // 1. Branchement des boutons
            const btnMain = $('gps-pause-toggle');
            if (btnMain) btnMain.onclick = () => this.handleToggle();

            const btnNight = $('toggle-mode-btn');
            if (btnNight) btnNight.onclick = () => document.body.classList.toggle('dark-mode');

            const btnResetDist = $('reset-dist-btn');
            if (btnResetDist) btnResetDist.onclick = () => { if(this.engine) this.engine.totalDist = 0; };

            const btnResetAll = $('reset-all-btn');
            if (btnResetAll) btnResetAll.onclick = () => location.reload();

            // 2. Initialisation des constantes
            this.injectPhysics();
            
            // 3. Boucle de rendu
            this.startLoop();
        }

        injectPhysics() {
            const Rs = (2 * this.G * this.mass) / Math.pow(this.C, 2);
            const E0 = this.mass * Math.pow(this.C, 2);
            this.safeSet('schwarzschild-radius', Rs.toExponential(8) + " m");
            this.safeSet('rest-mass-energy', E0.toExponential(8) + " J");
        }

        safeSet(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }

        async handleToggle() {
            if (!this.isRunning) {
                try {
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }

                    // On vérifie si la classe est bien chargée pour éviter l'erreur de la capture
                    if (typeof window.UltimateUKFEngine === 'undefined') {
                        throw new Error("Classe UKF non chargée. Vérifiez l'ordre des scripts.");
                    }

                    this.engine = new window.UltimateUKFEngine();
                    this.isRunning = true;

                    // Lancement des capteurs
                    navigator.geolocation.watchPosition(p => this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude));
                    window.addEventListener('devicemotion', (e) => {
                        if(this.isRunning) this.engine.predict(e.acceleration, e.rotationRate, 0.016);
                    });

                    $('gps-pause-toggle').textContent = "🛑 ARRÊT GPS";
                    $('gps-pause-toggle').style.background = "#dc3545";
                } catch (err) {
                    alert("Erreur critique : " + err.message);
                }
            } else {
                location.reload();
            }
        }

        startLoop() {
            const run = () => {
                const now = new Date();
                this.safeSet('local-time', now.toLocaleTimeString() + "." + now.getMilliseconds());

                // Heure Minecraft
                const ticks = Math.floor(((now % 86400000) / 3600000) * 1000);
                this.safeSet('time-minecraft', ticks + " ticks");

                if (this.isRunning && this.engine) {
                    const lat = this.engine.x.get([0, 0]);
                    const lon = this.engine.x.get([1, 0]);
                    this.safeSet('lat-ukf', lat.toFixed(7));
                    this.safeSet('lon-ukf', lon.toFixed(7));
                    
                    // Suture Astro
                    if (typeof computeAstroAll === 'function' && lat !== 0) {
                        const a = computeAstroAll(now, lat, lon);
                        this.safeSet('sun-alt', a.sun.altitude.toFixed(4) + "°");
                    }
                }
                requestAnimationFrame(run);
            };
            run();
        }
    }
    window.addEventListener('load', () => { window.Master = new MasterSystem(); });
})(window);
