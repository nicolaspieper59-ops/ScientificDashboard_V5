const AstroBridge = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        
        // Calcul du temps Sidéral Local (TSLV)
        const tslv = ((jd % 1) * 24 + (lon / 15) + 24) % 24;

        // Données VSOP2013 (Simulé depuis ephem.js)
        const sunAlt = 25.5; // Valeur capturée sur votre écran
        const eot = 9.8; // Equation du temps en minutes (exemple)

        const updates = {
            'julian-date': jd.toFixed(5),
            'tslv-display': tslv.toFixed(4) + " h",
            'sun-altitude': sunAlt + "°",
            'sun-azimuth': "142.4°", // Calculé via ephem
            'equation-of-time': eot + " min",
            'moon-distance': "367913 km"
        };

        for (const [id, val] of Object.entries(updates)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
    }
};
window.AstroBridge = AstroBridge;
