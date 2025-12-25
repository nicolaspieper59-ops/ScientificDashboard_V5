/**
 * LIBRAIRIE ASTRO - MOTEUR DE CALCUL ÉPHÉMÉRIDES (VSOP SIMPLIFIÉ)
 * Nécessaire pour le Dashboard GNSS
 */

// Conversion degrés <-> radians
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function calculateAstroData(date, lat, lon) {
    if (!date) date = new Date();
    
    // 1. Calcul du Jour Julien (JD)
    const time = date.getTime();
    const JD = (time / 86400000) + 2440587.5;
    const D = JD - 2451545.0; // Jours depuis J2000.0

    // 2. Position du Soleil (Approximation moyenne précise)
    // Anomalie moyenne (g) et Longitude moyenne (L)
    const g = (357.529 + 0.98560028 * D) % 360;
    const L = (280.459 + 0.98564736 * D) % 360;
    
    // Longitude écliptique (lambda)
    const lambda = L + 1.915 * Math.sin(g * D2R) + 0.020 * Math.sin(2 * g * D2R);
    
    // Obliquité de l'écliptique (epsilon)
    const epsilon = 23.439 - 0.00000036 * D;
    
    // Ascension Droite (alpha) et Déclinaison (delta) du Soleil
    let alpha = Math.atan2(Math.cos(epsilon * D2R) * Math.sin(lambda * D2R), Math.cos(lambda * D2R)) * R2D;
    const delta = Math.asin(Math.sin(epsilon * D2R) * Math.sin(lambda * D2R)) * R2D;

    // 3. Temps Sidéral et Angle Horaire
    // Temps Sidéral de Greenwich (GMST)
    const GMST = (280.46061837 + 360.98564736629 * D) % 360;
    // Temps Sidéral Local (LMST)
    let LMST = (GMST + lon) % 360;
    if (LMST < 0) LMST += 360;
    
    // Angle Horaire (H)
    const H = (LMST - alpha); // en degrés

    // 4. Coordonnées Horizontales (Altitude / Azimut)
    const latRad = lat * D2R;
    const deltaRad = delta * D2R;
    const HRad = H * D2R;

    const sinAlt = Math.sin(latRad) * Math.sin(deltaRad) + Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(HRad);
    const altRad = Math.asin(sinAlt);
    const altDeg = altRad * R2D;

    const cosAz = (Math.sin(deltaRad) - Math.sin(latRad) * Math.sin(altRad)) / (Math.cos(latRad) * Math.cos(altRad));
    let azRad = Math.acos(Math.min(1, Math.max(-1, cosAz)));
    if (Math.sin(HRad) > 0) azRad = 2 * Math.PI - azRad;
    const azDeg = azRad * R2D;

    // 5. Calculs Temps Solaire Vrai (TST)
    // Equation du temps (EOT) en minutes approx
    const EOT = 4 * (lambda - alpha); // Très simplifié mais suffisant pour affichage dashboard
    
    // Heure décimale locale
    const utcHours = date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600;
    const tstHours = (utcHours + lon/15 + EOT/60 + 24) % 24;

    // 6. Lune (Simplifiée pour Phase)
    // Âge de la lune approximatif
    const lunarCycle = 29.53058867;
    const daysSinceNew = (D - 6.3) % lunarCycle; // 6.3 = calage approx J2000
    const phaseRatio = (daysSinceNew < 0 ? daysSinceNew + lunarCycle : daysSinceNew) / lunarCycle;

    return {
        sun: {
            altitude: altRad, // Retourne en radians pour compatibilité
            azimuth: azRad,   // Retourne en radians
            declination: delta
        },
        moon: {
            illumination: {
                phase: phaseRatio
            }
        },
        TST_HRS: tstHours,
        EOT_MIN: EOT,
        LMST_DEG: LMST
    };
}

// Utilitaires de formatage
function formatHours(decimalHours) {
    if (isNaN(decimalHours)) return "N/A";
    const h = Math.floor(decimalHours);
    const m = Math.floor((decimalHours - h) * 60);
    const s = Math.floor(((decimalHours - h) * 60 - m) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getMoonPhaseName(phase) {
    if (phase < 0.03 || phase > 0.97) return "Nouvelle Lune";
    if (phase < 0.22) return "Premier Croissant";
    if (phase < 0.28) return "Premier Quartier";
    if (phase < 0.47) return "Lune Gibbeuse";
    if (phase < 0.53) return "Pleine Lune";
    if (phase < 0.72) return "Lune Gibbeuse";
    if (phase < 0.78) return "Dernier Quartier";
    return "Dernier Croissant";
}

// Si on est dans un environnement navigateur, on attache à window
window.calculateAstroData = calculateAstroData;
window.formatHours = formatHours;
window.getMoonPhaseName = getMoonPhaseName;

console.log("⭐ Moteur Astro Chargé avec succès");
