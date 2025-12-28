const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function calculateAstroData(date, lat, lon) {
    if (!lat || !lon) return null;
    const jd = (date.getTime() / 86400000) + 2440587.5;
    
    // 1. Calcul VSOP2013
    let sunPos = { ra: 0, dec: 0 };
    if (typeof vsop2013 !== 'undefined') {
        const terre = vsop2013.getPlanets(jd, "earth"); 
        sunPos.ra = (terre.ra + 180) % 360;
        sunPos.dec = -terre.dec;
    }

    // 2. Temps Sidéral et Solaire
    const T = (jd - 2451545.0) / 36525;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
    let lmst = (gmst + lon) % 360;

    const phi = lat * D2R;
    const delta = sunPos.dec * D2R;
    const ha = (lmst - sunPos.ra) * D2R;

    // 3. Altitude/Azimut
    const alt = Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha), Math.cos(phi) * Math.tan(delta) - Math.sin(phi) * Math.cos(ha));
    
    // 4. Heure Solaire et Minecraft
    const tst = (date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600 + lon/15 + 24) % 24;
    const mcTime = Math.floor(((tst + 18) % 24) * 1000); 

    return {
        sun: { altitude: alt * R2D, azimuth: (az * R2D + 180) % 360 },
        tst: tst,
        mcTime: mcTime,
        jd: jd
    };
}
window.calculateAstroData = calculateAstroData;
