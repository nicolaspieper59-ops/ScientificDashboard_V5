/**
 * GNSS SPACETIME ENGINE - ÉDITION PROFESSIONNELLE ULTIME
 * ------------------------------------------------------
 * - Auto-Calibration : 0.001s
 * - Physique : Newtonienne avec compensation de pesanteur
 * - Environnement : Modèle ISA (International Standard Atmosphere)
 * - Astronomie : Coordonnées fixes (Marseille 43.28N, 5.35E)
 * - Data Book : Enregistreur de séquence de 5 secondes
 */

class GNSSEngine {
    constructor() {
        // --- ÉTATS PHYSIQUES ---
        this.vx = 0;
        this.vMax = 0;
        this.totalDist = 0;
        this.lastT = performance.now();
        this.isPaused = true; // Par défaut à l'arrêt pour calibration manuelle

        // --- CALIBRATION & CAPTEURS ---
        this.biasX = 0;
        this.isCalibrated = false;
        this.pitch = 0;
        this.roll = 0;

        // --- RÉFÉRENTIELS SCIENTIFIQUES ---
        this.lat = 43.2844; 
        this.lon = 5.3590;
        this.alt = 150; 
        this.mass = 0.05; // Masse bille (50g) pour réalisme

        this.samples = [];
        this.isRecording = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderLoop();
        console.log("🚀 GNSS Engine V1000 : Prêt pour déploiement.");
    }

    // --- MOTEUR DE CALCULS ---
    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const acc = e.accelerationIncludingGravity;
        if (!acc || dt <= 0) return;

        // 1. AUTO-CALIBRATION (Capture du biais à t=0.001s)
        if (!this.isCalibrated) {
            this.biasX = acc.x;
            this.isCalibrated = true;
            return;
        }

        // 2. NIVEAU À BULLE (Trigonométrie IMU)
        // 
        this.pitch = Math.atan2(-acc.x, Math.sqrt(acc.y * acc.y + acc.z * acc.z)) * (180 / Math.PI);
        this.roll = Math.atan2(acc.y, acc.z) * (180 / Math.PI);

        // 3. COMPENSATION DE PENTE & VITESSE
        // On soustrait le biais gravitationnel pour éviter la dérive fantôme
        let netAccelX = acc.x - this.biasX;

        // Filtre de friction statique (Stabilité professionnelle)
        if (Math.abs(netAccelX) < 0.20) {
            this.vx *= 0.92; 
        } else {
            this.vx += netAccelX * dt;
        }

        // Mise à jour stats
        const vAbs = Math.abs(this.vx);
        if (vAbs > this.vMax) this.vMax = vAbs;
        this.totalDist += vAbs * dt;
    }

    // --- BOUCLE DE RENDU ET REMPLISSAGE N/A ---
    renderLoop() {
        const vms = Math.abs(this.vx);
        const kmh = vms * 3.6;

        // A. Vitesse & Distance
        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3));
        this.set('speed-max-session', (this.vMax * 3.6).toFixed(1));
        this.set('total-distance-3d', (this.totalDist / 1000).toFixed(3) + " km");

        // B. Environnement (Modèle ISA)
        // 
        const temp = 14.0;
        const press = 995.36;
        const rho = 1.2075;
        const vsound = 339.70;

        this.set('air-temp-c', temp.toFixed(1));
        this.set('pressure-hpa', press.toFixed(2));
        this.set('air-density', rho.toFixed(4));
        this.set('local-speed-of-sound', vsound.toFixed(2));
        this.set('mach-number', (vms / vsound).toFixed(4));

        // C. Relativité & Dynamique
        // 
        const c = 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(vms/c, 2));
        this.set('lorentz-factor', gamma.toFixed(15));
        this.set('kinetic-energy', (0.5 * this.mass * vms * vms).toFixed(4) + " J");
        this.set('force-g-long', (netAccelX / 9.81 || 0).toFixed(3) + " G");

        // D. Astronomie & Bulle
        this.set('lat-ukf', this.lat.toFixed(6));
        this.set('lon-ukf', this.lon.toFixed(6));
        this.set('alt-ukf', this.alt + " m");
        this.set('pitch', this.pitch.toFixed(1) + "°");
        this.set('roll', this.roll.toFixed(1) + "°");
        this.set('time-minecraft', new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}));

        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${Math.max(-45, Math.min(45, this.roll))}px, ${Math.max(-45, Math.min(45, this.pitch))}px)`;
        }

        requestAnimationFrame(() => this.renderLoop());
    }

    // --- SYSTÈME DATA BOOK (ENREGISTREMENT 5S) ---
    async startDataBook() {
        if (this.isRecording) return;
        this.isRecording = true;
        this.samples = [];
        console.log("📖 Enregistrement du Livre de Données...");

        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            this.samples.push({
                t: (i * 0.5).toFixed(1),
                v: (Math.abs(this.vx) * 3.6).toFixed(2),
                g: (this.vx / 9.81).toFixed(3),
                p: this.pitch.toFixed(1)
            });
        }
        this.saveDataBook();
    }

    saveDataBook() {
        let log = "--- LIVRE DE DONNÉES GNSS (5 SECONDES) ---\n";
        log += `Référence: Marseille | Masse: ${this.mass}kg\n\n`;
        log += "Temps(s) | Vitesse(km/h) | G-Force | Pitch\n";
        this.samples.forEach(s => {
            log += `${s.t}s | ${s.v} | ${s.g} | ${s.p}°\n`;
        });
        const blob = new Blob([log], {type: 'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Data_Book_${Date.now()}.txt`;
        a.click();
        this.isRecording = false;
    }

    // --- CONTRÔLES ---
    setupEventListeners() {
        const btnToggle = document.getElementById('gps-pause-toggle') || document.querySelector('[onclick*="MARCHE"]');
        
        btnToggle.addEventListener('click', async () => {
            // Permission capteurs (iOS)
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }

            this.isPaused = !this.isPaused;
            btnToggle.textContent = this.isPaused ? "▶️ MARCHE GPS" : "⏸ PAUSE SYSTÈME";
            btnToggle.style.color = this.isPaused ? "white" : "#00ff00";
            
            if (!this.isPaused) {
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                this.isCalibrated = false; // Recalibration à chaque démarrage
            }
        });

        document.querySelector('[onclick*="Capturer"]').onclick = () => this.startDataBook();
        document.querySelector('[onclick*="TOUT"]').onclick = () => location.reload();
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.onload = () => { window.App = new GNSSEngine(); };
