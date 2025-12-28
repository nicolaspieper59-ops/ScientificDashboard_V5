/**
 * Astro Engine VSOP2013 - Édition Minecraft
 */
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function calculateAstroData(date, lat, lon) {
    if (!date) date = new Date();
    const jd = (date.getTime() / 86400000) + 2440587.5;
    
    let sunPos = { ra: 0, dec: 0, dist: 1.0 };
    if (typeof vsop2013 !== 'undefined') {
        const terre = vsop2013.getPlanets(jd, "earth"); 
        sunPos.ra = (terre.ra + 180) % 360;
        sunPos.dec = -terre.dec;
        sunPos.dist = terre.r;
    }

    const T = (jd - 2451545.0) / 36525;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T*T;
    let lmst = (gmst + lon) % 360;
    
    const phi = lat * D2R;
    const delta = sunPos.dec * D2R;
    const ha = (lmst - sunPos.ra) * D2R;

    const alt = Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha), Math.cos(phi) * Math.tan(delta) - Math.sin(phi) * Math.cos(ha));
    
    // Temps Solaire Vrai (TST)
    const hoursUTC = date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600;
    const tst = (hoursUTC + lon/15 + 24) % 24;

    // Heure Minecraft (0-24000)
    const mcTime = Math.floor(((tst + 18) % 24) * 1000);

    return {
        sun: { altitude: alt * R2D, azimuth: (az * R2D + 180) % 360, distance: sunPos.dist },
        jd: jd, tst: tst, mcTime: mcTime
    };
}
window.calculateAstroData = calculateAstroData;
