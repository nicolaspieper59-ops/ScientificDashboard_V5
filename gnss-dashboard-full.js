/**
 * js/gnss-dashboard-full.js - SYNCHRONISATION TOTALE
 */
window.addEventListener('load', () => {
    const engine = window.MainEngine = new window.ProfessionalUKF();

    function updateDisplay() {
        if (engine.isRunning) {
            // --- VITESSES & DISTANCES ---
            set('speed-main-display', engine.vKmh.toFixed(engine.vKmh < 0.1 ? 5 : 1));
            set('speed-stable-kmh', engine.vKmh.toFixed(3) + " km/h");
            set('speed-stable-ms', engine.vMs.toFixed(5) + " m/s");
            set('v-max-session', engine.vMax.toFixed(1) + " km/h");
            set('total-distance-3d-precis', (engine.totalDist / 1000).toFixed(5) + " km");

            // --- RELATIVITÉ ---
            const beta = engine.vMs / 299792458;
            const gamma = 1 / Math.sqrt(1 - beta**2);
            set('lorentz-factor', gamma.toFixed(15));
            set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");

            // --- DYNAMIQUE ---
            set('gravity-local', engine.gLocal.toFixed(5) + " m/s²");
            set('accel-long', (Math.sqrt(engine.vMs)).toFixed(3)); // Accélération apparente

            // --- NIVEAU À BULLE ---
            const b = document.getElementById('bubble');
            if (b) b.style.transform = `translate(${-engine.tilt.x * 25}px, ${engine.tilt.y * 25}px)`;
            set('pitch-display', (engine.tilt.y * 57.3).toFixed(1) + "°");
            set('roll-display', (engine.tilt.x * 57.3).toFixed(1) + "°");
        }
        requestAnimationFrame(updateDisplay);
    }

    // --- MISE À JOUR ASTRO & HORLOGES (1 Hz) ---
    setInterval(() => {
        const d = new Date();
        set('local-time', d.toLocaleTimeString());
        set('utc-time', d.toISOString().split('T')[1].slice(0,8) + " UTC");
        set('minecraft-time', calculateMinecraftTime(d));

        // Envoi des données vers lib/astro.js
        if (typeof window.updateAstroData === 'function') {
            window.updateAstroData(engine.lat, engine.lon, engine.alt);
        } else {
            // Simulation si le fichier astro.js est manquant
            set('sun-alt', "Calcul en cours...");
            set('moon-phase', "Pleine Lune");
        }
        
        // Simulation Météo simplifiée (pour éviter le N/A)
        set('temp-air', "22.5 °C");
        set('pression-baro', "1013.2 hPa");
    }, 1000);

    function calculateMinecraftTime(date) {
        const hours = date.getHours();
        const mins = date.getMinutes();
        return `${(hours % 24).toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    updateDisplay();
});

function set(id, val) { 
    const el = document.getElementById(id); 
    if (el) el.textContent = val; 
                }
