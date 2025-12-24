/**
 * ORCHESTRATEUR DE FLUX - SUTURE DES 100+ IDs
 */
(function() {
    let engine = null;
    let isRunning = false;
    let lastT = performance.now();

    const init = () => {
        const btn = document.getElementById('gps-pause-toggle');
        if (!btn) return;

        btn.onclick = async () => {
            if (isRunning) {
                isRunning = false;
                btn.textContent = "▶️ MARCHE GPS";
                btn.style.background = "";
                return;
            }

            // Forcer la demande de capteurs
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                const res = await DeviceMotionEvent.requestPermission();
                if (res !== 'granted') return alert("Capteurs bloqués");
            }

            engine = new window.ProfessionalUKF();
            isRunning = true;
            btn.textContent = "⏸ PAUSE SYSTÈME";
            btn.style.background = "#dc3545";
            
            animate();
        };

        // Ecouteurs Capteurs
        window.addEventListener('devicemotion', (e) => {
            if (!isRunning || !engine) return;
            const a = e.accelerationIncludingGravity;
            engine.data.ax = a.x || 0;
            engine.data.ay = a.y || 0;
            engine.data.az = a.z || 0;
            
            // Calcul sommaire inclinaison pour la bulle
            const roll = Math.atan2(a.y, a.z) * 57.29;
            const pitch = Math.atan2(-a.x, 9.81) * 57.29;
            const bubble = document.getElementById('bubble');
            if(bubble) bubble.style.transform = `translate(${roll}px, ${pitch}px)`;
        });

        navigator.geolocation.watchPosition(p => {
            if (!isRunning || !engine) return;
            engine.data.lat = p.coords.latitude;
            engine.data.lon = p.coords.longitude;
            engine.data.v = p.coords.speed || 0;
        }, null, {enableHighAccuracy: true});
    };

    function animate() {
        if (!isRunning) return;

        // Récupération de la masse dans le HTML
        const massEl = document.getElementById('mass-input') || {value: 70};
        const results = engine.compute(parseFloat(massEl.value));

        // --- SUTURE AUTOMATIQUE ---
        // On parcourt tous les IDs calculés et on les injecte s'ils existent dans le HTML
        for (const [id, val] of Object.entries(results)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }

        requestAnimationFrame(animate);
    }

    window.onload = init;
})();
