(function(window) {
    const $ = id => document.getElementById(id);

    class MasterFlightSystem {
        constructor() {
            this.isRunning = false;
            this.engine = null;
            this.C = 299792458;
            this.lastTick = 0;
            this.init();
        }

        init() {
            // Liaison bouton
            const btn = $('gps-pause-toggle');
            if (btn) btn.onclick = () => this.bootSystem();
            
            // Calculs de physique relativiste au repos
            this.updateStaticPhysics();
            this.renderLoop();
        }

        updateStaticPhysics() {
            const m = 70.0; 
            const G = 6.67430e-11;
            this.safeSet('rest-mass-energy', (m * this.C**2).toExponential(6) + " J");
            this.safeSet('schwarzschild-radius', ((2*G*m)/this.C**2).toExponential(6) + " m");
        }

        async bootSystem() {
            if (this.isRunning) { location.reload(); return; }

            try {
                if (typeof window.UltimateUKFEngine === 'undefined') throw new Error("Moteur non chargé.");

                // Déblocage capteurs iOS/Android
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }

                this.engine = new window.UltimateUKFEngine();
                this.isRunning = true;
                this.lastTick = performance.now();

                // 1. GNSS (1Hz)
                navigator.geolocation.watchPosition(p => {
                    this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                }, null, { enableHighAccuracy: true });

                // 2. IMU (Haute Fréquence)
                window.ondevicemotion = (e) => {
                    const now = performance.now();
                    const dt = (now - this.lastTick) / 1000;
                    this.lastTick = now;
                    this.engine.predict(e.accelerationIncludingGravity, e.rotationRate, dt);
                };

                $('gps-pause-toggle').textContent = "🛑 TERMINATE SESSION";
                $('gps-pause-toggle').style.background = "#dc3545";

            } catch (err) {
                alert("SYSTEM FAILURE: " + err.message);
            }
        }

        renderLoop() {
            const frame = () => {
                const now = new Date();
                this.safeSet('local-time', now.toLocaleTimeString() + "." + now.getMilliseconds());

                if (this.isRunning && this.engine) {
                    const lat = this.engine.x.get([0, 0]);
                    const lon = this.engine.x.get([1, 0]);
                    const v = Math.sqrt(this.engine.x.get([3,0])**2 + this.engine.x.get([4,0])**2 + this.engine.x.get([5,0])**2);

                    this.safeSet('lat-ukf', lat.toFixed(8));
                    this.safeSet('lon-ukf', lon.toFixed(8));
                    this.safeSet('vitesse-stable-kmh', (v * 3.6).toFixed(2));
                    
                    // Facteur de Lorentz
                    const gamma = 1 / Math.sqrt(1 - (v/this.C)**2);
                    this.safeSet('lorentz-factor', gamma.toFixed(15));
                }
                requestAnimationFrame(frame);
            };
            frame();
        }

        safeSet(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }
    }
    window.addEventListener('load', () => new MasterFlightSystem());
})(window);
