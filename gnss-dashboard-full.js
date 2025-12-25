/**
 * MASTER INTERFACE - NEWTONIAN SYNC
 */
(function() {
    "use strict";

    function init() {
        const engine = window.MainEngine;

        // --- GESTION DU BOUTON MARCHE/ARRÊT ---
        const btnPower = document.querySelector('.status-indicator');
        if (btnPower) {
            btnPower.onclick = function() {
                engine.isRunning = !engine.isRunning;
                this.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                this.className = engine.isRunning ? "status-indicator active" : "status-indicator paused";
                this.style.color = engine.isRunning ? "#00ff41" : "#ff4d4d";
                
                if (engine.isRunning && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
            };
        }

        // --- GESTION DU MODE NETHER ---
        const btnNether = Array.from(document.querySelectorAll('div, button')).find(el => el.textContent.includes('Nether'));
        if (btnNether) {
            btnNether.onclick = function() {
                engine.isNetherMode = !engine.isNetherMode;
                this.textContent = engine.isNetherMode ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
            };
        }

        // --- RÉINITIALISATIONS ---
        const bind = (txt, fn) => {
            const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(txt));
            if (el) el.onclick = fn;
        };

        bind('Réinit. Dist.', () => engine.distance3D = 0);
        bind('Réinit. V-Max', () => engine.maxSpeed = 0);
        bind('TOUT RÉINITIALISER', () => {
            engine.vMs = 0; engine.distance3D = 0; engine.maxSpeed = 0;
            engine.velocityVec = {x:0, y:0, z:0};
        });

        setInterval(() => {
            engine.update();
            updateDisplay(engine);
        }, 100);
    }

    function updateDisplay(e) {
        const vKmh = e.vMs * 3.6;
        
        // Vitesse et Distance
        set('speed-stable-kmh', vKmh.toFixed(3) + " km/h");
        set('total-distance-3d', e.distance3D.toFixed(3) + " km");
        set('precise-distance-ukf', e.distance3D.toFixed(7) + " km");
        
        // Accélérations (IMU)
        set('accel-x', e.accel.x.toFixed(2));
        set('accel-y', e.accel.y.toFixed(2));
        set('accel-z', e.accel.z.toFixed(2));

        // Relativité (Einstein)
        const c = 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(e.vMs / c, 2));
        set('lorentz-factor', gamma.toFixed(15));

        // Astro VSOP2013 (si ephem.js et astro.js sont chargés)
        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(new Date(), e.lat, e.lon);
            set('sun-alt', astro.sun.altitude.toFixed(4) + "°");
        }
    }

    function set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);
})();
