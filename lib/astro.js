const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function calculateAstroData(date, lat, lon, tempC, pressHpa, mode) {
    if (!lat || !lon) return null;
    const jd = (date.getTime() / 86400000) + 2440587.5;
    
    // Position Solaire VSOP2013 (Simplifiée)
    const T = (jd - 2451545.0) / 36525;
    const L0 = (280.466 + 36000.77 * T) % 360;
    const M = (357.529 + 35999.05 * T) % 360;
    const dec = 23.44 * Math.sin((L0 - 90) * D2R);
    
    const gmst = (280.46 + 360.985 * (jd - 2451545.0)) % 360;
    const ha = (gmst + lon - L0 + 360) % 360;

    let alt = Math.asin(Math.sin(lat*D2R)*Math.sin(dec*D2R) + Math.cos(lat*D2R)*Math.cos(dec*D2R)*Math.cos(ha*D2R));
    
    // Correction Réfraction : Air + Verre (Dôme)
    let refrac = (1.02 / Math.tan(alt + (10.3 / (alt * R2D + 5.11)) * D2R)) / 60;
    if (mode === "DOME") {
        const nVerre = 1.52; // Indice de réfraction du verre
        alt += (Math.asin(Math.sin(90*D2R - alt)/nVerre) / 60); 
    } else {
        alt += (refrac * D2R);
    }

    // Heure Minecraft (TST)
    const tst = (date.getUTCHours() + date.getUTCMinutes()/60 + lon/15 + 24) % 24;
    
    return {
        sunAlt: alt * R2D,
        sunAz: (Math.atan2(-Math.sin(ha*D2R), Math.cos(lat*D2R)*Math.tan(dec*D2R)-Math.sin(lat*D2R)*Math.cos(ha*D2R))*R2D+180)%360,
        mcTime: Math.floor(((tst + 18) % 24) * 1000),
        soundSpeed: 331.3 * Math.sqrt(1 + tempC / 273.15),
        jd: jd
    };
}
