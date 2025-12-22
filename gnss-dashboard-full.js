/**
 * GNSS SPACETIME - MASTER SYSTEM (V120)
 * Gère l'UI, les Capteurs et la Suture avec le Moteur UKF
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
            this.init();
        }

        init() {
            // 1. Bouton MARCHE / ARRÊT
            const btnMain = $('gps-pause-toggle');
            if (btnMain) btnMain.onclick = () => this.toggleSystem();

            // 2. Boutons Utilitaires
            const btnReset = $('reset-all-btn');
            if (btnReset) btnReset.onclick = () => location.reload();

            const btnNight = $('night-mode-toggle');
            if (btnNight) btnNight.onclick = () => document.body.classList.toggle('night-theme');

            // 3. Initialisation Map (Leaflet)
            if (typeof L !== 'undefined' && $('map-container')) {
                this.map = L.map('map-container').setView([0, 0], 2);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
                this.marker = L.marker([0, 0]).addTo(this.map);
            }

            // 4. Calculs Statiques Immédiats
            this.updatePhysics(70.0); // Masse par défaut
            this.startLoop();
        }

        updatePhysics(m) {
            const Rs = (2 * this.G * m) / Math.pow(this.C, 2);
            const E0 = m * Math.pow(this.C, 2);
            this.setUI('schwarzschild-radius', Rs.toExponential(8) + " m");
            this.setUI('rest-mass-energy', E0.toExponential(8) + " J");
        }

        setUI(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }

        async toggleSystem() {
            const btn = $('gps-pause-toggle');
            if (!this.isRunning) {
                try {
                    // Déblocage sécurité navigateurs
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }

                    this.engine = new window.UltimateUKFEngine();
                    this.isRunning = true;

                    // Activation Capteurs
                    navigator.geolocation.watchPosition(p => {
                        this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                        if(this.map) {
                            const pos = [p.coords.latitude, p.coords.longitude];
                            this.map.setView(pos, 15);
                            this.marker.setLatLng(pos);
                        }
                    }, null, {enableHighAccuracy: true});

                    window.ondevicemotion = (e) => {
                        if(this.isRunning) this.engine.predict(e.accelerationIncludingGravity, e.rotationRate, 0.016);
                    };

                    btn.textContent = "🛑 ARRÊT GPS";
                    btn.style.background = "#dc3545";
                } catch (err) {
                    alert("Erreur Capteurs: " + err.message);
                }
            } else {
                location.reload();
            }
        }

        startLoop() {
            const run = () => {
                const now = new Date();
                this.setUI('local-time', now.toLocaleTimeString() + "." + now.getMilliseconds());

                // Calcul Temps Minecraft (24000 ticks / jour)
                const totalSec = (now.getHours()*3600) + (now.getMinutes()*60) + now.getSeconds();
                const ticks = Math.floor((totalSec / 86400) * 24000);
                this.setUI('time-minecraft', ticks.toString().padStart(5, '0'));

                if (this.isRunning && this.engine) {
                    this.updateDynamicUI(now);
                }
                requestAnimationFrame(run);
            };
            run();
        }

        updateDynamicUI(now) {
            const lat = this.engine.x.get([0, 0]);
            const lon = this.engine.x.get([1, 0]);
            const vx = this.engine.x.get([3, 0]);
            const vy = this.engine.x.get([4, 0]);
            const v = Math.sqrt(vx**2 + vy**2);

            this.setUI('lat-ukf', lat.toFixed(7));
            this.setUI('lon-ukf', lon.toFixed(7));
            this.setUI('vitesse-stable-kmh', (v * 3.6).toFixed(2) + " km/h");

            // Relativité
            const gamma = 1 / Math.sqrt(1 - Math.pow(v / this.C, 2));
            this.setUI('lorentz-factor', gamma.toFixed(14));

            // Suture Astro (Appel de astro.js)
            if (typeof computeAstroAll === 'function' && lat !== 0) {
                const astro = computeAstroAll(now, lat, lon);
                this.setUI('sun-alt', astro.sun.altitude.toFixed(4) + "°");
                this.setUI('moon-phase-name', astro.moon.illumination.phase_name);
            }
        }
    }
    window.addEventListener('load', () => { window.Master = new MasterSystem(); });
})(window);
