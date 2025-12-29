/**
 * ASTRO.JS - Gestion Éphémérides & BioSVT
 */
const AstroBridge = {
    update(lat, lon, pressure) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        const now = new Date();

        // 1. Éphémérides via Ephem.js
        const sun = Ephem.Sun.get(now, {lat, lon});
        const moon = Ephem.Moon.get(now, {lat, lon});

        set('sun-alt', sun.altitude.toFixed(2) + "°");
        set('sun-azimuth', sun.azimuth.toFixed(2) + "°");
        set('moon-phase-name', moon.phaseName);
        set('moon-alt', moon.altitude.toFixed(2) + "°");
        set('julian-date', ((now / 86400000) + 2440587.5).toFixed(5));

        // 2. Temps Sidéral & Solaire
        const tslv = Ephem.LocalSiderealTime(now, lon);
        set('tslv', tslv);
        set('tslv-1', tslv);

        // 3. Correction Barométrique (Altitude Géopotentielle)
        if (pressure) {
            const hGeo = 44330 * (1 - Math.pow(pressure / 1013.25, 0.1903));
            set('geopotential-alt', hGeo.toFixed(2) + " m");
            set('alt-corrected-baro', hGeo.toFixed(2) + " m");
        }

        // 4. Bio/SVT : Saturation O2 estimée selon altitude
        const alt = parseFloat(document.getElementById('geopotential-alt')?.textContent) || 0;
        const o2sat = 100 * Math.exp(-alt / 8000);
        set('O2-saturation', o2sat.toFixed(1) + " %");
    }
};
