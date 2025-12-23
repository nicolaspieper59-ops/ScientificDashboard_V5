/**
 * GNSS SPACETIME MASTER ENGINE - V13.0
 * Fusion Capteurs Haute Fréquence & Relativité Générale
 */
(function(window) {
    const $ = id => document.getElementById(id);

    class UniversalEngine {
        constructor() {
            this.isRunning = false;
            this.startTime = Date.now();
            this.lastT = performance.now();
            this.totalDist = 0;
            
            // Constantes Physiques Universelles
            this.C = 299792458;
            this.G = 6.67430e-11;
            this.EARTH_ROT = 465.1; // m/s à l'équateur
            this.SOLAR_ORBIT = 29780; // m/s
            this.GALACTIC_VEL = 230000; // m/s
            
            this.init();
        }

        init() {
            const btn = $('gps-pause-toggle');
            if (btn) btn.onclick = () => this.toggle();
            
            // Rafraîchissement de l'UI même à l'arrêt pour les constantes
            this.updateDisplay();
        }

        async toggle() {
            const btn = $('gps-pause-toggle');
            if (this.isRunning) {
                this.isRunning = false;
                btn.textContent = "▶️ MARCHE GPS";
                btn.style.background = "";
                return;
            }

            // Demande de permission DeviceMotion (Crucial pour mobile)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') return alert("Permission capteurs refusée.");
            }

            this.isRunning = true;
            btn.textContent = "⏸️ ARRÊT GPS";
            btn.style.background = "#dc3545";
            
            this.startTracking();
            this.render();
        }

        startTracking() {
            // 1. Haute Fréquence IMU (Device Motion)
            window.addEventListener('devicemotion', (e) => {
                if (!this.isRunning) return;
                const now = performance.now();
                const dt = (now - this.lastT) / 1000;
                this.lastT = now;

                const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
                const rot = e.rotationRate || {alpha:0, beta:0, gamma:0};

                // Update IMU UI
                if($('acc-x')) $('acc-x').textContent = (acc.x || 0).toFixed(4);
                if($('acc-y')) $('acc-y').textContent = (acc.y || 0).toFixed(4);
                if($('acc-z')) $('acc-z').textContent = (acc.z || 0).toFixed(4);

                // Calcul Inclinaison (Niveau à bulle)
                const pitch = Math.atan2(-acc.x, Math.sqrt(acc.y**2 + acc.z**2)) * (180/Math.PI);
                const roll = Math.atan2(acc.y, acc.z) * (180/Math.PI);
                if($('pitch')) $('pitch').textContent = pitch.toFixed(1) + "°";
                if($('roll')) $('roll').textContent = roll.toFixed(1) + "°";
            });

            // 2. Géolocalisation Précise
            navigator.geolocation.watchPosition((p) => {
                if (!this.isRunning) return;
                this.updateFromGPS(p.coords);
            }, null, { enableHighAccuracy: true });
        }

        updateFromGPS(coords) {
            const speed = coords.speed || 0; // m/s
            const lat = coords.latitude;
            
            // --- CALCULS RELATIVISTES ---
            // Vitesse de rotation locale
            const v_rot_local = this.EARTH_ROT * Math.cos(lat * Math.PI / 180);
            const v_totale = speed + v_rot_local + this.SOLAR_ORBIT + this.GALACTIC_VEL;
            
            const beta = v_totale / this.C;
            const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
            const dilation = (gamma - 1) * 86400 * 1e9; // ns/jour

            // --- MISE À JOUR DOM (Suture de tous tes IDs) ---
            if($('speed-main-display')) $('speed-main-display').textContent = (speed * 3.6).toFixed(2) + " km/h";
            if($('v-cosmic')) $('v-cosmic').textContent = (v_totale * 3.6).toLocaleString() + " km/h";
            if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);
            if($('time-dilation-vitesse')) $('time-dilation-vitesse').textContent = dilation.toFixed(3) + " ns/j";
            if($('lat-ukf')) $('lat-ukf').textContent = lat.toFixed(8);
            if($('lon-ukf')) $('lon-ukf').textContent = coords.longitude.toFixed(8);
            if($('alt-ukf')) $('alt-ukf').textContent = (coords.altitude || 0).toFixed(2) + " m";
        }

        render() {
            if (!this.isRunning) return;
            
            const elapsed = (Date.now() - this.startTime) / 1000;
            if($('elapsed-time')) $('elapsed-time').textContent = elapsed.toFixed(2) + " s";
            
            requestAnimationFrame(() => this.render());
        }

        updateDisplay() {
            // Valeurs statiques au démarrage
            if($('c-speed-val')) $('c-speed-val').textContent = this.C + " m/s";
            if($('g-constant-val')) $('g-constant-val').textContent = "6.67430e-11";
        }
    }

    window.masterApp = new UniversalEngine();
})(window);
