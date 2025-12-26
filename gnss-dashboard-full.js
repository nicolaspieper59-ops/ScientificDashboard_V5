/**
 * GNSS SpaceTime Dashboard - CONTROLEUR MASTER SYNCHRONISÉ
 * Analyse croisée complète : HTML (index 25) + UKF-Lib + Newton
 */
(function() {
    "use strict";

    // Configuration des IDs réels du HTML
    const DOM_MAP = {
        // Boutons et Contrôles
        btnToggle: 'gps-pause-toggle',
        btnNether: 'nether-toggle-btn',
        btnResetDist: 'reset-dist-btn',
        btnResetAll: 'reset-all-btn',
        
        // Affichage Vitesse
        speedMain: 'speed-main-display',
        speedKmh: 'speed-stable-kmh',
        speedMs: 'speed-stable-ms',
        speedMax: 'speed-max-session',
        
        // Odométrie
        distTotal: 'total-distance-3d',
        distPrecise: 'precise-distance-ukf',
        
        // IMU (Capteurs)
        accX: 'acc-x',
        accY: 'acc-y',
        accZ: 'acc-z',
        
        // Physique & Relativité
        lorentz: 'lorentz-factor',
        kinetic: 'kinetic-energy',
        gravLocal: 'gravity-local'
    };

    function initDashboard() {
        // Initialisation du moteur UKF (Newtonien)
        if (!window.MainEngine) {
            if (typeof ProfessionalUKF !== 'undefined') {
                window.MainEngine = new ProfessionalUKF();
            } else {
                console.error("❌ Erreur : ukf-lib.js non chargé.");
                return;
            }
        }
        
        const engine = window.MainEngine;

        // --- LIAISON DES ÉVÉNEMENTS ---

        // 1. Bouton MARCHE / PAUSE
        const btnStart = document.getElementById(DOM_MAP.btnToggle);
        if (btnStart) {
            btnStart.addEventListener('click', function() {
                engine.isRunning = !engine.isRunning;
                this.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                this.style.backgroundColor = engine.isRunning ? "#28a745" : "#555";
                
                // Demande de permission pour les capteurs (iOS/Android)
                if (engine.isRunning && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission().catch(console.error);
                }
            });
        }

        // 2. Mode Nether (1:8)
        const btnNether = document.getElementById(DOM_MAP.btnNether);
        if (btnNether) {
            btnNether.addEventListener('click', function() {
                engine.isNetherMode = !engine.isNetherMode;
                this.textContent = engine.isNetherMode ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                this.classList.toggle('active', engine.isNetherMode);
            });
        }

        // 3. Réinitialisations
        const btnResetDist = document.getElementById(DOM_MAP.btnResetDist);
        if (btnResetDist) btnResetDist.onclick = () => engine.distance3D = 0;

        const btnResetAll = document.getElementById(DOM_MAP.btnResetAll);
        if (btnResetAll) {
            btnResetAll.onclick = () => {
                engine.vMs = 0;
                engine.distance3D = 0;
                engine.maxSpeed = 0;
                engine.velocityVec = { x: 0, y: 0, z: 0 };
            };
        }

        // --- BOUCLE DE MISE À JOUR (10 Hz) ---
        setInterval(() => {
            if (!engine.isRunning) return;

            engine.update(); // Appel du moteur Newtonien

            try {
                // MISE À JOUR VITESSES
                const vKmh = engine.vMs * 3.6;
                updateText(DOM_MAP.speedMain, vKmh.toFixed(1) + " km/h");
                updateText(DOM_MAP.speedKmh, vKmh.toFixed(3) + " km/h");
                updateText(DOM_MAP.speedMs, engine.vMs.toFixed(5) + " m/s");
                updateText(DOM_MAP.speedMax, engine.maxSpeed.toFixed(2) + " km/h");

                // MISE À JOUR ODOMÉTRIE
                updateText(DOM_MAP.distTotal, engine.distance3D.toFixed(5) + " km");
                updateText(DOM_MAP.distPrecise, engine.distance3D.toFixed(8) + " km");

                // MISE À JOUR IMU (Capteurs réels)
                updateText(DOM_MAP.accX, engine.accel.x.toFixed(3));
                updateText(DOM_MAP.accY, engine.accel.y.toFixed(3));
                updateText(DOM_MAP.accZ, engine.accel.z.toFixed(3));

                // PHYSIQUE RELATIVISTE (Lorentz)
                const c = 299792458;
                const ratio = engine.vMs / c;
                const gamma = 1 / Math.sqrt(1 - Math.pow(ratio, 2));
                updateText(DOM_MAP.lorentz, gamma.toFixed(15));

                // ÉNERGIE CINÉTIQUE (Ec = 1/2 mv²)
                const energy = 0.5 * engine.mass * Math.pow(engine.vMs, 2);
                updateText(DOM_MAP.kinetic, energy.toFixed(2) + " J");

                // Gravité Locale Calibrée
                if (engine.gBase) {
                    updateText(DOM_MAP.gravLocal, engine.gBase.toFixed(5) + " m/s²");
                }

            } catch (error) {
                // Silencieux pour éviter que la colonne ne disparaisse en cas de DOM manquant
            }
        }, 100);
    }

    // Fonction utilitaire pour éviter les erreurs de DOM nul
    function updateText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // Lancement propre
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
        initDashboard();
    }
})();
