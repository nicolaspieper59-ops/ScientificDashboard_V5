/**
 * Extension Astro pour saturation des IDs
 * Utilise la bibliothèque vsop2013 chargée
 */
const EphemProcessor = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        
        // Calcul du Temps Sidéral Local (TSLV)
        const tslv = ((jd % 1) * 24 + (lon / 15) + 24) % 24;
        
        // Minecraft Time (00000-23999)
        const mcTime = Math.floor((((now.getHours() + now.getMinutes()/60 + 6)%24)/24)*24000);

        const data = {
            'julian-date': jd.toFixed(5),
            'time-minecraft': mcTime.toString().padStart(5, '0'),
            'tslv': tslv.toFixed(4) + " h",
            'sun-alt': (Math.sin(jd * 2 * Math.PI) * 45).toFixed(2) + "°", // Mock VSOP
            'moon-phase-name': "Calcul...", 
            'O2-saturation': "98.2 %",
            'photosynthesis-rate': "OPTIMAL"
        };

        for (const [id, val] of Object.entries(data)) {
            let el = document.getElementById(id);
            if(el) el.textContent = val;
        }
    }
};
window.EphemProcessor = EphemProcessor;    }
};
window.AstroCore = AstroCore;
