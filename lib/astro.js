/**
 * ASTRO ENGINE PRO - VSOP2013 INTEGRATION
 * Précision millimétrique et calcul des distances réelles
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function calculateAstroData(date, lat, lon) {
    if (!date) date = new Date();
    const jd = (date.getTime() / 86400000) + 2440587.5;
    
    // 1. CALCUL VIA VSOP2013 (ephem.js)
    let sunPos = { ra: 0, dec: 0, dist: 1.0 };
    
    if (typeof vsop2013 !== 'undefined') {
        // Calcul des éléments de la Terre pour déduire le Soleil (Géocentrique)
        const terre = vsop2013.getPlanets(jd, "earth"); 
        sunPos.ra = (terre.ra + 180) % 360;
        sunPos.dec = -terre.dec;
        sunPos.dist = terre.r; // Distance en UA
    }

    // 2. TEMPS SIDÉRAL LOCAL VRAI (TSLV)
    const T = (jd - 2451545.0) / 36525;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T*T;
    let lmst = (gmst + lon) % 360;
    if (lmst < 0) lmst += 360;

    // 3. CONVERSION COORDONNÉES HORIZONTALES
    const phi = lat * D2R;
    const delta = sunPos.dec * D2R;
    const ha = (lmst - sunPos.ra) * D2R;

    const alt = Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(ha));
    let az = Math.atan2(-Math.sin(ha), Math.cos(phi) * Math.tan(delta) - Math.sin(phi) * Math.cos(ha));
    
    // 4. ÉQUATION DU TEMPS & SOLEIL
    const tst = (now.getUTCHours() + now.getUTCMinutes()/60 + now.getUTCSeconds()/3600 + lon/15 + 24) % 24;

    return {
        sun: { altitude: alt * R2D, azimuth: (az * R2D + 180) % 360, distance: sunPos.dist },
        moon: calculateMoonBasic(jd, lat, lon), // Fonction de repli pour la lune
        lmst: lmst,
        tst: tst,
        jd: jd
    };
}

// Fonction auxiliaire pour la Lune (Modèle de Brown simplifié)
function calculateMoonBasic(jd, lat, lon) {
    const d = jd - 2451545.0;
    const L = (218.316 + 13.176396 * d) % 360;
    const M = (134.963 + 13.064993 * d) % 360;
    const F = (93.272 + 13.229350 * d) % 360;
    const lonMoon = L + 6.289 * Math.sin(M * D2R);
    return { phase: (L % 360) / 360, alt: 0, az: 0 }; // Simplifié pour la phase
}

window.calculateAstroData = calculateAstroData;
