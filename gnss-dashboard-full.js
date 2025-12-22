(function(window) {
    const $ = id => document.getElementById(id);

    class MasterSystem {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.C = 299792458;
            this.init();
        }

        init() {
            const btn = $('gps-pause-toggle');
            if (btn) btn.onclick = () => this.handleStart();
            
            // Autres boutons
            if ($('reset-all-btn')) $('reset-all-btn').onclick = () => location.reload();
            
            this.updateLoop();
        }

        async handleStart() {
            if (this.isRunning) { location.reload(); return; }

            // Vérification de la présence du moteur
            if (typeof window.UltimateUKFEngine !== 'function') {
                alert("Erreur fatale : Le moteur UKF n'est pas chargé. Vérifiez l'ordre des scripts.");
                return;
            }

            try {
                // Permission iOS/Android
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }

                this.engine = new window.UltimateUKFEngine();
                this.isRunning = true;

                // Démarrage Capteurs
                navigator.geolocation.watchPosition(p => {
                    this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                }, null, {enableHighAccuracy: true});

                window.ondevicemotion = (e) => {
                    if (this.isRunning) this.engine.predict(e.accelerationIncludingGravity, e.rotationRate, 0.02);
                };

                $('gps-pause-toggle').textContent = "🛑 ARRÊT DU SYSTÈME";
                $('gps-pause-toggle').style.background = "#dc3545";

            } catch (err) {
                alert("Erreur : " + err.message);
            }
        }

        updateLoop() {
            const tick = () => {
                const now = new Date();
                const elTime = $('local-time');
                if (elTime) elTime.textContent = now.toLocaleTimeString() + "." + now.getMilliseconds();

                if (this.isRunning && this.engine) {
                    const lat = this.engine.x.get([0, 0]);
                    const lon = this.engine.x.get([1, 0]);
                    
                    if ($('lat-ukf')) $('lat-ukf').textContent = lat.toFixed(7);
                    if ($('lon-ukf')) $('lon-ukf').textContent = lon.toFixed(7);
                    
                    // Calcul Relativiste
                    const v = Math.sqrt(this.engine.x.get([3,0])**2 + this.engine.x.get([4,0])**2);
                    const gamma = 1 / Math.sqrt(1 - (v/this.C)**2);
                    if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
                }
                requestAnimationFrame(tick);
            };
            tick();
        }
    }

    window.addEventListener('load', () => { window.Master = new MasterSystem(); });
})(window);
