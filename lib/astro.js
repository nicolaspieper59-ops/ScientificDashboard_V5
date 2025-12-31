/**
 * OMNISCIENCE V100 PRO - ASTRO ENGINE
 */
const AstroEngine = {
    update(date, lat, lon) {
        // Calculs via ephem.js
        const sun = Ephem.getSun(date, lat, lon);
        const moon = Ephem.getMoon(date, lat, lon);
        const lst = Ephem.getLST(date, lon);

        // Mise à jour de l'interface
        document.getElementById('hud-sun-alt').innerText = sun.altitude.toFixed(2) + "°";
        document.getElementById('tslv').innerText = lst;
        document.getElementById('moon-distance').innerText = Math.round(moon.distance) + " km";
        document.getElementById('moon-phase-name').innerText = moon.phaseName;

        // Rotation de l'horloge céleste
        const clockRotation = sun.altitude + 90;
        document.getElementById('minecraft-clock').style.transform = `rotate(${clockRotation}deg)`;
        
        // Phase du jour
        const phaseText = sun.altitude > 0 ? "Jour (☀️)" : "Nuit/Crépuscule (🌙)";
        document.getElementById('astro-phase').innerText = phaseText;
    }
};
