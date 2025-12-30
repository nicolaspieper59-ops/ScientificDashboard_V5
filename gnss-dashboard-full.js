/**
 * CONTRÔLEUR DE SYNCHRONISATION GMT / ASTRO
 */
const MainController = {
    gmtOffset: 0,

    async init() {
        await this.syncWithNTPServer();
        this.startHighResLoop();
        this.startAstroEngine();
    },

    // Synchronisation avec un serveur de temps pour éviter la dérive de l'appareil
    async syncWithNTPServer() {
        try {
            const start = Date.now();
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await response.json();
            const end = Date.now();
            const serverTime = new Date(data.datetime).getTime() + (end - start) / 2;
            this.gmtOffset = serverTime - Date.now();
            console.log("Synchro GMT réussie. Offset:", this.gmtOffset, "ms");
        } catch (e) { console.error("Erreur synchro GMT, utilisation heure locale"); }
    },

    startAstroEngine() {
        setInterval(() => {
            const preciseDate = new Date(Date.now() + this.gmtOffset);
            const lon = 5.3456; // À remplacer par long-ukf
            const lat = 43.2845;

            // Calcul Ephem.js
            const sun = Ephem.getSun(preciseDate, lat, lon);
            const lst = Ephem.getLST(preciseDate, lon);

            // Mise à jour IDs HTML
            document.getElementById('tslv').innerText = lst;
            document.getElementById('hud-sun-alt').innerText = sun.altitude.toFixed(2) + "°";
            
            // Animation Minecraft
            const clock = document.getElementById('minecraft-clock');
            clock.style.transform = `rotate(${sun.altitude + 90}deg)`;
        }, 500);
    },

    startHighResLoop() {
        const update = () => {
            // Capture DeviceMotion
            window.ondevicemotion = (e) => {
                const physics = QuantumEngine.update(e.accelerationIncludingGravity, e.rotationRate);
                if (physics) {
                    const speedKmh = physics.speedMs * 3.6;
                    document.getElementById('sp-main').innerText = speedKmh.toFixed(2);
                    document.getElementById('g-force').innerText = physics.gForce.toFixed(3);
                    
                    // Calcul Relativité (Lorentz)
                    const v = physics.speedMs;
                    const c = 299792458;
                    const lorentz = 1 / Math.sqrt(1 - (v*v)/(c*c));
                    document.getElementById('lorentz-factor').innerText = lorentz.toFixed(12);
                }
            };
            requestAnimationFrame(update);
        };
        update();
    }
};

window.onload = () => MainController.init();
