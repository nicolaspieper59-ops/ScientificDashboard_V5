const AstroEngine = {
    updateAll(lat, lon) {
        const now = new Date();
        const observer = { lat: lat, lon: lon, alt: 100 };
        const sun = ephem.getSun(now, observer);
        const lst = ephem.getLST(now, lon);

        // Utile pour savoir si on vole face au soleil
        document.getElementById('hud-sun-alt').textContent = sun.alt.toFixed(2) + "°";
        document.getElementById('sun-azimuth').textContent = sun.az.toFixed(2) + "°";
        document.getElementById('tslv').textContent = lst;
        
        const jd = (now.getTime() / 86400000) + 2440587.5;
        document.getElementById('julian-date').textContent = jd.toFixed(5);
    }
};
