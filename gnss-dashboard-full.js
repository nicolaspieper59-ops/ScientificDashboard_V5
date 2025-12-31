/**
 * OMNISCIENCE V100 PRO - SYSTEM CONTROLLER
 * Gère les permissions Capteurs et la boucle principale
 */
const MainController = {
    isActive: false,
    coords: { lat: 43.285, lon: 5.345 }, // Marseille

    init() {
        console.log("System Ready. Waiting for user interaction...");
        this.setupButton();
        this.startPassiveLoops(); // Heure et Astro tournent toujours
    },

    setupButton() {
        const btn = document.getElementById('start-btn-final');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            // 1. Demande de Permission (IOS 13+ Requis)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const response = await DeviceMotionEvent.requestPermission();
                    if (response === 'granted') {
                        this.activateSystem(btn);
                    } else {
                        alert("Permission capteurs refusée !");
                    }
                } catch (e) {
                    console.error(e);
                    // Fallback pour android qui n'a pas besoin de requestPermission
                    this.activateSystem(btn); 
                }
            } else {
                // Non-iOS 13+ devices
                this.activateSystem(btn);
            }
        });
    },

    activateSystem(btn) {
        this.isActive = !this.isActive;
        
        if (this.isActive) {
            btn.innerText = "SYSTÈME ACTIF (STOP)";
            btn.style.background = "#ff00ff";
            btn.style.boxShadow = "0 0 30px #ff00ff";
            
            // Démarrage écouteurs capteurs
            window.addEventListener('devicemotion', this.handleMotion);
        } else {
            btn.innerText = "INITIALISER LE SYSTÈME FINAL";
            btn.style.background = "#00ff88";
            btn.style.boxShadow = "none";
            window.removeEventListener('devicemotion', this.handleMotion);
        }
    },

    handleMotion: (e) => {
        // Cette fonction est appelée 60 fois par seconde
        const acc = e.accelerationIncludingGravity;
        const gyro = e.rotationRate;
        
        if (!acc) return;

        // Mise à jour IMU HTML
        const set = (id, v) => { 
            const el = document.getElementById(id); 
            if(el) el.innerText = v; 
        };

        set('acc-x', acc.x?.toFixed(2));
        set('acc-y', acc.y?.toFixed(2));
        set('acc-z', acc.z?.toFixed(2));
        
        // Appel au moteur UKF (Si chargé)
        if (typeof UKF_PRO !== 'undefined') {
            UKF_PRO.update(acc, gyro || {x:0,y:0,z:0});
            UKF_PRO.predict(0.016);
            
            const physics = UKF_PRO.getRelativityData(100);
            
            // Mise à jour Vitesse et Relativité
            const kmh = (physics.velocity * 3.6);
            set('sp-main-hud', kmh.toFixed(1));
            set('speed-stable-kmh', kmh.toFixed(2) + " km/h");
            set('lorentz-factor', physics.lorentzFactor.toFixed(12));
            
            // Mise à jour Pression Dynamique
            const q = 0.5 * 1.225 * Math.pow(physics.velocity, 2);
            set('dynamic-pressure', q.toFixed(2) + " Pa");
        }
    },

    startPassiveLoops() {
        // Boucle 1Hz pour l'horloge et l'astro (tourne même sans capteurs)
        setInterval(() => {
            const now = new Date(); // Utilise l'heure système faute de NTP
            
            // Mise à jour Astro
            if (typeof AstroEngine !== 'undefined') {
                AstroEngine.update(now, this.coords.lat, this.coords.lon);
            }

            // Mise à jour Heure
            const timeStr = now.toLocaleTimeString();
            const elTime = document.getElementById('gmt-time-display-1');
            if(elTime) elTime.innerText = timeStr;
            
        }, 1000);
    }
};

window.onload = () => MainController.init();
