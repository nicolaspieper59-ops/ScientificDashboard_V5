/**
 * ASTRO.JS - Moteur Temps & Espace
 */
const AstroBridge = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        
        // Calcul Minecraft (0 = 6h du matin)
        const mcTicks = Math.floor((((now.getHours() + now.getMinutes()/60 + 6) % 24) / 24) * 24000);
        
        document.getElementById('julian-date').textContent = jd.toFixed(5);
        document.getElementById('time-minecraft').textContent = mcTicks;

        // Mode Nuit Automatique (Soleil couché à 13000 ticks)
        const isNight = mcTicks > 13000 && mcTicks < 23000;
        document.body.classList.toggle('night-ui', isNight);
        document.getElementById('night-mode-status').textContent = isNight ? "Nuit (🌙)" : "Jour (☀️)";

        return { isNight, mcTicks };
    }
};
