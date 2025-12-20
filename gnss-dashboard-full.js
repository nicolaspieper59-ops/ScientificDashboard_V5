/**
 * GNSS SPACETIME - RÉALISME NEWTONIEN (CORRECTION PERSISTANCE)
 * ----------------------------------------------------------
 * Logique : L'objet conserve sa vitesse (Inertie)
 */

class ScientificGNSS {
    constructor() {
        this.vx = 0; 
        this.ax = 0; 
        this.totalDist = 0;
        this.vMax = 0;
        this.lastT = performance.now();
        this.isPaused = true;
        
        // Paramètres
        this.mass = 70;
        this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
        this.C = 299792458;
        
        // --- FACTEUR DE RÉALISME ---
        this.frictionAir = 0.005; // Très faible résistance pour ne pas couper la vitesse
        this.thresholdInertie = 0.05; // Sensibilité aux secousses

        this.init();
    }

    init() {
        this.setupUI();
        this.startSyncLoop();
        this.runPhysicsLoop();
    }

    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const acc = e.acceleration; 
        if (!acc) return;

        // 1. Capture de l'accélération brute (Newton)
        // On utilise la magnitude pour être réaliste : peu importe le sens du mouvement
        let rawAx = acc.x || 0;

        // 2. Filtre de bruit (si trop faible, on ne change rien à la vitesse)
        if (Math.abs(rawAx) > this.thresholdInertie) {
            this.ax = rawAx;
            // Loi de Newton : v = v + a*dt
            this.vx += this.ax * dt;
        } else {
            this.ax = 0;
            // 3. DÉCÉLÉRATION RÉALISTE (Friction passive)
            // Au lieu de tomber à 0, la vitesse baisse très lentement
            this.vx *= (1 - this.frictionAir * dt);
        }

        // Sécurité pour l'arrêt total
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
    }

    runPhysicsLoop() {
        const v = Math.abs(this.vx);
        const kmh = v * 3.6;
        if (kmh > this.vMax) this.vMax = kmh;

        // Mise à jour de l'affichage (Persistance de la vitesse)
        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3));
        this.set('speed-max-session', this.vMax.toFixed(1) + " km/h");

        // Calculs Relativistes et Environnement (Inchangés pour rester fidèles)
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/this.C, 2));
        this.set('lorentz-factor', gamma.toFixed(15));
        
        // Distance cumulée
        if (v > 0.02) {
            this.totalDist += (v * 0.016);
        }
        this.set('total-distance', (this.totalDist/1000).toFixed(3) + " km");

        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    startSyncLoop() {
        setInterval(() => {
            const now = new Date();
            this.set('local-time', now.toLocaleTimeString());
            
            // Liaison Astro pour éviter les N/A
            if (typeof window.calculateAstroDataHighPrec === 'function') {
                const astro = window.calculateAstroDataHighPrec(now, this.coords.lat, this.coords.lon);
                this.set('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
                this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
            }
        }, 1000);
    }

    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        btn.onclick = async () => {
            if (this.isPaused) {
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                this.isPaused = false;
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
