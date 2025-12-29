/** * ASTRO MASTER ENGINE - Précision CODATA 2024 & Saisons
 */
const AstroBridge = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

        // 1. Calcul Solaire (Inclinaison de 23.44°)
        const sunDecli = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
        const mcTicks = Math.floor((((now.getHours() + now.getMinutes()/60 + 6) % 24) / 24) * 24000);
        const sunAngle = (mcTicks / 24000) * Math.PI * 2;

        // 2. Calcul Lunaire (Cycle synodique de 29.53j)
        const moonAge = (jd - 2451550.1) % 29.530588;
        const phasePercent = moonAge / 29.53;
        const moonAngle = sunAngle - (phasePercent * Math.PI * 2);
        const moonDecli = 28.5 * Math.sin((moonAge / 29.53) * Math.PI * 2);

        this.drawRealisticClock(sunAngle, sunDecli, moonAngle, moonDecli, phasePercent);
        this.fillUI(jd, mcTicks, moonAge, phasePercent);
    },

    drawRealisticClock(sAngle, sDecli, mAngle, mDecli, phase) {
        const canvas = document.getElementById('mc-clock-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Ciel : Bleu jour / Noir nuit
        ctx.fillStyle = Math.sin(sAngle) < 0 ? "#1e3799" : "#050505";
        ctx.beginPath(); ctx.arc(w/2, h/2, w/2-5, 0, Math.PI*2); ctx.fill();

        // Ligne d'horizon (moitié du disque)
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath(); ctx.moveTo(10, h/2); ctx.lineTo(w-10, h/2); ctx.stroke();

        // Rendu Soleil
        this.drawAstre(ctx, sAngle, sDecli, "#f1c40f", 12, "sun");
        // Rendu Lune
        this.drawAstre(ctx, mAngle, mDecli, "#ecf0f1", 10, "moon", phase);
    },

    drawAstre(ctx, angle, decli, color, size, type, phase) {
        ctx.save();
        ctx.translate(60, 60);
        ctx.rotate(angle);
        const yOffset = (decli / 28) * 25; // Effet saisonnier
        ctx.fillStyle = color;
        if (type === "sun") {
            ctx.shadowBlur = 15; ctx.shadowColor = "yellow";
            ctx.fillRect(-size/2, -45 + yOffset, size, size);
        } else {
            ctx.beginPath(); ctx.arc(0, -42 + yOffset, size/2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "rgba(0,0,0,0.6)"; // Ombre de phase
            const sX = Math.cos(phase * Math.PI * 2) * 5;
            ctx.beginPath(); ctx.arc(sX, -42 + yOffset, size/2, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    },

    fillUI(jd, ticks, age, phase) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        set('julian-date', jd.toFixed(6));
        set('time-minecraft', ticks.toString().padStart(5, '0'));
        set('moon-illuminated', (Math.abs(50 - (phase * 100)) * 2).toFixed(1) + "%");
        set('moon-phase-name', age < 14.7 ? "Croissante" : "Décroissante");
    }
};
