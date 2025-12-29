const ukf = new ProfessionalUKF();

document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
    // Déblocage obligatoire pour Chrome/iOS
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') return;
    }

    ukf.isRunning = !ukf.isRunning;
    const btn = document.getElementById('gps-pause-toggle');
    btn.textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
    btn.style.background = ukf.isRunning ? "#ff4c4c" : "#00d166";
});

window.addEventListener('devicemotion', (e) => {
    if (ukf.isRunning) {
        ukf.update(e.accelerationIncludingGravity, e.rotationRate);
        
        // Mise à jour du Niveau à bulle
        const pitch = Math.atan2(-e.accelerationIncludingGravity.x, 10) * 180 / Math.PI;
        const roll = Math.atan2(e.accelerationIncludingGravity.y, e.accelerationIncludingGravity.z) * 180 / Math.PI;
        document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = roll.toFixed(1) + "°";
    }
});
