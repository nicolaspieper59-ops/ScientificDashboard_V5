const Navigation3D = {
    v: math.bignumber(0),
    lastT: performance.now(),

    init() {
        // Écouteur haute fréquence (100Hz)
        window.addEventListener('devicemotion', (event) => {
            const now = performance.now();
            const dt = math.divide(math.bignumber(now - this.lastT), 1000);
            this.lastT = now;

            if (math.smaller(dt, 0.001)) return;

            // Extraction accélération Y (axe de marche)
            const accY = math.bignumber(event.acceleration.y || 0);
            
            // FILTRE UKF SIMPLIFIÉ (ÉTAT 4 : VITESSE)
            // On intègre l'accélération : v = v + a*dt
            this.v = math.add(this.v, math.multiply(accY, dt));

            if (math.smaller(this.v, 0)) this.v = math.bignumber(0);

            this.updateUI(accY);
        });
    },

    updateUI(accY) {
        // Mapping direct avec ton HTML v25.15
        const v_ms = this.v;
        const v_kmh = math.multiply(v_ms, 3.6);

        // Mise à jour des champs critiques
        document.getElementById('speed-stable-ms').innerText = math.format(v_ms, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(v_kmh, {notation: 'fixed', precision: 4});
        document.getElementById('accel-y').innerText = math.format(accY, {precision: 3});
        
        // Calcul Relativité
        const c = math.bignumber(299792458);
        const beta = math.divide(v_ms, c);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
        document.getElementById('lorentz-factor').innerText = math.format(lorentz, {precision: 15});
    }
};
