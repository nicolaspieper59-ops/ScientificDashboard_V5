/**
 * AstroEngine Master Final
 * Gère les éphémérides, le temps Minecraft, et les indices BioSVT
 */
const AstroEngine = {
    calculate(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5; // Date Julienne
        const hrsUTC = now.getUTCHours() + (now.getUTCMinutes() / 60) + (now.getUTCSeconds() / 3600);

        // --- 1. GESTION DU TEMPS ---
        // Temps Minecraft (00000 à 23999) - Le cycle commence à l'aube (6h00)
        const mcTicks = Math.floor(((hrsUTC + 6) % 24) * 1000);
        
        // Temps Sidéral Local Vrai (TSLV) - Approximation pour navigation
        const tslv = (hrsUTC + (lon / 15)) % 24;

        // --- 2. CALCULS SOLAIRES ---
        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const declination = -23.44 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);
        const latR = lat * Math.PI / 180;
        const decR = declination * Math.PI / 180;
        const hourAngle = (hrsUTC - 12) * 15 * Math.PI / 180;
        
        // Altitude du Soleil (Élévation)
        const sunAltRad = Math.asin(Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(hourAngle));
        const sunAltDeg = sunAltRad * 180 / Math.PI;

        // --- 3. MISE À JOUR VISUELLE (HORLOGE MINECRAFT) ---
        const sunRotation = (mcTicks / 24000) * 360 - 90;
        const sunEl = document.getElementById('sun-element');
        const moonEl = document.getElementById('moon-element');
        if (sunEl) sunEl.style.transform = `rotate(${sunRotation}deg) translate(80px)`;
        if (moonEl) moonEl.style.transform = `rotate(${sunRotation + 180}deg) translate(80px)`;

        // --- 4. BIOSVT & MÉTÉO (INDICES) ---
        const temp = parseFloat(document.getElementById('air-temp-c')?.textContent) || 15;
        const press = parseFloat(document.getElementById('pressure-hpa')?.textContent) || 1013.25;
        
        // Saturation O2 théorique selon altitude/pression
        const o2Sat = (20.948 * Math.exp(-0.00012 * (1 - press/1013.25) * 8000)).toFixed(2);
        
        // Point de rosée simplifié (Magnus-Tetens)
        const rh = parseFloat(document.getElementById('humidity-perc')?.textContent) || 50;
        const dewPoint = (temp - (100 - rh) / 5);

        // --- 5. SATURATION DES IDS HTML ---
        const set = (id, val) => { 
            const el = document.getElementById(id); 
            if (el) el.textContent = val; 
        };

        // Colonne Système/Astro (IDs identifiés dans votre HTML)
        set('time-minecraft', mcTicks.toString().padStart(5, '0'));
        set('julian-date', jd.toFixed(5));
        set('date-julienne', jd.toFixed(4)); // Double ID détecté
        set('tslv', tslv.toFixed(4) + " h");
        set('tslv-1', tslv.toFixed(2) + " h");
        set('local-time', now.toLocaleTimeString());
        set('utc-datetime', now.toUTCString());
        set('gmt-time-display-1', now.toUTCString().split(' ')[4]);
        set('astro-phase', sunAltDeg > 0 ? "Jour (☀️)" : "Nuit (🌙)");
        set('sun-alt', sunAltDeg.toFixed(2) + "°");
        set('sun-azimuth', ((hrsUTC * 15 + 180) % 360).toFixed(1) + "°");

        // Colonne BioSVT/Météo
        set('O2-saturation', o2Sat + " %");
        set('dew-point', dewPoint.toFixed(1) + " °C");
        set('photosynthesis-rate', sunAltDeg > 5 ? "OPTIMAL" : (sunAltDeg > -6 ? "LIMITÉ" : "NUL"));
        set('status-thermal', temp > 35 ? "CRITIQUE" : (temp > 25 ? "ALERTE" : "STABLE"));
        
        // Lune (Modèle simplifié)
        const moonPhase = ((jd - 2451550.1) / 29.53059) % 1;
        set('moon-phase-name', moonPhase < 0.5 ? "Croissante" : "Décroissante");
        set('moon-illuminated', (Math.abs(0.5 - moonPhase) * 200).toFixed(0) + " %");
    }
};

window.AstroEngine = AstroEngine;
