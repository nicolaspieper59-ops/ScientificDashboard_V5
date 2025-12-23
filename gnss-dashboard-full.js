(function(window) {
    const $ = id => document.getElementById(id);

    class MasterDashboard {
        constructor() {
            this.engine = null; // Sera lié à votre moteur UKF
            this.isRunning = false;
            this.lastT = performance.now();
            
            // Initialisation au chargement de la page
            window.addEventListener('load', () => this.init());
        }

        init() {
            console.log("⚡ Initialisation du Dashboard...");
            
            // 1. Liaison du Bouton MARCHE / ARRÊT
            const btn = $('gps-pause-toggle');
            if (btn) {
                btn.onclick = () => this.toggleSystem();
                console.log("✅ Bouton Marche/Arrêt détecté et lié.");
            } else {
                console.error("❌ ERREUR : Bouton 'gps-pause-toggle' introuvable !");
            }
        }

        async toggleSystem() {
            const btn = $('gps-pause-toggle');

            // --- CAS 1 : SI LE SYSTÈME EST DÉJÀ EN MARCHE -> ON ARRÊTE ---
            if (this.isRunning) {
                this.isRunning = false;
                
                // Mise à jour visuelle du bouton
                btn.textContent = "▶️ MARCHE GPS";
                btn.style.backgroundColor = ""; // Retour couleur par défaut
                btn.classList.remove('active');
                
                // Désactivation des écouteurs pour économiser la batterie
                window.removeEventListener('devicemotion', this.handleMotion);
                
                $('status-physique').textContent = "PAUSE";
                console.log("🛑 Système arrêté.");
                return;
            }

            // --- CAS 2 : SI LE SYSTÈME EST À L'ARRÊT -> ON DÉMARRE ---
            
            // A. Demande de permission (Obligatoire pour iOS 13+ et Android récents)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const permissionState = await DeviceMotionEvent.requestPermission();
                    if (permissionState !== 'granted') {
                        alert("Permission refusée pour les capteurs.");
                        return;
                    }
                } catch (e) {
                    console.error("Erreur permission:", e);
                }
            }

            // B. Initialisation du Moteur UKF (si présent)
            if (typeof window.ProfessionalUKF !== 'undefined' && !this.engine) {
                this.engine = new window.ProfessionalUKF();
            }

            // C. Activation
            this.isRunning = true;
            btn.textContent = "⏸️ ARRÊT GPS";
            btn.style.backgroundColor = "#dc3545"; // Rouge pour signifier "Stop possible"
            btn.classList.add('active');
            $('status-physique').textContent = "ACQUISITION EN COURS...";

            // D. Lancement des capteurs
            window.addEventListener('devicemotion', (e) => this.handleMotion(e));
            
            // Lancement du GPS (Géolocalisation)
            if ("geolocation" in navigator) {
                navigator.geolocation.watchPosition(
                    (p) => this.updateGPS(p), 
                    (e) => console.warn("Erreur GPS:", e),
                    { enableHighAccuracy: true }
                );
            }

            console.log("🚀 Système démarré avec succès.");
        }

        // --- GESTION DES CAPTEURS (DeviceMotion) ---
        handleMotion(event) {
            if (!this.isRunning) return;

            // 1. Récupération des données brutes
            // accelerationIncludingGravity contient la gravité (9.81 m/s²)
            const acc = event.accelerationIncludingGravity || {x:0, y:0, z:0};
            // acceleration est l'accélération linéaire pure (sans gravité)
            const accLin = event.acceleration || {x:0, y:0, z:0};
            // rotationRate est le gyroscope
            const rot = event.rotationRate || {alpha:0, beta:0, gamma:0};

            // 2. Affichage dans le DOM (Section IMU)
            if($('acc-x')) $('acc-x').textContent = (acc.x || 0).toFixed(2);
            if($('acc-y')) $('acc-y').textContent = (acc.y || 0).toFixed(2);
            if($('acc-z')) $('acc-z').textContent = (acc.z || 0).toFixed(2);

            // 3. Calcul simple du Pitch/Roll pour le niveau à bulle
            // (Approximation basique à partir de l'accéléromètre)
            const roll = Math.atan2(acc.y, acc.z) * 180 / Math.PI;
            const pitch = Math.atan2(-acc.x, Math.sqrt(acc.y * acc.y + acc.z * acc.z)) * 180 / Math.PI;

            if($('pitch')) $('pitch').textContent = pitch.toFixed(1) + "°";
            if($('roll')) $('roll').textContent = roll.toFixed(1) + "°";

            // Mise à jour visuelle de la bulle
            const bubble = $('bubble');
            if (bubble) {
                // Limite le déplacement pour rester dans le cercle
                const maxDist = 45; 
                const x = Math.max(-maxDist, Math.min(maxDist, roll));
                const y = Math.max(-maxDist, Math.min(maxDist, pitch));
                bubble.style.transform = `translate(${x}px, ${y}px)`;
            }

            // 4. Envoi au moteur UKF (si le moteur existe)
            if (this.engine) {
                const now = performance.now();
                const dt = (now - this.lastT) / 1000;
                this.lastT = now;
                
                // On passe les données au moteur pour le filtrage
                this.engine.predict(dt, acc, rot, null);
                
                // Mise à jour de l'affichage vitesse calculée
                const state = this.engine.getState();
                if($('speed-main-display')) $('speed-main-display').textContent = (state.v * 3.6).toFixed(1) + " km/h";
            }
        }

        updateGPS(position) {
            if (!this.isRunning) return;
            
            // Mise à jour des coordonnées brutes
            if(this.engine) {
                this.engine.update({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    alt: position.coords.altitude
                });
            }

            // Affichage UI GPS
            if($('gps-accuracy-display')) $('gps-accuracy-display').textContent = position.coords.accuracy.toFixed(1) + " m";
        }
    }

    // Instanciation globale
    window.masterApp = new MasterDashboard();

})(window);
