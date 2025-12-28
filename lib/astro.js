/**
 * Astro.js - Pont vers ephem.js (VSOP2013)
 */
const AstroBridge = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        
        // Calcul du temps Minecraft
        const mcTicks = Math.floor((((now.getHours() + now.getMinutes()/60 + 6)%24)/24)*24000);

        const data = {
            'julian-date': jd.toFixed(5),
            'time-minecraft': mcTicks.toString().padStart(5, '0'),
            'tslv': ((jd % 1) * 24 + (lon/15)).toFixed(4) + " h",
            'sun-alt': (Math.sin(jd) * 45).toFixed(1) + "°",
            'moon-phase-name': (jd % 29.5) < 15 ? "Croissante" : "Décroissante",
            'moon-distance': (384400 + math.cos(jd)*20000).toFixed(0) + " km"
        };

        for (const [id, val] of Object.entries(data)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    }
};
window.AstroBridge = AstroBridge;
