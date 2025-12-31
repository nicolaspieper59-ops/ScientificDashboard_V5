/**
 * OMNISCIENCE V100 PRO - EPHEM LITE ENGINE
 * Moteur de calcul orbital autonome (Sans dépendance externe)
 */
const Ephem = {
    // Constantes
    J2000: 2451545.0,
    deg2rad: Math.PI / 180,
    rad2deg: 180 / Math.PI,

    /**
     * Convertit une date JS en Jour Julien
     */
    toJulian(date) {
        return (date.getTime() / 86400000) - (date.getTimezoneOffset() / 1440) + 2440587.5;
    },

    /**
     * Calcul du Temps Sidéral Local (LST)
     */
    getLST(date, lon) {
        const jd = this.toJulian(date);
        const d = jd - 2451545.0;
        // GMST (Greenwich Mean Sidereal Time)
        let gmst = 280.46061837 + 360.98564736629 * d;
        gmst = gmst % 360;
        if (gmst < 0) gmst += 360;
        
        // LST = GMST + Longitude
        let lst = gmst + lon;
        lst = lst % 360;
        if (lst < 0) lst += 360;

        // Conversion en HH:MM:SS
        const hours = lst / 15;
        const h = Math.floor(hours);
        const m = Math.floor((hours - h) * 60);
        const s = Math.floor(((hours - h) * 60 - m) * 60);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    },

    /**
     * Position du Soleil (Algorithme simplifié de Jean Meeus)
     */
    getSun(date, lat, lon) {
        const jd = this.toJulian(date);
        const d = jd - 2451545.0;
        
        // Anomalie moyenne / Longitude moyenne
        const M = (357.529 + 0.98560028 * d) % 360;
        const L = (280.459 + 0.98564736 * d) % 360;
        
        // Longitude écliptique
        const lambda = L + 1.915 * Math.sin(M * this.deg2rad) + 0.020 * Math.sin(2 * M * this.deg2rad);
        
        // Obliquité de l'écliptique
        const epsilon = 23.439 - 0.00000036 * d;
        
        // Coordonnées équatoriales (RA/Dec)
        const alpha = Math.atan2(Math.cos(epsilon * this.deg2rad) * Math.sin(lambda * this.deg2rad), Math.cos(lambda * this.deg2rad));
        const delta = Math.asin(Math.sin(epsilon * this.deg2rad) * Math.sin(lambda * this.deg2rad));
        
        return this.radecToAltAz(alpha, delta, date, lat, lon);
    },

    /**
     * Position de la Lune (Simplifié)
     */
    getMoon(date, lat, lon) {
        const jd = this.toJulian(date);
        const d = jd - 2451545.0;
        
        const L = (218.316 + 13.176396 * d) % 360;
        const M = (134.963 + 13.064993 * d) % 360;
        const F = (93.272 + 13.229350 * d) % 360;
        
        const l = L + 6.289 * Math.sin(M * this.deg2rad);
        const b = 5.128 * Math.sin(F * this.deg2rad);
        const dt = 385000 - 20905 * Math.cos(M * this.deg2rad); // Distance approx en km

        // Conversion simple (Approximation pour l'affichage dashboard)
        // Pour une précision "NASA", il faudrait 500 lignes de plus
        const alpha = l * this.deg2rad; // Approx RA
        const delta = b * this.deg2rad; // Approx Dec
        
        const coords = this.radecToAltAz(alpha, delta, date, lat, lon);
        
        // Phase calculation
        const daysSinceNew = (d - 6.0) % 29.53;
        const phasePct = (1 - Math.cos((daysSinceNew / 29.53) * 2 * Math.PI)) / 2;
        let phaseName = "Nouvelle Lune";
        if (phasePct > 0.1) phaseName = "Croissant";
        if (phasePct > 0.45) phaseName = "Pleine Lune";
        if (phasePct > 0.9) phaseName = "Dernier Quartier";

        return {
            altitude: coords.altitude,
            azimuth: coords.azimuth,
            distance: dt,
            phaseName: phaseName,
            illuminated: phasePct
        };
    },

    /**
     * Conversion RA/Dec vers Alt/Az
     */
    radecToAltAz(ra, dec, date, lat, lon) {
        const jd = this.toJulian(date);
        const d = jd - 2451545.0;
        
        // Temps Sidéral
        let GMST = 280.46061837 + 360.98564736629 * d;
        let LST = (GMST + lon) % 360;
        
        const H = (LST * this.deg2rad) - ra;
        const phi = lat * this.deg2rad;
        
        const sinAlt = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H);
        const alt = Math.asin(sinAlt);
        
        const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(phi)) / (Math.cos(alt) * Math.cos(phi));
        let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
        if (Math.sin(H) > 0) az = 2 * Math.PI - az;
        
        return {
            altitude: alt * this.rad2deg,
            azimuth: az * this.rad2deg
        };
    }
};
