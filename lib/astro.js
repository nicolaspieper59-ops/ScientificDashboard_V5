/**
 * Astro Logic - Offline fallback for N/A fields
 */
const AstroEngine = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5; // Date Julienne
        
        // Simulation rapide des positions (Simplifiée pour performance)
        const hours = now.getUTCHours() + now.getUTCMinutes()/60;
        const sunAlt = Math.sin((hours - 6) * Math.PI / 12) * 45; // Approximation
        
        const data = {
            'date-julienne': jd.toFixed(2),
            'sun-alt': sunAlt.toFixed(2) + "°",
            'local-time': now.toLocaleTimeString(),
            'gmt-time-display': now.toUTCString().split(' ')[4],
            'time-minecraft': Math.floor(((hours + 18) % 24) * 1000).toString().padStart(5, '0')
        };

        for (let id in data) {
            document.querySelectorAll(`[id^="${id}"]`).forEach(e => e.textContent = data[id]);
        }
    }
};
window.AstroEngine = AstroEngine;
