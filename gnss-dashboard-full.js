(function() {
    let engine = null;
    let isRunning = false;

    function bridge() {
        if (!isRunning || !engine) return;

        const state = engine.getState();
        const mass = parseFloat(document.getElementById('mass-input')?.value) || 70;

        // On crée un objet qui contient TOUTES les réponses pour tes IDs
        const updates = {
            'speed-main-display': (state.v * 3.6).toFixed(2) + " km/h",
            'v-cosmic': (state.v * 3.6 + 1070000).toLocaleString() + " km/h",
            'lat-ukf': state.lat.toFixed(8),
            'lorentz-factor': (1 / Math.sqrt(1 - Math.pow(state.v/299792458, 2))).toFixed(12),
            'kinetic-energy': (0.5 * mass * state.v**2).toFixed(0) + " J"
            // Ajoute ici tous les autres IDs...
        };

        // On boucle sur tous les IDs existants dans le HTML
        Object.keys(updates).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = updates[id];
        });

        requestAnimationFrame(bridge);
    }

    document.getElementById('gps-pause-toggle').onclick = async () => {
        if (isRunning) { isRunning = false; return; }
        
        // Initialisation propre
        if (!window.ProfessionalUKF) return alert("Math.js ou UKF non chargé !");
        engine = new window.ProfessionalUKF();
        isRunning = true;
        
        // Démarrage des capteurs
        window.ondevicemotion = (e) => engine.predict(0.02, e.accelerationIncludingGravity, e.rotationRate);
        
        bridge();
    };
})();
