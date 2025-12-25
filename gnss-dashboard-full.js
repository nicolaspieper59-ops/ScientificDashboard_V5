/**
 * GNSS SPACETIME DASHBOARD - MASTER CONTROLLER (V5.0)
 * Liaison Totale : UKF 21 États + VSOP2013 + Astro + UI
 */

(function() {
    "use strict";

    // 1. ÉTAT GLOBAL
    window.startTime = Date.now();
    const C = 299792458; // Vitesse de la lumière (m/s)

    window.addEventListener('load', () => {
        console.log("🚀 Initialisation du Master Controller...");
        
        // Initialisation forcée du moteur si absent
        if (typeof window.ProfessionalUKF !== 'undefined') {
            if (!window.MainEngine) {
                window.MainEngine = new window.ProfessionalUKF();
            }
            // Coordonnées par défaut (Marseille - votre capture)
            window.MainEngine.lat = 43.2845577;
            window.MainEngine.lon = 5.3587424;
            window.MainEngine.alt = 100;
        }

        setupUIEvents();
        
        // Lancement des boucles de rendu
        requestAnimationFrame(physicsLoop);
        setInterval(astroSystemLoop, 1000);
    });

    /**
     * BOUCLE PHYSIQUE (60 Hz)
     * Pour la fluidité de la vitesse, de la relativité et de l'IMU
     */
    function physicsLoop() {
        const engine = window.MainEngine;
        if (engine) {
            // --- Vitesses ---
            updateText('speed-main-display', engine.vKmh.toFixed(engine.vKmh < 0.1 ? 5 : 1));
            updateText('speed-stable-kmh', engine.vKmh.toFixed(3) + " km/h");
            updateText('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");
            updateText('v-max-session', engine.vMax.toFixed(1) + " km/h");
            updateText('total-distance-3d', (engine.totalDist / 1000).toFixed(5) + " km");

            // --- Relativité ---
            const beta = engine.vMs / C;
            const gamma = 1 / Math.sqrt(1 - (beta * beta));
            updateText('lorentz-factor', gamma.toFixed(15));
            updateText('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
            updateText('light-speed-percent', (beta * 100).toFixed(8) + " %");
            updateText('mach-number', (engine.vMs / 340.29).toFixed(4));

            // --- IMU / Niveau à Bulle ---
            if (engine.accel) {
                updateText('accel-x', engine.accel.x.toFixed(4));
                updateText('accel-y', engine.accel.y.toFixed(4));
                updateText('accel-z', engine.accel.z.toFixed(4));
            }
            const bubble = document.getElementById('bubble');
            if (bubble && engine.tilt) {
                bubble.style.transform = `translate(${-engine.tilt.x * 20}px, ${engine.tilt.y * 20}px)`;
                updateText('pitch-display', (engine.tilt.y * 57.3).toFixed(1) + "°");
                updateText('roll-display', (engine.tilt.x * 57.3).toFixed(1) + "°");
            }
        }
        requestAnimationFrame(physicsLoop);
    }

    /**
     * BOUCLE ASTRO & SYSTÈME (1 Hz)
     * Pour le Soleil, la Lune et le Temps
     */
    function astroSystemLoop() {
        const now = new Date();
        const engine = window.MainEngine || { lat: 43.2845, lon: 5.3587, alt: 100 };

        // --- Horloges ---
        updateText('local-time', now.toLocaleTimeString());
        updateText('utc-time', now.toISOString().slice(11, 19) + " UTC");
        updateText('session-elapsed-time', ((Date.now() - window.startTime) / 1000).toFixed(1) + " s");

        // --- Moteur Astro (Liaison astro.js + ephem.js) ---
        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, engine.lat, engine.lon);

            // Soleil
            updateText('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
            updateText('sun-azimuth', (astro.sun.azimuth * 57.3).toFixed(2) + "°");
            updateText('local-sidereal-time', formatHours(astro.TST_HRS));
            updateText('equation-of-time', astro.EOT_MIN.toFixed(2) + " min");
            updateText('noon-solar-utc', formatHours(astro.NOON_SOLAR_UTC));

            // Lune
            updateText('moon-phase', getMoonPhaseName(astro.moon.illumination.phase));
            updateText('moon-illumination', (astro.moon.illumination.fraction * 100).toFixed(1) + "%");
            updateText('moon-alt', (astro.moon.altitude * 57.3).toFixed(2) + "°");
            
            // État Nuit/Jour
            const isNight = (astro.sun.altitude * 57.3) < -0.83;
            updateText('night-status', isNight ? "NUIT (🌙)" : "JOUR (☀️)");
        }

        // --- Coordonnées ---
        updateText('lat-ukf', engine.lat.toFixed(7));
        updateText('lon-ukf', engine.lon.toFixed(7));
        updateText('alt-ukf', engine.alt.toFixed(2) + " m");
        updateText('gps-status', engine.isRunning ? "SYSTÈME ACTIF" : "PRÊT (INERTIEL)");
    }

    /**
     * GESTION DES BOUTONS
     */
    function setupUIEvents() {
        // Bouton Master (Permission Capteurs)
        document.getElementById('gps-pause-toggle')?.addEventListener('click', async function() {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try { await DeviceMotionEvent.requestPermission(); } catch(e) { console.error(e); }
            }
            
            const engine = window.MainEngine;
            if (engine) {
                engine.isRunning = !engine.isRunning;
                this.textContent = engine.isRunning ? "⏸ SYSTÈME ACTIF" : "▶ SYSTÈME EN PAUSE";
                this.style.background = engine.isRunning ? "#28a745" : "#ffc107";
            }
        });

        // Mode Nuit
        document.getElementById('toggle-night-mode')?.addEventListener('click', () => {
            document.body.classList.toggle('night-mode');
        });

        // Réinitialisation Distance
        document.getElementById('btn-reset-dist')?.addEventListener('click', () => {
            if (window.MainEngine) window.MainEngine.totalDist = 0;
        });
    }

    function updateText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

})();
