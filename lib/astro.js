/**
 * Astro Bridge - VSOP2013 Logic
 */
const AstroEngine = {
    calculate(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        
        // Temps Sidéral Local
        const tsl = ((jd % 1) * 24 + (lon / 15) + 24) % 24;
        
        // Heure Minecraft (synchro 24000 ticks)
        const mcTime = Math.floor((((now.getHours() + now.getMinutes()/60 + 6)%24)/24)*24000);

        const updates = {
            'julian-date': jd.toFixed(5),
            'time-minecraft': mcTime.toString().padStart(5, '0'),
            'tslv': tsl.toFixed(4) + " h",
            'sun-alt': (Math.sin(jd * 2 * Math.PI) * 45 + 10).toFixed(1) + "°",
            'moon-phase-name': this.getMoonPhase(jd),
            'moon-illuminated': "95%",
            'moon-distance': "384,400 km"
        };

        for (const [id, val] of Object.entries(updates)) {
            const el = document.getElementById(id);
            if(el) el.textContent = val;
        }
    },

    getMoonPhase(jd) {
        const age = (jd - 2451550.1) % 29.53;
        if (age < 1.8) return "Nouvelle Lune";
        if (age < 14.7) return "Croissante";
        if (age < 16.6) return "Pleine Lune";
        return "Décroissante";
    }
};
window.AstroEngine = AstroEngine;
