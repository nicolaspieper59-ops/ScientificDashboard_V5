/**
 * GNSS SpaceTime Dashboard - RECTIFICATION "COLD START"
 * Force la vitesse à 0 au démarrage et élimine les vitesses fantômes.
 */

((window) => {
    "use strict";
    const $ = id => document.getElementById(id);

    const state = {
        running: false,
        v: 0,              // FORCÉ À 0 AU DÉMARRAGE
        dist: 0,           // FORCÉ À 0
        vMax: 0,
        lastT: Date.now() / 1000,
        biasY: 0.1549      // On neutralise le biais de 0.1549 mesuré sur votre dashboard
    };

    // --- FONCTION DE RÉINITIALISATION TOTALE ---
    const resetToZero = () => {
        state.v = 0;
        state.dist = 0;
        state.vMax = 0;
        if($('speed-main-display')) $('speed-main-display').textContent = "0.00 km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = "0.0000 m/s";
        if($('total-distance')) $('total-distance').textContent = "0.000 m";
        console.log("✅ Système réinitialisé : Vitesse = 0");
    };

    function physicsLoop() {
        if (!state.running) return;

        const now = Date.now() / 1000;
        const dt = Math.min(now - state.lastT, 0.1);
        state.lastT = now;

        // Récupération accélération brute Y
        const ay = parseFloat($('accel-y')?.textContent) || 0;
        
        // CORRECTION : On retire le biais et on ignore les bruits < 0.02
        let realA = ay - state.biasY;
        if (Math.abs(realA) < 0.02) realA = 0; 

        // Intégration Newtonienne
        state.v += realA * dt;
        if (state.v < 0.01) state.v = 0; // Seuil d'arrêt forcé

        // Mise à jour interface
        const vKmh = state.v * 3.6;
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(2) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(4) + " m/s";
        
        // Remplissage des N/A par des calculs théoriques (Aérodynamique)
        const density = 1.225; // kg/m3
        if($('dynamic-pressure')) $('dynamic-pressure').textContent = (0.5 * density * state.v**2).toFixed(1) + " Pa";

        requestAnimationFrame(physicsLoop);
    }

    // Assignation des boutons
    $('gps-pause-toggle').onclick = () => {
        if (!state.running) resetToZero(); // On remet à zéro AVANT de démarrer
        state.running = !state.running;
        state.lastT = Date.now() / 1000;
        physicsLoop();
    };

    $('reset-all-btn').onclick = resetToZero;

    // Initialisation au chargement
    window.onload = resetToZero;

})(window);
