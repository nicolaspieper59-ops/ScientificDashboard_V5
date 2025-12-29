class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0; // Vitesse GPS brute
        this.vFiltered = 0; // Vitesse corrigée UKF
        this.mass = 70;
        this.c = 299792458;
        this.gRef = 9.80665;
        this.lastTs = Date.now();
    }

    processMotion(event) {
        if (!this.isRunning) return;
        const now = Date.now();
        const dt = (now - this.lastTs) / 1000;
        this.lastTs = now;

        const acc = event.accelerationIncludingGravity;
        if (!acc) return;

        // --- PRINCIPE DE NEWTON ---
        // On isole l'accélération propre en soustrayant la gravité
        const rawAcc = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
        const netAcc = rawAcc - this.gRef;

        // FUSION UKF SIMPLIFIÉE : On injecte l'inertie dans la vitesse GPS
        // Cela permet d'avoir une vitesse réactive même si le GPS est lent
        this.vFiltered = (this.vFiltered + netAcc * dt) * 0.90 + (this.vMs * 0.10);

        this.updatePhysicsUI(netAcc, acc.z);
    }

    updatePhysicsUI(accel, z) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        
        const speedKmH = this.vFiltered * 3.6;
        set('speed-main-display', speedKmH.toFixed(1));
        set('accel-long-filtered', accel.toFixed(4));
        set('force-g-vertical', (Math.abs(z)/9.806).toFixed(3) + " G");
        set('dynamic-master-mode', accel > 0.2 ? "ACCÉLÉRATION" : (accel < -0.2 ? "DÉCÉLÉRATION" : "STABLE"));

        // RELATIVITÉ (Notation scientifique pour les basses vitesses)
        const beta = this.vFiltered / this.c;
        const lorentz = 1 / Math.sqrt(1 - beta**2);
        const elL = document.getElementById('lorentz-factor');
        if (this.vFiltered > 0.01) {
            elL.innerHTML = `1 + ${(lorentz - 1).toExponential(3)}`;
        } else {
            set('lorentz-factor', "1.00000000");
        }
        
        // Énergie E=mc² (via constante officielle)
        const energy = lorentz * this.mass * Math.pow(this.c, 2);
        set('relativistic-energy', energy.toExponential(2) + " J");
        
        // Schwarzschild
        const Rs = (2 * 6.6743e-11 * this.mass) / Math.pow(this.c, 2);
        set('schwarzschild-radius', Rs.toExponential(2) + " m");
    }
}
window.ProfessionalUKF = ProfessionalUKF;
