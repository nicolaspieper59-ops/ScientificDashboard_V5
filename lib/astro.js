const AstroBridge = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

        // Inclinaison saisonnière (Ecliptique)
        const sunDecli = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
        const mcTicks = Math.floor((((now.getHours() + now.getMinutes()/60 + 6) % 24) / 24) * 24000);
        
        this.drawClock(mcTicks, sunDecli);
        
        document.getElementById('julian-date').textContent = jd.toFixed(5);
        document.getElementById('time-minecraft').textContent = mcTicks.toString().padStart(5, '0');
    },

    drawClock(ticks, decli) {
        const canvas = document.getElementById('mc-clock-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const sunAngle = (ticks / 24000) * Math.PI * 2;
        
        ctx.clearRect(0, 0, 120, 120);
        
        // Disque céleste (Bleu si soleil > horizon, Noir sinon)
        ctx.fillStyle = Math.sin(sunAngle) < 0 ? "#1e3799" : "#050505";
        ctx.beginPath(); ctx.arc(60, 60, 50, 0, Math.PI*2); ctx.fill();
        
        // Horizon
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath(); ctx.moveTo(10, 60); ctx.lineTo(110, 60); ctx.stroke();

        // Soleil avec décalage saisonnier
        ctx.save();
        ctx.translate(60, 60);
        ctx.rotate(sunAngle);
        ctx.fillStyle = "#ffcc00";
        ctx.fillRect(-6, -40 + (decli), 12, 12);
        ctx.restore();
    }
};
