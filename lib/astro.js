/**
 * LIBRAIRIE ASTRO AVANCÉE - SUN & MOON TRACKER
 * Calcule : Soleil, Lune (Pos + Phase), Temps Solaire, Temps Sidéral
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function calculateAstroData(date, lat, lon) {
    if (!date) date = new Date();
    
    // 1. CONSTANTES DE TEMPS
    const time = date.getTime();
    const JD = (time / 86400000) + 2440587.5;
    const D = JD - 2451545.0;

    // 2. SOLEIL (Algorithme moyenne précision)
    const g = (357.529 + 0.98560028 * D) % 360;
    const L = (280.459 + 0.98564736 * D) % 360;
    const lambda = L + 1.915 * Math.sin(g * D2R) + 0.020 * Math.sin(2 * g * D2R);
    const epsilon = 23.439 - 0.00000036 * D;

    let alpha = Math.atan2(Math.cos(epsilon * D2R) * Math.sin(lambda * D2R), Math.cos(lambda * D2R)) * R2D;
    const delta = Math.asin(Math.sin(epsilon * D2R) * Math.sin(lambda * D2R)) * R2D;

    // 3. TEMPS SIDÉRAL & SOLAIRE
    const GMST = (280.46061837 + 360.98564736629 * D) % 360;
    let LMST = (GMST + lon) % 360; 
    if (LMST < 0) LMST += 360;

    // Équation du temps (EOT) en minutes
    const EOT = 4 * (lambda - alpha); 
    
    // Heure Solaire Vraie (TST)
    const utcHours = date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600;
    let tstHours = (utcHours + lon/15 + EOT/60);
    if (tstHours < 0) tstHours += 24;
    if (tstHours >= 24) tstHours -= 24;

    // 4. POSITION LUNE (Approximation Faible Précision pour Dashboard)
    // Longitude (l), Anomalie (m), Argument (f)
    const L_moon = (218.316 + 13.176396 * D) % 360;
    const M_moon = (134.963 + 13.064993 * D) % 360;
    const F_moon = (93.272 + 13.229350 * D) % 360;
    
    const lambda_moon = L_moon + 6.289 * Math.sin(M_moon * D2R);
    const beta_moon = 5.128 * Math.sin(F_moon * D2R);
    
    // Conv EQ
    const cb = Math.cos(beta_moon * D2R);
    const sb = Math.sin(beta_moon * D2R);
    const cl = Math.cos(lambda_moon * D2R);
    const sl = Math.sin(lambda_moon * D2R);
    const ce = Math.cos(epsilon * D2R);
    const se = Math.sin(epsilon * D2R);
    
    // RA / Dec Lune
    const alpha_moon = Math.atan2(sl * ce - (sb/cb) * se, cl) * R2D;
    const delta_moon = Math.asin(sb * ce + cb * se * sl) * R2D;

    // 5. CONVERSION HORIZONTALE (Soleil & Lune)
    function getHorizontal(ra, dec) {
        const H = (LMST - ra); // Angle Horaire
        const latRad = lat * D2R;
        const decRad = dec * D2R;
        const HRad = H * D2R;

        const sinAlt = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(HRad);
        const alt = Math.asin(sinAlt) * R2D;

        const cosAz = (Math.sin(decRad) - Math.sin(latRad) * Math.sin(alt*D2R)) / (Math.cos(latRad) * Math.cos(alt*D2R));
        let az = Math.acos(Math.min(1, Math.max(-1, cosAz))) * R2D;
        if (Math.sin(HRad) > 0) az = 360 - az;
        
        return { alt: alt, az: az };
    }

    const sunPos = getHorizontal(alpha, delta);
    const moonPos = getHorizontal(alpha_moon, delta_moon);

    // Phase Lune
    const lunarAge = (D - 6.3) % 29.53058867;
    const phaseRatio = (lunarAge < 0 ? lunarAge + 29.53 : lunarAge) / 29.53;

    return {
        sun: { altitude: sunPos.alt, azimuth: sunPos.az },
        moon: { 
            altitude: moonPos.alt, 
            azimuth: moonPos.az,
            illumination: { phase: phaseRatio } 
        },
        tst: tstHours,   // Heure solaire vraie
        mst: (utcHours + lon/15 + 24) % 24, // Heure solaire moyenne
        eot: EOT,
        lmst: LMST,      // Temps sidéral (degrés -> heures = /15)
        solar_noon: (12 - lon/15 - EOT/60 + 24) % 24 // Midi solaire en UTC
    };
}

// FORMATAGE HEURES (HH:MM:SS)
function formatHours(hDec) {
    if (isNaN(hDec)) return "N/A";
    const h = Math.floor(hDec);
    const m = Math.floor((hDec - h) * 60);
    const s = Math.floor(((hDec - h) * 60 - m) * 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// FORMATAGE PHASE
function getMoonPhaseName(p) {
    if (p < 0.03 || p > 0.97) return "Nouvelle Lune";
    if (p < 0.25) return "Premier Croissant";
    if (p < 0.28) return "Premier Quartier";
    if (p < 0.47) return "Lune Gibbeuse";
    if (p < 0.53) return "Pleine Lune";
    if (p < 0.72) return "Lune Gibbeuse";
    if (p < 0.78) return "Dernier Quartier";
    return "Dernier Croissant";
}
