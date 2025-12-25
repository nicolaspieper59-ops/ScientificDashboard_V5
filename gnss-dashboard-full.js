/**
 * GNSS DASHBOARD MASTER CONTROL - FINAL VERSION
 * Gère les boutons, l'affichage et les calculs relativistes/astro
 */
(function() {
    "use strict";

    function updateAll() {
        const engine = window.MainEngine;
        if (!engine) return;

        engine.update(); // Pulse du moteur

        const v = engine.vMs;
        const c = 299792458;
        const now = new Date();

        // 1. DYNAMIQUE & VITESSE
        update('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        update('speed-stable-ms', v.toFixed(5) + " m/s");
        update('speed-max-session', (engine.maxSpeed * 3.6).toFixed(2) + " km/h");
        update('total-distance-3d', engine.distance3D.toFixed(4) + " km");
        update('precise-distance-ukf', engine.distance3D.toFixed(7) + " km");

        // 2. RELATIVITÉ & ÉNERGIE
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / c, 2));
        update('lorentz-factor', gamma.toFixed(15));
        update('cosmic-speed', ((v/c)*100).toExponential(4) + " % c");
        update('kinetic-energy', (0.5 * engine.mass * v * v).toFixed(2) + " J");

        // 3. ASTRO DE PRÉCISION (VSOP2013 via ephem.js)
        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, engine.lat, engine.lon);
            update('sun-alt', astro.sun.altitude.toFixed(4) + "°");
            update('sun-distance', (astro.sun.distance * 149597870.7).toLocaleString() + " km");
            
            // Perturbation Gravitationnelle (Effet de marée solaire)
            const gLoc = 9.80665 - (0.0000011 * Math.sin(astro.sun.altitude * (Math.PI/180)));
            update('gravity-local', gLoc.toFixed(6) + " m/s²");
        }

        // 4. MÉTÉO & FLUIDES (Modèle OACI)
        const rho = 1.225 * Math.exp(-engine.altitude / 8500);
        update('air-density', rho.toFixed(4) + " kg/m³");
        update('reynolds-number', v > 0.1 ? Math.floor((rho * v * 0.5) / 1.8e-5).toLocaleString() : "0");

        // 5. IMU
        update('pitch-val', engine.gyro.pitch.toFixed(1) + "°");
        update('roll-val', engine.gyro.roll.toFixed(1) + "°");
    }

    // --- LIAISON DES BOUTONS ---
    function setupButtons() {
        const engine = window.MainEngine;
        if (!engine) return;

        // MARCHE GPS / SYSTÈME
        const btnPower = document.querySelector('.status-indicator');
        if (btnPower) {
            btnPower.onclick = function() {
                engine.isRunning = !engine.isRunning;
                this.textContent = engine.isRunning ? "▶️ SYSTÈME ACTIF" : "⏸️ SYSTÈME EN PAUSE";
                this.style.color = engine.isRunning ? "#00ff41" : "#ff4d4d";
                if (engine.isRunning && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
            };
        }

        // RÉINITIALISATIONS
        const findAndBind = (text, fn) => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(text));
            if (btn) btn.onclick = fn;
        };

        findAndBind('Réinit. Dist.', () => { engine.distance3D = 0; });
        findAndBind('Réinit. V-Max', () => { engine.maxSpeed = 0; });
        findAndBind('TOUT RÉINITIALISER', () => {
            if(confirm("Réinitialiser toutes les données ?")) {
                engine.distance3D = 0; engine.maxSpeed = 0; engine.vMs = 0;
            }
        });
        findAndBind('Arrêt d\'urgence', () => { engine.isRunning = false; engine.vMs = 0; });
        findAndBind('Capturer données', exportCSV);
        findAndBind('Mode Nuit', () => document.body.classList.toggle('night-mode'));
    }

    function update(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function exportCSV() {
        const e = window.MainEngine;
        const csv = `Paramètre,Valeur\nTimestamp,${new Date().toISOString()}\nVitesse,${e.vMs} m/s\nDistance,${e.distance3D} km`;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Log_Pro_${Date.now()}.csv`;
        a.click();
    }

    window.addEventListener('load', () => {
        setupButtons();
        setInterval(updateAll, 100);
    });
})();
