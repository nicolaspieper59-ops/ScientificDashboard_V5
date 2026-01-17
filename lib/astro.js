/**
 * OMNISCIENCE V25.9 - ASTRO ENGINE PRO
 * Liaison : ephem.js -> astro.js -> index.html
 */

const AstroEngine = {
    // Variables de configuration
    config: {
        lat: 43.284559,
        lon: 5.345678,
        c: 299792458
    },

    update() {
        // 1. Vérification de la présence de ephem.js (Sécurité critique)
        if (typeof ephem === 'undefined') {
            this.setUI('ephem-status', 'EPHEM_MISSING');
            return;
        }

        try {
            const date = new Date();
            const { lat, lon, c } = this.config;

            // 2. Calculs via ephem.js
            const data = ephem.getAll(date, lat, lon); 

            // 3. Mise à jour des IDs Astro (Mapping V21)
            this.setUI('julian-date', ephem.toJulian(date).toFixed(5));
            this.setUI('ast-jd', ephem.toJulian(date).toFixed(5)); // ID de secours
            
            this.setUI('sun-alt', data.sun.alt.toFixed(2) + "°");
            this.setUI('sun-azimuth', data.sun.az.toFixed(2) + "°");
            
            this.setUI('moon-phase-name', data.moon.phaseName);
            this.setUI('moon-illuminated', (data.moon.illum * 100).toFixed(1) + "%");
            this.setUI('moon-distance', data.moon.dist.toFixed(0) + " km");
            this.setUI('moon-alt', data.moon.alt.toFixed(2) + "°");

            // 4. Calcul de Relativité (Lorentz)
            const speedEl = document.getElementById('speed-stable-ms');
            const v = speedEl ? parseFloat(speedEl.innerText) : 0;
            
            if (v >= 0) {
                const lorentz = 1 / Math.sqrt(1 - (v * v) / (c * c));
                this.setUI('lorentz-factor', lorentz.toFixed(15));
                this.setUI('ui-gamma', lorentz.toFixed(15)); // ID correspondant à ton V21
            }

            this.setUI('ephem-status', 'STABLE');

        } catch (error) {
            console.error("AstroEngine Error:", error);
            this.setUI('ephem-status', 'CALC_ERROR');
        }
    },

    // Fonction utilitaire pour éviter les erreurs si un ID manque dans le HTML
    setUI(id, val) {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = val;
        }
    },

    init() {
        console.log("AstroEngine: Initialisation...");
        // Lancement de la boucle (1Hz)
        setInterval(() => this.update(), 1000);
    }
};

// Lancement sécurisé une fois le DOM chargé
window.addEventListener('DOMContentLoaded', () => {
    AstroEngine.init();
});
