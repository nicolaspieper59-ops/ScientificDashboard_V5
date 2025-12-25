/**
 * MASTER CONTROL SYNC - Connecte la physique au HTML
 */
(function() {
    "use strict";

    function init() {
        if (!window.MainEngine) window.MainEngine = new ProfessionalUKF();
        const engine = window.MainEngine;

        // --- LIAISON DES BOUTONS ---
        const btnPower = document.querySelector('.status-indicator') || document.getElementById('gps-status');
        if (btnPower) {
            btnPower.onclick = function() {
                engine.isRunning = !engine.isRunning;
                this.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                this.style.color = engine.isRunning ? "#00ff00" : "#ff4d4d";
                if (engine.isRunning && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
            };
        }

        // Mode Nether (cherche le texte dans le HTML)
        const btnNether = Array.from(document.querySelectorAll('div, span, button')).find(el => el.textContent.includes('Nether'));
        if (btnNether) {
            btnNether.onclick = () => {
                engine.isNetherMode = !engine.isNetherMode;
                btnNether.textContent = engine.isNetherMode ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
            };
        }

        // Réinitialisations
        const bind = (txt, fn) => {
            const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(txt));
            if (el) el.onclick = fn;
        };
        bind('Réinit. Dist.', () => engine.distance3D = 0);
        bind('Réinit. V-Max', () => engine.maxSpeed = 0);
        bind('TOUT RÉINITIALISER', () => { engine.vMs = 0; engine.distance3D = 0; engine.maxSpeed = 0; });

        // --- BOUCLE DE MISE À JOUR ---
        setInterval(() => {
            engine.update();
            updateUI(engine);
        }, 100);
    }

    function updateUI(e) {
        const vKmh = e.vMs * 3.6;
        const c = 299792458;

        // On remplit les IDs exacts de votre index (30).html
        set('speed-stable-kmh', vKmh.toFixed(3) + " km/h");
        set('speed-stable-ms', e.vMs.toFixed(5) + " m/s");
        set('total-distance-3d', e.distance3D.toFixed(3) + " km");
        set('precise-distance-ukf', e.distance3D.toFixed(7) + " km");
        
        // Relativité
        const gamma = 1 / Math.sqrt(1 - Math.pow(e.vMs / c, 2));
        set('lorentz-factor', gamma.toFixed(15));
        
        // Astro (Via VSOP2013 si chargé)
        if (typeof vsop2013 !== 'undefined') {
            const jd = (new Date().getTime() / 86400000) + 2440587.5;
            set('date-astro', jd.toFixed(5));
        }
        
        // Énergie Cinétique (Newton)
        set('kinetic-energy', (0.5 * e.mass * e.vMs**2).toFixed(2) + " J");
    }

    function set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);
})();
