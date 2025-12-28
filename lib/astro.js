/**
 * Astro Engine - Offline Celestial Calculations
 */
const AstroEngine = {
    calculate(lat, lon, date = new Date()) {
        const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
        
        // Minecraft Time (24000 ticks = 24h, commence à 6h du matin)
        let mcTime = Math.floor(((hours + 18) % 24) * 1000);
        
        // Approximation Altitude Solaire
        const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
        const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180));
        const hourAngle = (hours - 12) * 15;
        const latRad = lat * Math.PI / 180;
        const declRad = declination * Math.PI / 180;
        
        const sunAlt = Math.asin(Math.sin(latRad) * Math.sin(declRad) + 
                       Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngle * Math.PI / 180));

        return {
            mcTime: mcTime.toString().padStart(5, '0'),
            sunAlt: sunAlt * (180 / Math.PI),
            isDay: sunAlt > 0
        };
    }
};
window.AstroEngine = AstroEngine;
