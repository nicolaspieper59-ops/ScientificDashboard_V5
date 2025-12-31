/**
 * OMNISCIENCE V100 PRO - MAIN CONTROLLER
 * Orchestre UKF, Astro, et DOM Updates
 */

const MainController = {
    ntpOffset: 0,
    isActive: false,
    sessionStart: 0,
    coords: { lat: 43.2845, lon: 5.3456, alt: 100 }, // Valeurs par défaut (Marseille)

    init() {
        console.log("🚀 Initialisation GNSS SpaceTime Dashboard...");
        this.syncNTP();
        this.bindEvents();
        this.startLoops();
    },

    async syncNTP() {
        try {
            const start = Date.now();
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            const end = Date.now();
            // Offset = (ServerTime - LocalTime) + RTT/2
            const serverTime = new Date(data.datetime).getTime();
            this.ntpOffset = serverTime - end + ((end - start) / 2);
            
            // Mise à jour IDs NTP (Gestion des doublons)
            this.updateAllIds('ntp-offset', this.ntpOffset.toFixed(0) + " ms");
            this.updateAllIds('clock-accuracy-1', ((end-start)/2).toFixed(0) + " ms");
        } catch (e) {
            console.warn("NTP Error, fallback local time");
            this.updateAllIds('ntp-offset', "Local (Offline)");
        }
    },

    bindEvents() {
        // Bouton Master HUD
        const btn = document.getElementById('start-btn-final');
        if (btn) {
            btn.addEventListener('click', () => {
                this.isActive = !this.isActive;
                this.sessionStart = Date.now();
                btn.innerText = this.isActive ? "SYSTÈME ACTIF (STOP)" : "INITIALISER LE SYSTÈME FINAL";
                btn.style.background = this.isActive ? "#ff00ff" : "#00ff88";
                
                if (this.isActive && typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission();
                }
            });
        }
        
        // Inputs scientifiques
        document.getElementById('mass-input')?.addEventListener('change', (e) => {
            this.updateScientificCalcs(parseFloat(e.target.value));
        });
    },

    startLoops() {
        // 1. Boucle Haute Fréquence (IMU + Physique) - via EventListener
        window.addEventListener('devicemotion', (e) => {
            if (!this.isActive) return;
            
            // IMU Raw Data
            const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            const gyro = e.rotationRate || {x:0, y:0, z:0};
            
            // Update UKF
            UKF_PRO.update(acc, gyro);
            UKF_PRO.predict(0.016); // ~60Hz
            
            // Mise à jour DOM IMU
            this.setIf('acc-x', acc.x?.toFixed(2));
            this.setIf('acc-y', acc.y?.toFixed(2));
            this.setIf('acc-z', acc.z?.toFixed(2));
            
            // Récupération Physique Relativiste
            const physics = UKF_PRO.getRelativityData(this.coords.alt);
            
            // Mise à jour DOM Vitesse & Relativité
            const kmh = (physics.velocity * 3.6).toFixed(2);
            this.setIf('sp-main-hud', (physics.velocity * 3.6).toFixed(1));
            this.setIf('speed-main-display', kmh + " km/h");
            this.setIf('speed-stable-kmh', kmh + " km/h");
            this.setIf('speed-stable-ms', physics.velocity.toFixed(2) + " m/s");
            
            this.setIf('lorentz-factor', physics.lorentzFactor.toFixed(10));
            this.setIf('mach-number', physics.mach.toFixed(4));
            this.setIf('pct-speed-of-light', physics.percentC.toFixed(8) + " %");
            
            this.setIf('time-dilation-vitesse', physics.timeDilationVel.toFixed(4) + " ns/j");
            this.setIf('time-dilation-gravite', physics.timeDilationGrav.toFixed(4) + " ns/j");
            
            // Schwarzschild
            this.setIf('schwarzschild-radius', physics.schwarzschildRadius.toFixed(6) + " m");
            
            // Force G Verticale (Approx acc.z / 9.81)
            this.setIf('force-g-vert', (Math.abs(acc.z)/9.81).toFixed(2) + " G");
            
            // Jerk (Dérivée accélération - simulée ici par delta simple)
            // Nécessiterait de stocker l'accélération précédente
        });

        // 2. Boucle Basse Fréquence (1Hz) - Astro, Météo, Système
        setInterval(() => {
            const now = new Date(Date.now() + this.ntpOffset);
            
            // Astro
            AstroEngine.update(now, this.coords.lat, this.coords.lon);
            
            // UTC DateTime
            this.setIf('utc-datetime', now.toUTCString());
            
            // Session Time
            if (this.isActive) {
                const elapsed = (Date.now() - this.sessionStart) / 1000;
                this.setIf('elapsed-time', elapsed.toFixed(2) + " s");
            }
            
            // Constantes
            this.setIf('const-c', "299792458 m/s");
            this.setIf('const-G', "6.67430e-11");
            
            // Energie Relativiste (E=mc^2)
            const mass = parseFloat(document.getElementById('mass-input')?.value) || 70;
            const E = mass * Math.pow(299792458, 2);
            this.setIf('rest-mass-energy', E.toExponential(4) + " J");
            
            // Dynamique Fluides (Pression Dyn q = 0.5 * rho * v^2)
            const rho = 1.225; // kg/m3
            const v = parseFloat(document.getElementById('speed-stable-ms')?.innerText) || 0;
            const q = 0.5 * rho * v * v;
            this.setIf('dynamic-pressure', q.toFixed(2) + " Pa");
            
        }, 1000);
    },

    // Helpers
    setIf(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    },
    
    // Pour gérer les doublons d'IDs (ex: ntp-offset)
    updateAllIds(id, val) {
        // Tente de trouver par ID unique
        this.setIf(id, val);
        
        // Si besoin de cibler des doublons (nécessiterait des classes dans le HTML)
        // Mais ici on essaie de setter au moins le premier trouvé
    },
    
    updateScientificCalcs(mass) {
        this.setIf('mass-display', mass.toFixed(3) + " kg");
        // Recalcul E=mc2 immédiat
        const E = mass * Math.pow(299792458, 2);
        this.setIf('rest-mass-energy', E.toExponential(4) + " J");
    }
};

// Démarrage automatique
window.onload = () => MainController.init();
