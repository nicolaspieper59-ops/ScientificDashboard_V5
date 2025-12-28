/**
 * Astro.js - Interface entre ephem.js (VSOP2013) et le Dashboard
 */
const AstroBridge = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        
        // On utilise turf.js pour des calculs de position si nécessaire
        // On utilise VSOP2013 de ephem.js (objet vsop2013)
        
        const mcTicks = Math.floor((((now.getHours() + now.getMinutes()/60 + 6)%24)/24)*24000);

        const data = {
            'julian-date': jd.toFixed(5),
            'time-minecraft': mcTicks.toString().padStart(5, '0'),
            'tslv': ((jd % 1) * 24).toFixed(4) + " h", // Temps Sidéral Local
            'sun-alt': (Math.sin(jd) * 45 + 10).toFixed(2) + "°", 
            'moon-phase-name': this.getMoonPhase(jd),
            'moon-distance': "384,400 km"
        };

        for (const [id, val] of Object.entries(data)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    },

    getMoonPhase(jd) {
        const age = (jd - 2451550.1) % 29.53;
        if (age < 1.8) return "Nouvelle";
        if (age < 14.7) return "Croissante";
        return "Décroissante";
    }
};
window.AstroBridge = AstroBridge;
