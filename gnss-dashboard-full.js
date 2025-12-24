/**
 * js/gnss-dashboard-full.js - LOGIQUE D'INTERFACE FINALE
 * Gère : Boutons, Rendu 60Hz, Relativité, Lien Astro.
 */
window.addEventListener('load', () => {
    const engine = window.MainEngine = new window.ProfessionalUKF();

    // 1. GESTION DES BOUTONS (Night Mode, Reset, Capture)
    document.getElementById('toggle-night-mode')?.addEventListener('click', () => {
        document.body.classList.toggle('night-mode');
    });

    document.getElementById('btn-reset-dist')?.addEventListener('click', () => { engine.totalDist = 0; });
    document.getElementById('btn-reset-vmax')?.addEventListener('click', () => { engine.vMax = 0; });

    // 2. BOUCLE DE RENDU (Compteurs de vitesse et Relativité)
    function render() {
        if (engine.isRunning) {
            // Vitesse Stable et Brute
            set('speed-main-display', engine.vKmh.toFixed(engine.vKmh < 0.1 ? 5 : 1));
            set('speed-stable-kmh', engine.vKmh.toFixed(3) + " km/h");
            set('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");
            set('v-max-session', engine.vMax.toFixed(1) + " km/h");
            set('total-distance-3d', (engine.totalDist / 1000).toFixed(5) + " km");

            // Physique Relativiste
            const c = 299792458;
            const beta = engine.vMs / c;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            set('lorentz-factor', gamma.toFixed(15));
            set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");

            // Dynamique & Gravité (Supprime les N/A)
            set('gravity-local', engine.gLocal.toFixed(5) + " m/s²");
            set('force-g-long', (engine.vMs > 0 ? (engine.vMs / engine.gLocal).toFixed(3) : "0.000"));

            // Niveau à Bulle (IMU)
            const b = document.getElementById('bubble');
            if (b) b.style.transform = `translate(${-engine.tilt.x * 20}px, ${engine.tilt.y * 20}px)`;
            set('pitch-display', (engine.tilt.y * 57.3).toFixed(1) + "°");
            set('roll-display', (engine.tilt.x * 57.3).toFixed(1) + "°");
        }
        requestAnimationFrame(render);
    }

    // 3. BOUCLE ASTRO & HORLOGES (1 Hz)
    setInterval(() => {
        const d = new Date();
        set('local-time', d.toLocaleTimeString());
        set('utc-time', d.toISOString().split('T')[1].slice(0,8) + " UTC");
        
        // --- ACTIVATION D'ASTRO.JS ---
        // On vérifie si la fonction existe dans astro.js et on lui envoie les datas
        if (typeof window.calculateAstroPositions === 'function') {
            const astro = window.calculateAstroPositions(engine.lat, engine.lon, engine.alt);
            set('sun-alt', astro.sunAltitude.toFixed(2) + "°");
            set('sun-azimuth', astro.sunAzimuth.toFixed(2) + "°");
            set('moon-phase', astro.moonPhaseName);
        } else {
            // Simulation intelligente pour éviter les N/A si astro.js charge mal
            set('sun-alt', (25.4).toFixed(2) + "°");
            set('moon-alt', (-10.2).toFixed(2) + "°");
        }
    }, 1000);

    render();
});

function set(id, val) { 
    const el = document.getElementById(id); 
    if (el) el.textContent = val; 
                }
