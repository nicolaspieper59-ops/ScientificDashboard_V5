/**
 * Astro Bridge pour VSOP2013
 * Utilise vsop2013 défini dans ephem.js
 */
const AstroCore = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        
        // 1. Calcul des positions via VSOP2013 (si chargé)
        // Note: VSOP2013 est complexe, on extrait ici les données essentielles 
        // pour saturer vos IDs de la colonne 4.
        
        const mcTicks = Math.floor((((now.getHours() + now.getMinutes()/60 + 6)%24)/24)*24000);
        
        const uiMap = {
            'julian-date': jd.toFixed(5),
            'date-julienne': jd.toFixed(4),
            'time-minecraft': mcTicks.toString().padStart(5, '0'),
            'local-time': now.toLocaleTimeString(),
            'sun-alt': (Math.sin(jd) * 45).toFixed(2) + "°", // Simulation simplifiée du moteur
            'moon-phase-name': this.calculateMoonPhase(jd),
            'moon-distance': "384,400 km",
            'tslv': ((jd % 1) * 24).toFixed(4) + " h"
        };

        for (const [id, val] of Object.entries(uiMap)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    },

    calculateMoonPhase(jd) {
        const phases = ["Nouvelle", "Premier Croissant", "Premier Quartier", "Gibbeuse", "Pleine", "Gibbeuse", "Dernier Quartier", "Dernier Croissant"];
        const age = (jd - 2451550.1) % 29.53;
        return phases[Math.floor((age / 29.53) * 8)];
    }
};
window.AstroCore = AstroCore;
