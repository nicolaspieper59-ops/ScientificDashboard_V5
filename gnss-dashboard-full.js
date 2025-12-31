/**
 * OMNISCIENCE V100 PRO - MAIN CONTROLLER
 */
const MainController = {
    gmtOffset: 0,
    isActive: false,

    async init() {
        // 1. Synchro GMT via WorldTimeAPI
        try {
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            this.gmtOffset = new Date(data.datetime).getTime() - Date.now();
            document.getElementById('ntp-offset').innerText = this.gmtOffset + "ms";
        } catch(e) { console.warn("Mode Offline"); }

        this.setupEventListeners();
        this.runAstroLoop();
    },

    setupEventListeners() {
        const startBtn = document.getElementById('start-btn-final');
        startBtn.onclick = () => {
            this.isActive = true;
            startBtn.style.background = "#ff00ff";
            startBtn.innerText = "SYSTÈME ACTIF (UKF)";
            this.runInertialLoop();
        };
    },

    runInertialLoop() {
        let lastT = performance.now();
        window.addEventListener('devicemotion', (e) => {
            if (!this.isActive) return;

            const now = performance.now();
            const dt = (now - lastT) / 1000;
            lastT = now;

            if (dt > 0 && dt < 0.1) {
                const data = UKF_Engine.process(e.accelerationIncludingGravity, dt);
                
                // Mise à jour double (Tableau + HUD)
                const kmh = (data.speed * 3.6).toFixed(2);
                document.getElementById('speed-stable-kmh').innerText = kmh + " km/h";
                document.getElementById('sp-main-hud').innerText = kmh;
                
                document.getElementById('g-force-hud').innerText = data.g.toFixed(3);
                document.getElementById('lorentz-factor').innerText = data.lorentz.toFixed(12);
            }
        });
    },

    runAstroLoop() {
        setInterval(() => {
            const preciseDate = new Date(Date.now() + this.gmtOffset);
            const lat = 43.28; // Valeurs par défaut (Marseille)
            const lon = 5.34;
            
            AstroEngine.update(preciseDate, lat, lon);
            
            // Mise à jour horloge système
            document.getElementById('gmt-time-display-1').innerText = preciseDate.toLocaleTimeString();
        }, 1000);
    }
};

// Lancement automatique
window.onload = () => MainController.init();
