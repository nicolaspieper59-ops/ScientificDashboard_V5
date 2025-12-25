/**
 * DASHBOARD MASTER CONTROL - FINAL VERSION
 */
(function() {
    "use strict";

    function updateAll() {
        const engine = window.MainEngine;
        if (!engine) return;

        engine.update(); // Mise à jour de la physique inertielle

        const v = engine.vMs;
        const c = 299792458;
        const now = new Date();

        // 1. VITESSE & DISTANCE
        update('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        update('speed-stable-ms', v.toFixed(5) + " m/s");
        update('total-distance-3d', engine.distance3D.toFixed(4) + " km");
        update('precise-distance-ukf', engine.distance3D.toFixed(7) + " km");
        update('dist-light-sec', ((engine.distance3D * 1000) / c).toExponential(6) + " s");

        // 2. RELATIVITÉ & COSMOLOGIE
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / c, 2));
        update('lorentz-factor', gamma.toFixed(15));
        
        const vLib = Math.sqrt(2 * 6.6743e-11 * 5.972e24 / 6371000);
        update('velocity-status', v > vLib ? "🚀 ÉCHAPPEMENT" : "🛰️ ORBITAL");
        update('cosmic-speed', ((v/c)*100).toExponential(4) + " % c");

        // 3. ASTRO & PERTURBATION (VSOP2013)
        const astro = calculateAstroPro(now, engine.lat, engine.lon);
        update('sun-alt', astro.sunAlt.toFixed(4) + "°");
        update('sun-distance', (astro.sunDist * 149597870.7).toLocaleString() + " km");
        
        // Gravité avec perturbation de marée
        const gPerturb = 9.80665 - (0.0000011 * Math.sin(astro.sunAlt * (Math.PI/180)));
        update('gravity-local', gPerturb.toFixed(6) + " m/s²");

        // 4. MÉTÉO & FLUIDES (OACI)
        const rho = 1.225 * Math.exp(-engine.altitude / 8500);
        const reynolds = (rho * v * 0.5) / 1.8e-5;
        update('air-density', rho.toFixed(4) + " kg/m³");
        update('reynolds-number', v > 0.1 ? Math.floor(reynolds).toLocaleString() : "0");
        update('pres-atm', (1013.25 * Math.pow(1 - (0.0065*engine.altitude)/288.15, 5.255)).toFixed(2) + " hPa");

        // 5. IMU
        update('pitch-val', engine.gyro.x.toFixed(1) + "°");
        update('roll-val', engine.gyro.y.toFixed(1) + "°");
    }

    // --- FIX BOUTON SYSTÈME ---
    function initControls() {
        const btn = document.querySelector('.status-indicator');
        if (btn) {
            btn.onclick = function() {
                if (!window.MainEngine) return;
                window.MainEngine.isRunning = !window.MainEngine.isRunning;
                this.textContent = window.MainEngine.isRunning ? "▶ SYSTÈME ACTIF" : "⏸ SYSTÈME EN PAUSE";
                this.style.color = window.MainEngine.isRunning ? "#00ff41" : "#ff4d4d";
            };
        }
    }

    function update(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', () => {
        initControls();
        setInterval(updateAll, 100);
    });
})();
