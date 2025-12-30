const App = {
    ukf: new UKFPro(),
    isRunning: false,

    processFrame(e) {
        if (!this.isRunning) return;

        // 1. Récupération des angles du niveau à bulle (déjà présents dans le HTML)
        const pitch = parseFloat(document.getElementById('pitch').textContent);
        const roll = parseFloat(document.getElementById('roll').textContent);
        const dt = 1/60; // Basé sur la fréquence d'échantillonnage

        // 2. Calcul UKF Corrigé
        const motion = this.ukf.update(e.accelerationIncludingGravity, pitch, roll, dt);

        // 3. Mise à jour de la vitesse dans le HUD et la Navigation
        const vKmh = motion.vitesseMs * 3.6;
        
        document.getElementById('sp-main').textContent = vKmh.toFixed(4);
        document.getElementById('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        document.getElementById('speed-raw-ms').textContent = motion.vitesseMs.toFixed(2) + " m/s";

        // 4. Calcul de la G-Force Verticale (Corrigée)
        const gVert = (e.accelerationIncludingGravity.z / 9.80665).toFixed(2);
        document.getElementById('force-g-vert').textContent = gVert;
        document.getElementById('g-force').textContent = gVert;

        // 5. Mise à jour Astro
        const lat = parseFloat(document.getElementById('lat-ukf').textContent);
        const lon = parseFloat(document.getElementById('lon-ukf').textContent);
        AstroEngine.update(lat, lon);
    }
};
