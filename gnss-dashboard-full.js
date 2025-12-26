(function() {
    "use strict";

    function startEngine() {
        // Initialisation du moteur si absent
        if (!window.MainEngine) window.MainEngine = new ProfessionalUKF();
        const engine = window.MainEngine;

        // 1. RECHERCHE DES BOUTONS PAR TEXTE (Car les IDs manquent parfois dans votre HTML)
        const findBtn = (text) => Array.from(document.querySelectorAll('button, div, span')).find(el => el.textContent.includes(text));

        const btnMarche = document.getElementById('gps-status') || findBtn('MARCHE GPS');
        const btnNether = findBtn('Mode Nether');
        const btnResetDist = findBtn('Réinit. Dist.');
        const btnResetAll = findBtn('TOUT RÉINITIALISER');

        // 2. LIAISON DES ACTIONS
        if (btnMarche) {
            btnMarche.onclick = function() {
                engine.isRunning = !engine.isRunning;
                this.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                this.style.color = engine.isRunning ? "#00ff00" : "#ff4d4d";
                if (engine.isRunning && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission().catch(e => console.log(e));
                }
            };
        }

        if (btnNether) {
            btnNether.onclick = function() {
                engine.isNetherMode = !engine.isNetherMode;
                this.textContent = engine.isNetherMode ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
            };
        }

        if (btnResetDist) btnResetDist.onclick = () => engine.distance3D = 0;
        if (btnResetAll) btnResetAll.onclick = () => { engine.distance3D = 0; engine.vMs = 0; engine.maxSpeed = 0; engine.velocityVec = {x:0,y:0,z:0}; };

        // 3. MISE À JOUR DE L'AFFICHAGE (SYNC AVEC VOTRE HTML)
        setInterval(() => {
            engine.update();
            try {
                // Vitesse
                document.getElementById('speed-stable-kmh').textContent = (engine.vMs * 3.6).toFixed(3) + " km/h";
                document.getElementById('speed-stable-ms').textContent = engine.vMs.toFixed(5) + " m/s";
                document.getElementById('speed-max-session').textContent = engine.maxSpeed.toFixed(2) + " km/h";
                
                // Distance
                document.getElementById('total-distance-3d').textContent = engine.distance3D.toFixed(3) + " km";
                document.getElementById('precise-distance-ukf').textContent = engine.distance3D.toFixed(7) + " km";
                
                // IMU & Relativité
                if(document.getElementById('accel-x')) document.getElementById('accel-x').textContent = engine.accel.x.toFixed(2);
                const gamma = 1 / Math.sqrt(1 - Math.pow(engine.vMs / 299792458, 2));
                document.getElementById('lorentz-factor').textContent = gamma.toFixed(15);
                
                // Nether Status
                const netherReport = document.getElementById('nether-mode-status'); // si ID existe
                if(netherReport) netherReport.textContent = engine.isNetherMode ? "ACTIF (1:8)" : "DÉSACTIVÉ (1:1)";

            } catch (err) { /* Sécurité pour ne pas casser le rendu */ }
        }, 100);
    }

    window.addEventListener('load', startEngine);
})();
