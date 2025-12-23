(function() {
    let engine = null;
    let lastT = performance.now();

    const init = () => {
        // Sécurité : Attendre que math.js et ProfessionalUKF soient là
        if (typeof math === 'undefined' || typeof window.ProfessionalUKF === 'undefined') {
            console.log("🔄 Attente des librairies...");
            setTimeout(init, 200);
            return;
        }

        engine = new window.ProfessionalUKF();
        document.getElementById('gps-status').textContent = "SYSTÈME PRÊT";
        
        // Démarrage des capteurs
        startTracking();
        requestAnimationFrame(updateUI);
    };

    function startTracking() {
        navigator.geolocation.watchPosition(
            p => engine.update({lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude || 0}),
            e => engine.isCaveMode = true,
            { enableHighAccuracy: true }
        );

        window.addEventListener('devicemotion', e => {
            const now = performance.now();
            const dt = (now - lastT) / 1000;
            lastT = now;
            engine.predict(dt, e.accelerationIncludingGravity, e.rotationRate);
        });
    }

    function updateUI() {
        if (engine) {
            const s = engine.getState();
            const v_kmh = s.v * 3.6;

            // Mise à jour des éléments HTML
            document.getElementById('lat-ukf').textContent = s.lat.toFixed(8);
            document.getElementById('speed-main-display').textContent = v_kmh.toFixed(2) + " km/h";
            
            // Vérité Cosmique (Addition des vitesses de rotation terrestre)
            const v_cosmic = v_kmh + (1670 * Math.cos(s.lat * Math.PI/180)) + 107000;
            document.getElementById('v-cosmic').textContent = v_cosmic.toLocaleString() + " km/h";
            
            // Détection du mode (Oiseau vs Escargot)
            if (v_kmh < 0.01) {
                document.getElementById('status-physique').textContent = "MODE GASTROPODE (Micro-dérive)";
            } else if (v_kmh > 50) {
                document.getElementById('status-physique').textContent = "MODE HAUTE DYNAMIQUE (Oiseau/Manège)";
            }
        }
        requestAnimationFrame(updateUI);
    }

    window.onload = init;
})();
