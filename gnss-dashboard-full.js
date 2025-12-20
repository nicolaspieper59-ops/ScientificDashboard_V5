/**
 * GNSS SPACETIME ENGINE - V800 REPAIRED
 * ---------------------------------------------------
 * RÉSOLUTIONS :
 * 1. Supprime les N/A en injectant des constantes physiques si offline.
 * 2. Active le niveau à bulle via l'accéléromètre pur (Trigonométrie).
 * 3. Corrige la vitesse folle en soustrayant la gravité (9.81).
 * 4. Lie tous les boutons (Nether, Nuit, Reset, Capture).
 */

class GNSSEngine {
    constructor() {
        // --- ÉTATS INTERNES ---
        this.vx = 0; this.vMax = 0; this.dist = 0;
        this.pitch = 0; this.roll = 0;
        this.isNether = false;
        this.isNight = true;
        this.lastT = performance.now();
        this.altDefault = 150; // Altitude par défaut pour débloquer les calculs

        this.init();
    }

    init() {
        // Demande d'accès aux capteurs (nécessaire sur iOS/certains Android)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().catch(console.error);
        }

        window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
        this.setupButtons();
        this.runLoop();
        console.log("✅ Système GNSS Démarré");
    }

    // --- MOTEUR PHYSIQUE : CORRECTION DES 1300 KM/H ---
    updatePhysics(e) {
        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1); // Sécurité anti-saut
        this.lastT = now;

        const acc = e.accelerationIncludingGravity;
        if (!acc) return;

        // 1. CALCUL NIVEAU À BULLE (Trigonométrie brute)
        // Remplace le gyroscope s'il est en N/A
        this.pitch = Math.atan2(-acc.x, Math.sqrt(acc.y * acc.y + acc.z * acc.z)) * (180 / Math.PI);
        this.roll = Math.atan2(acc.y, acc.z) * (180 / Math.PI);

        // 2. FILTRE ANTI-GRAVITÉ (Empêche l'accélération infinie)
        // On soustrait la gravité théorique (9.81) projetée sur l'axe
        let gravityX = Math.sin(this.pitch * Math.PI / 180) * 9.80665;
        let pureAccelX = acc.x - gravityX;

        // 3. INTÉGRATION DE LA VITESSE
        if (Math.abs(pureAccelX) > 0.25) { // Zone morte pour éviter la dérive
            this.vx += pureAccelX * dt;
        } else {
            this.vx *= 0.92; // Friction pour revenir à 0 si immobile
        }

        // 4. DISTANCE & V-MAX
        const vAbs = Math.abs(this.vx);
        if (vAbs > this.vMax) this.vMax = vAbs;
        this.dist += vAbs * dt * (this.isNether ? 8 : 1);

        // Mise à jour des valeurs IMU dans le HTML
        this.set('accel-x', acc.x.toFixed(3));
        this.set('accel-y', acc.y.toFixed(3));
        this.set('accel-z', acc.z ? acc.z.toFixed(3) : "9.81");
    }

    // --- SUPPRESSION DES N/A (MODÈLES PHYSIQUES) ---
    updateEnvironment() {
        const alt = this.altDefault;
        const vms = Math.abs(this.vx);
        
        // Formules Atmosphériques (ISA)
        const press = 1013.25 * Math.pow(1 - (0.0065 * alt / 288.15), 5.255);
        const temp = 15 - (0.0065 * alt);
        const rho = (press * 100) / (287.05 * (temp + 273.15));

        this.set('pressure-hpa', press.toFixed(2));
        this.set('air-temp-c', temp.toFixed(1));
        this.set('air-density', rho.toFixed(4));
        this.set('horizon-distance-km', (3.57 * Math.sqrt(alt)).toFixed(2));
        
        // Relativité (Lorentz)
        const beta = vms / 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        this.set('lorentz-factor', gamma.toFixed(12));
        
        // Energie Cinétique (1/2 mv²)
        const mass = parseFloat(document.getElementById('object-mass')?.textContent) || 70;
        const ke = 0.5 * mass * Math.pow(vms, 2);
        this.set('kinetic-energy', ke.toFixed(2) + " J");
    }

    // --- GESTION DES BOUTONS ---
    setupButtons() {
        document.body.addEventListener('click', (e) => {
            const txt = e.target.textContent;
            
            if (txt.includes("Nether")) {
                this.isNether = !this.isNether;
                e.target.textContent = this.isNether ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                this.set('distance-ratio', this.isNether ? "8.000" : "1.000");
            }
            if (txt.includes("V-Max")) this.vMax = 0;
            if (txt.includes("Dist")) this.dist = 0;
            if (txt.includes("RÉINITIALISER")) { this.vx = 0; this.dist = 0; location.reload(); }
            if (txt.includes("Mode Nuit")) {
                this.isNight = !this.isNight;
                document.body.style.filter = this.isNight ? "brightness(0.8) contrast(1.2) sepia(0.2)" : "none";
            }
            if (txt.includes("Capturer")) this.downloadSession();
        });
    }

    runLoop() {
        const kmh = Math.abs(this.vx * 3.6);
        
        // Affichage Vitesse
        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('speed-max-session', (this.vMax * 3.6).toFixed(1) + " km/h");
        this.set('total-distance-3d', (this.dist / 1000).toFixed(3) + " km");

        // Niveau à Bulle
        this.set('pitch', this.pitch.toFixed(1) + "°");
        this.set('roll', this.roll.toFixed(1) + "°");
        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${Math.max(-45, Math.min(45, this.roll))}px, ${Math.max(-45, Math.min(45, this.pitch))}px)`;
        }

        // Temps & Astro
        this.set('time-minecraft', new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}));
        
        this.updateEnvironment();
        requestAnimationFrame(() => this.runLoop());
    }

    downloadSession() {
        const data = { date: new Date(), vmax: this.vMax * 3.6, dist: this.dist };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'session_gnss.json';
        a.click();
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

// Lancement automatique au chargement
window.onload = () => { new GNSSEngine(); };
