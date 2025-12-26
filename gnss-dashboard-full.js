(function() {
    "use strict";

    function startDashboard() {
        if (!window.MainEngine) window.MainEngine = new window.ProfessionalUKF();
        const engine = window.MainEngine;

        // Liaison Bouton Marche
        const btnPower = document.getElementById('gps-status');
        if (btnPower) {
            btnPower.style.cursor = "pointer";
            btnPower.onclick = function() {
                engine.isRunning = !engine.isRunning;
                this.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                this.style.color = engine.isRunning ? "#00ff00" : "#ff4d4d";
                if (engine.isRunning && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
            };
        }

        // Liaison Nether & Reset
        const setup = (id, action) => {
            const el = document.getElementById(id) || Array.from(document.querySelectorAll('button, div')).find(b => b.textContent.includes(id));
            if (el) el.onclick = action;
        };

        setup('Réinit. Dist.', () => engine.distance3D = 0);
        setup('TOUT RÉINITIALISER', () => { engine.vMs = 0; engine.distance3D = 0; engine.velocityVec = {x:0,y:0,z:0}; });
        
        // Mode Nether (Basculement)
        const netherEl = Array.from(document.querySelectorAll('div, span')).find(el => el.textContent.includes('Mode Nether'));
        if (netherEl) {
            netherEl.style.cursor = "pointer";
            netherEl.onclick = () => {
                engine.isNetherMode = !engine.isNetherMode;
                netherEl.textContent = engine.isNetherMode ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
            };
        }

        // Boucle de rendu
        setInterval(() => {
            engine.update();
            try {
                // Mise à jour des textes
                document.getElementById('speed-stable-kmh').textContent = (engine.vMs * 3.6).toFixed(3) + " km/h";
                document.getElementById('total-distance-3d').textContent = engine.distance3D.toFixed(3) + " km";
                document.getElementById('precise-distance-ukf').textContent = engine.distance3D.toFixed(7) + " km";
                document.getElementById('lorentz-factor').textContent = (1 / Math.sqrt(1 - Math.pow(engine.vMs / 299792458, 2))).toFixed(15);
                
                // Astro (si VSOP2013 est chargé via ephem.js)
                if (typeof vsop2013 !== 'undefined') {
                    const jd = (new Date().getTime() / 86400000) + 2440587.5;
                    document.getElementById('date-astro').textContent = jd.toFixed(4);
                }
            } catch (e) { /* Protection contre les IDs manquants */ }
        }, 100);
    }

    window.addEventListener('load', startDashboard);
})();
