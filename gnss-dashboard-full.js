/**
 * GNSS SPACETIME DASHBOARD - CONTROLLER COMPLET
 * Gère l'intégralité des boutons et de l'affichage HTML
 */

window.addEventListener('load', () => {
    // 1. Liaison avec le moteur ProfessionalUKF défini dans ukf-lib.js
    if (typeof window.ProfessionalUKF !== 'undefined') {
        window.MainEngine = new window.ProfessionalUKF();
    }

    // 2. ÉCOUTEURS DES BOUTONS (SECTION CONTRÔLES)
    
    // Bouton Master Marche/Arrêt
    const masterBtn = document.getElementById('gps-pause-toggle');
    if (masterBtn) {
        masterBtn.addEventListener('click', () => {
            // La logique d'activation est gérée par le moteur lui-même
            // Ce listener peut servir à des effets visuels supplémentaires
            console.log("Système activé via l'interface");
        });
    }

    // Mode Nuit
    document.getElementById('toggle-night-mode')?.addEventListener('click', () => {
        document.body.classList.toggle('night-mode');
        const isNight = document.body.classList.contains('night-mode');
        document.getElementById('toggle-night-mode').textContent = isNight ? "☀️ Mode Jour" : "🌙 Mode Nuit";
    });

    // Réinitialisation Distance
    document.getElementById('btn-reset-dist')?.addEventListener('click', () => {
        if (window.MainEngine) {
            window.MainEngine.totalDist = 0;
            updateElementText('total-distance-3d', "0.00000 km");
        }
    });

    // Réinitialisation V-Max
    document.getElementById('btn-reset-vmax')?.addEventListener('click', () => {
        if (window.MainEngine) {
            window.MainEngine.vMax = 0;
            updateElementText('v-max-session', "0.0 km/h");
        }
    });

    // Capturer Données (Screenshot / Log)
    document.getElementById('btn-capture')?.addEventListener('click', () => {
        const timestamp = new Date().toISOString();
        const speed = document.getElementById('speed-main-display')?.textContent;
        console.log(`[CAPTURE ${timestamp}] Vitesse: ${speed} km/h`);
        alert(`Données capturées à ${timestamp}\nVitesse : ${speed} km/h`);
    });

    // TOUT RÉINITIALISER
    document.querySelector('.btn-danger')?.addEventListener('click', () => {
        if (confirm("Voulez-vous réinitialiser TOUTES les données de session ?")) {
            location.reload();
        }
    });

    // 3. BOUCLE DE RENDU HAUTE FRÉQUENCE (Update UI)
    function renderLoop() {
        if (window.MainEngine && window.MainEngine.isRunning) {
            const engine = window.MainEngine;

            // Mise à jour des vitesses et distances
            updateElementText('speed-main-display', engine.vKmh?.toFixed(engine.vKmh < 0.1 ? 5 : 1));
            updateElementText('speed-stable-kmh', engine.vKmh?.toFixed(3) + " km/h");
            updateElementText('speed-stable-ms', engine.vMs?.toFixed(5) + " m/s");
            updateElementText('v-max-session', engine.vMax?.toFixed(1) + " km/h");
            updateElementText('total-distance-3d', (engine.totalDist / 1000).toFixed(5) + " km");

            // Physique & Relativité
            const c = 299792458;
            const beta = engine.vMs / c;
            const gamma = 1 / Math.sqrt(1 - (beta ** 2));
            updateElementText('lorentz-factor', gamma.toFixed(15));
            updateElementText('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");

            // Dynamique & G-Force
            if (engine.lastAcc) {
                const gForce = (engine.lastAcc / 9.80665).toFixed(3);
                updateElementText('force-g-long', gForce);
            }

            // Niveau à Bulle
            const bubble = document.getElementById('bubble');
            if (bubble && engine.tilt) {
                const tx = -engine.tilt.x * 10;
                const ty = engine.tilt.y * 10;
                bubble.style.transform = `translate(${tx}px, ${ty}px)`;
                updateElementText('pitch-display', (engine.tilt.y * (180/Math.PI)).toFixed(1) + "°");
                updateElementText('roll-display', (engine.tilt.x * (180/Math.PI)).toFixed(1) + "°");
            }
        }
        requestAnimationFrame(renderLoop);
    }

    // 4. BOUCLE ASTRO & HORLOGES (1 Hz)
    setInterval(() => {
        const now = new Date();
        updateElementText('local-time', now.toLocaleTimeString());
        updateElementText('utc-time', now.toISOString().split('T')[1].split('.')[0] + " GMT");

        // Transfert vers astro.js
        if (window.MainEngine && typeof window.updateAstroData === 'function') {
            window.updateAstroData(window.MainEngine.lat, window.MainEngine.lon, window.MainEngine.alt);
        }
    }, 1000);

    renderLoop();
});

// Fonction utilitaire pour éviter les erreurs si un ID manque dans le HTML
function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
                }
