/**
 * GNSS SPACETIME - CORRECTIF BOUTON MARCHE/ARRÊT
 */

((window) => {
    const $ = id => document.getElementById(id);

    class MasterController {
        constructor() {
            this.isTracking = false;
            // On s'assure que le moteur UKF est prêt
            if (window.ProfessionalUKF) {
                this.engine = new window.ProfessionalUKF();
            }
            this.init();
        }

        init() {
            const startBtn = $('gps-pause-toggle');
            if (!startBtn) {
                console.error("❌ Bouton 'gps-pause-toggle' introuvable dans le HTML !");
                return;
            }

            // --- LE DÉCLENCHEUR CRITIQUE ---
            startBtn.addEventListener('click', async () => {
                if (!this.isTracking) {
                    await this.activateSystem();
                } else {
                    this.stopSystem();
                }
            });
        }

        async activateSystem() {
            const startBtn = $('gps-pause-toggle');
            
            try {
                // 1. Demande de permission (Indispensable sur iOS et Android récent)
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission !== 'granted') {
                        alert("Permission refusée pour les capteurs.");
                        return;
                    }
                }

                // 2. Lancement des capteurs
                this.startInertialTracking();
                this.startGPSTracking();

                // 3. Mise à jour visuelle du bouton
                this.isTracking = true;
                startBtn.innerHTML = '<i class="fas fa-pause"></i> PAUSE SYSTÈME';
                startBtn.style.backgroundColor = "#dc3545"; // Rouge
                
                // 4. Lancer la boucle d'affichage
                this.runDisplayLoop();
                
                console.log("✅ Système démarré avec succès.");
            } catch (error) {
                console.error("Échec du démarrage :", error);
                alert("Erreur lors de l'activation des capteurs.");
            }
        }

        stopSystem() {
            // Pour un arrêt propre, on recharge la page (Reset total)
            location.reload();
        }

        startInertialTracking() {
            window.addEventListener('devicemotion', (e) => {
                if (!this.isTracking) return;
                // Envoi des données au moteur UKF
                if (this.engine) {
                    const dt = 0.016; // 60Hz
                    this.engine.predict(
                        e.acceleration || {x:0, y:0, z:0},
                        e.rotationRate || {alpha:0, beta:0, gamma:0},
                        dt
                    );
                }
            });
        }

        startGPSTracking() {
            navigator.geolocation.watchPosition((p) => {
                if (this.engine) this.engine.updateGPS(p.coords.latitude, p.coords.longitude, p.coords.altitude);
                const acc = $( 'gps-accuracy-display' );
                if (acc) acc.textContent = p.coords.accuracy.toFixed(1) + " m";
            }, null, { enableHighAccuracy: true });
        }

        runDisplayLoop() {
            const update = () => {
                if (!this.isTracking) return;

                // Mise à jour de l'heure et des chronos
                const now = new Date();
                const localTime = $('local-time');
                if (localTime) localTime.textContent = now.toLocaleTimeString();

                // On force le rafraîchissement des données UKF ici
                // ... (vos calculs de vitesse, relativité, etc.)
                
                requestAnimationFrame(update);
            };
            update();
        }
    }

    // Lancement automatique
    window.addEventListener('load', () => {
        window.App = new MasterController();
    });

})(window); 
