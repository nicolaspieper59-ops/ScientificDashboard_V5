/**
 * ASTRO-LIB - Éphémérides et Temps Solaire
 */
const AstroEngine = {
    calculate(lat, lon) {
        const now = new Date();
        const jd = (now.getTime() / 86400000) + 2440587.5; // Date Julienne
        
        // Temps Sidéral Local Vrai (TSLV)
        const d = jd - 2451545.0;
        const gmst = 18.697374558 + 24.06570982441908 * d;
        const lst = (gmst + lon / 15) % 24;

        // Calcul simplifié de l'altitude du soleil
        const hourAngle = (lst - 12) * 15;
        const sunAlt = Math.asin(Math.sin(lat * Math.PI/180) * Math.sin(23.44 * Math.PI/180));

        return {
            jd: jd.toFixed(5),
            tslv: this.formatTime(lst),
            sunAlt: (sunAlt * 180/Math.PI).toFixed(2),
            phase: jd % 29.53 < 1.0 ? "Nouvelle Lune" : "Pleine Lune"
        };
    },

    formatTime(decimalHours) {
        const h = Math.floor(decimalHours);
        const m = Math.floor((decimalHours % 1) * 60);
        const s = Math.floor(((decimalHours % 1) * 60 % 1) * 60);
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
};
