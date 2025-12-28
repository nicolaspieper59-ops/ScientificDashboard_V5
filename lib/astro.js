const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function calculateAstroData(date, lat, lon, tempC, pressureHpa) {
    if (!lat || !lon) return null;
    const jd = (date.getTime() / 86400000) + 2440587.5;
    
    // 1. Position VSOP2013
    let sunPos = { ra: 0, dec: 0 };
    if (typeof vsop2013 !== 'undefined') {
        const terre = vsop2013.getPlanets(jd, "earth"); 
        sunPos.ra = (terre.ra + 180) % 360;
        sunPos.dec = -terre.dec;
    }

    const lmst = (280.4606 + 360.9856 * (jd - 2451545.0) + lon) % 360;
    const ha = (lmst - sunPos.ra) * D2R;
    const phi = lat * D2R;
    const delta = sunPos.dec * D2R;

    let alt = Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(ha));
    
    // 2. CORRECTION RÉFRACTION (Réalisme Maximal)
    const pressCorr = (pressureHpa || 1013) / 1013.25;
    const tempCorr = 283 / (273.15 + (tempC || 15));
    const refrac = (1.02 / Math.tan(alt + (10.3 / (alt * R2D + 5.11)) * D2R)) * pressCorr * tempCorr / 60;
    alt += (refrac * D2R);

    // 3. Temps Solaire & Minecraft
    const tst = (date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600 + lon/15 + 24) % 24;
    const mcTime = Math.floor(((tst + 18) % 24) * 1000); 

    // 4. Vitesse du Son Corrigée (Température)
    const soundSpeed = 331.3 * Math.sqrt(1 + (tempC || 15) / 273.15);

    return {
        sun: { alt: alt * R2D, az: (Math.atan2(-Math.sin(ha), Math.cos(phi) * Math.tan(delta) - Math.sin(phi) * Math.cos(ha)) * R2D + 180) % 360 },
        mcTime: mcTime,
        soundSpeed: soundSpeed,
        tst: tst,
        jd: jd
    };
}
window.calculateAstroData = calculateAstroData;
