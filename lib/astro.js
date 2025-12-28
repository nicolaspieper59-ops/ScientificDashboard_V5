const AstroEngine = {
    calculate(lat, lon) {
        const now = new Date();
        const hrs = now.getUTCHours() + now.getUTCMinutes() / 60;
        const jd = (now / 86400000) + 2440587.5;
        
        const mcTicks = Math.floor(((hrs + 18) % 24) * 1000);
        const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const dec = -23.44 * Math.cos((360 / 365) * (day + 10) * Math.PI / 180);
        const alt = Math.asin(Math.sin(lat*Math.PI/180)*Math.sin(dec*Math.PI/180) + 
                     Math.cos(lat*Math.PI/180)*Math.cos(dec*Math.PI/180)*Math.cos((hrs-12)*15*Math.PI/180));

        const data = {
            'time-minecraft': mcTicks.toString().padStart(5, '0'),
            'date-julienne': jd.toFixed(4),
            'sun-alt': (alt * 180 / Math.PI).toFixed(2) + "°",
            'local-time': now.toLocaleTimeString(),
            'gmt-time-display': now.toUTCString().split(' ')[4],
            'sun-azimuth': ((hrs * 15 + 180) % 360).toFixed(1) + "°"
        };
        for (let id in data) {
            document.querySelectorAll(`[id^="${id}"]`).forEach(el => el.textContent = data[id]);
        }
    }
};
window.AstroEngine = AstroEngine;
