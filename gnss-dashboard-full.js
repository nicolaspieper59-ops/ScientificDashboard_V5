const MainApp = {
    // Variables pour stocker les capteurs
    lightSensor: null,

    async init() {
        console.log("🚀 Lancement Omniscience...");

        // 1. Demande Permission MOUVEMENT (iOS 13+ & Android)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission === 'granted') {
                    this.startMotion();
                } else {
                    alert("⚠️ Permission Mouvement refusée.");
                }
            } catch (e) {
                console.error(e);
                // Fallback pour certains Android qui n'ont pas requestPermission mais demandent HTTPS
                this.startMotion(); 
            }
        } else {
            // Non-iOS (Android standard)
            this.startMotion();
        }

        // 2. Démarrage LUMIÈRE (API Generic Sensor)
        this.startLightSensor();
    },

    startMotion() {
        window.addEventListener('devicemotion', (event) => {
            // Envoi des données brutes à l'UKF
            // On vérifie que les données existent pour éviter le NaN
            const acc = event.accelerationIncludingGravity || {x:0, y:0, z:0};
            const gyro = event.rotationRate || {alpha:0, beta:0, gamma:0};
            
            // Si l'UKF est prêt, on injecte
            if (typeof UKF !== 'undefined') {
                // dt approximatif de 0.02s (50Hz) standard navigateur
                UKF.update(acc, gyro, 0.02);
            }
        });
        
        // Confirmation visuelle
        document.getElementById('ekf-status').innerText = "CAPTEURS ACTIFS";
        document.getElementById('ekf-status').style.color = "var(--accent-green)";
    },

    startLightSensor() {
        try {
            // Vérification si l'API est disponible (grâce au réglage Chrome://flags)
            if ('AmbientLightSensor' in window) {
                this.lightSensor = new AmbientLightSensor();
                
                this.lightSensor.onreading = () => {
                    const lux = this.lightSensor.illuminance;
                    // Mise à jour HTML
                    const luxElem = document.getElementById('env-lux'); // Assure-toi que cet ID existe dans ton HTML
                    if (luxElem) luxElem.innerText = lux.toFixed(1);
                    
                    // Injection dans WeatherEngine pour l'UKF (fusion optique)
                    if (typeof WeatherEngine !== 'undefined') {
                        WeatherEngine.updateLux(lux);
                    }
                };

                this.lightSensor.onerror = (event) => {
                    console.warn("Erreur Capteur Lumière:", event.error.name, event.error.message);
                    this.fallbackLight();
                };

                this.lightSensor.start();
                console.log("☀️ Capteur de lumière connecté.");
            } else {
                throw new Error("API AmbientLightSensor non trouvée");
            }
        } catch (err) {
            console.log("⚠️ Mode Lumière dégradé (Webcam/Simulé) : " + err.message);
            this.fallbackLight();
        }
    },

    fallbackLight() {
        // Si le capteur matériel échoue, on met 0 ou on utilise la webcam (voir WeatherEngine)
        const luxElem = document.getElementById('env-lux');
        if (luxElem) luxElem.innerText = "0.0 (Sim)";
    }
};

// LIAISON DU BOUTON INIT (CRUCIAL POUR iOS/ANDROID)
document.getElementById('start-btn-final').addEventListener('click', () => {
    MainApp.init();
});
