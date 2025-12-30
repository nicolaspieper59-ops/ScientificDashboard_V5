/**
 * ASTRO-ENGINE PRO avec ephem.js
 */
const AstroEngine = {
    update(lat, lon) {
        const date = new Date();
        
        // Configuration de l'observateur pour ephem.js
        const observer = { lat: lat, lon: lon, alt: 100 };
        
        // Calcul du Soleil via ephem.js
        const sunData = ephem.getSun(date, observer);
        const moonData = ephem.getMoon(date, observer);

        // Mise à jour du HTML avec les IDs spécifiques
        document.getElementById('hud-sun-alt').textContent = sunData.alt.toFixed(2) + "°";
        document.getElementById('sun-azimuth').textContent = sunData.az.toFixed(2) + "°";
        
        // Calcul de la phase lunaire
        const phase = moonData.phase; // 0 à 1
        let phaseNom = "Nouvelle Lune";
        if (phase > 0.45 && phase < 0.55) phaseNom = "Pleine Lune";
        else if (phase > 0.2 && phase < 0.3) phaseNom = "Premier Quartier";
        
        document.getElementById('moon-phase-name').textContent = phaseNom;
        document.getElementById('moon-illuminated').textContent = (phase * 100).toFixed(1) + "%";
        
        // Temps Sidéral Local Vrai
        const lst = ephem.getLST(date, lon);
        document.getElementById('tslv').textContent = lst;
        document.getElementById('tslv-1').textContent = lst;
    }
};
