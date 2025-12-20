/**
 * GNSS SPACETIME - MOTEUR NEWTONIEN V4.0
 * --------------------------------------
 * - Physique : Intégration de forces (F = ma)
 * - Décélération : Force de trainée aérodynamique + Friction cinétique
 * - Stabilité : Filtrage des bruits de capteur par seuil d'énergie
 */

class ScientificGNSS {
    constructor() {
        // --- ÉTATS VECTEURS ---
        this.vx = 0; // Vitesse actuelle (m/s)
        this.ax = 0; // Accélération nette (m/s²)
        this.totalDist = 0;
        this.vMax = 0;
        this.lastT = performance.now();
        this.isPaused = true;
        
        // --- CONSTANTES PHYSIQUES ---
        this.mass = 70;      // Masse en kg
        this.C_DRAG = 0.5;   // Coefficient de traînée (forme humaine/véhicule)
        this.AREA = 0.6;     // Surface frontale (m²)
        this.RHO = 1.225;    // Densité de l'air au niveau de la mer
        this.FRICTION_COEFF = 0.05; // Friction au sol
        
        // --- FILTRES ---
        this.biasX = 0;
        this.isCalibrated = false;
        this.accelThreshold = 0.15; // Seuil pour vaincre l'inertie statique

        this.init();
    }

    init() {
        this.setupUI();
        this.startLoops();
    }

    // --- MOTEUR DE FORCES NEWTONIENNES ---
    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const acc = e.acceleration; // Accélération linéaire sans gravité
        if (!acc) return;

        // 1. Calibration du "Zéro"
        if (!this.isCalibrated) {
            this.biasX = acc.x || 0;
            this.isCalibrated = true;
            return;
        }

        // 2. Force de Poussée (Input du capteur)
        let inputAccel = (acc.x || 0) - this.biasX;
        if (Math.abs(inputAccel) < this.accelThreshold) inputAccel = 0;
        
        let forcePush = this.mass * inputAccel;

        // 3. Forces de Résistance (Décélération inversée)
        // F_drag = 1/2 * rho * v² * Cd * A
        let forceDrag = 0.5 * this.RHO * Math.pow(this.vx, 2) * this.C_DRAG * this.AREA;
        
        // F_friction = m * g * Cr
        let forceFriction = this.vx !== 0 ? (this.mass * 9.81 * this.FRICTION_COEFF) : 0;

        // La force de résistance s'oppose TOUJOURS au signe de la vitesse
        let resistance = (forceDrag + forceFriction) * (this.vx > 0 ? 1 : -1);

        // 4. Seconde Loi de Newton : a = F_nette / m
        let netForce = forcePush - resistance;
        let netAccel = netForce / this.mass;

        // 5. Intégration de la vitesse
        this.vx += netAccel * dt;

        // Arrêt complet si la vitesse est infime (évite le flottement infini)
        if (Math.abs(this.vx) < 0.02 && inputAccel === 0) this.vx = 0;

        this.ax = netAccel;

        // Affichage IMU
        this.set('accel-long', this.ax.toFixed(3) + " m/s²");
        this.set('force-g-long', (this.ax / 9.81).toFixed(3));
    }

    runPhysicsLoop() {
        const v = Math.abs(this.vx);
        const kmh = v * 3.6;
        if (kmh > this.vMax) this.vMax = kmh;

        // Mise à jour de la vitesse et des énergies
        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('kinetic-energy', (0.5 * this.mass * v**2).toFixed(2) + " J");
        
        // Décélération affichée (Inversée par rapport à l'accélération)
        let decel = this.ax < 0 ? Math.abs(this.ax) : 0;
        this.set('deceleration-val', decel.toFixed(3) + " m/s²");

        // Distance
        if (v > 0.01) {
            this.totalDist += (v * 0.016);
        }
        this.set('total-distance', (this.totalDist/1000).toFixed(3) + " km");

        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    startLoops() {
        this.runPhysicsLoop();
        setInterval(() => {
            const now = new Date();
            this.set('local-time', now.toLocaleTimeString());
            // Intégration Astro pour remplir les N/A
            if (window.calculateAstroDataHighPrec) {
                const astro = window.calculateAstroDataHighPrec(now, 43.28, 5.35);
                this.set('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
                this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
            }
        }, 1000);
    }

    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        btn.onclick = async () => {
            if (this.isPaused) {
                if (typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                this.isPaused = false;
                this.isCalibrated = false;
                btn.textContent = "⏸ PAUSE SYSTÈME";
            } else {
                this.isPaused = true;
                btn.textContent = "▶️ MARCHE GPS";
            }
        };
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.onload = () => { new ScientificGNSS(); };
