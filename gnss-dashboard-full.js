const ukf = new ProfessionalUKF();

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('gps-pause-toggle');
    if (!btn) return;

    // FONCTION DE DÉMARRAGE SÉCURISÉE
    btn.addEventListener('click', async () => {
        try {
            // Déblocage iOS/Android des capteurs de mouvement
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') {
                    alert("Permission refusée. Le dashboard restera figé.");
                    return;
                }
            }

            // Inversion de l'état
            ukf.isRunning = !ukf.isRunning;
            
            // Mise à jour visuelle du bouton
            btn.textContent = ukf.isRunning ? "🛑 PAUSE" : "▶️ MARCHE GPS";
            btn.style.background = ukf.isRunning ? "#ff4444" : "#00ff66";
            document.getElementById('statut-ekf').textContent = ukf.isRunning ? "ACTIF (FUSION)" : "VEILLE";
            
            if (ukf.isRunning) ukf.lastTime = performance.now();

        } catch (e) {
            console.error("Erreur d'activation :", e);
        }
    });

    // Écouteur de mouvement (Source UKF)
    window.addEventListener('devicemotion', (e) => {
        if (!e.accelerationIncludingGravity) return;
        ukf.accel.x = e.accelerationIncludingGravity.x || 0;
        ukf.accel.y = e.accelerationIncludingGravity.y || 0;
        ukf.accel.z = e.accelerationIncludingGravity.z || 9.80665;
        
        // Mise à jour immédiate des IDs bruts pour prouver que ça marche
        document.getElementById('acc-x').textContent = ukf.accel.x.toFixed(2);
        document.getElementById('acc-y').textContent = ukf.accel.y.toFixed(2);
    });

    // Boucle de rendu (60 FPS)
    function animate() {
        ukf.update();
        requestAnimationFrame(animate);
    }
    animate();
});
