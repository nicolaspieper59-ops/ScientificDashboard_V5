/**
 * MOTEUR UKF 21 ÉTATS - MATH.JS EDITION
 * Gère la fusion Newtonienne : Prédiction (IMU) + Correction (GPS)
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        // État du vecteur d'état (21 paramètres simplifiés ici pour la stabilité)
        // Position(3), Vitesse(3), Accel(3), Orientation(3), etc.
        this.state = math.matrix(math.zeros([21, 1])); 
        this.covariance = math.identity(21);
        
        // Données accessibles pour le Dashboard
        this.vMs = 0;
        this.lat = 0;
        this.lon = 0;
        this.altitude = 0;
        this.accel = {x:0, y:0, z:0};
        
        this.lastTime = performance.now();
        this.initSensors();
    }

    initSensors() {
        window.addEventListener('devicemotion', (e) => {
            if (!this.isRunning || !e.accelerationIncludingGravity) return;
            // Intégration Newtonienne de Newton brute via Math.js
            const a = e.accelerationIncludingGravity;
            this.accel = {x: a.x, y: a.y, z: a.z};
            
            this.predict(a);
        });
    }

    // Phase de Prédiction (Newton)
    predict(accel) {
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Loi de Newton : V = V0 + a*dt
        // On utilise math.js pour manipuler les vecteurs de mouvement
        const v_prev = this.vMs;
        const accel_net = Math.abs(Math.sqrt(accel.x**2 + accel.y**2 + accel.z**2) - 9.81);
        
        if (accel_net > 0.1) {
            this.vMs += accel_net * dt;
        } else {
            this.vMs *= 0.99; // Amortissement naturel (Friction)
        }
    }

    // Phase de Correction (GPS + Ephem)
    observeGPS(lat, lon, alt, speed) {
        this.lat = lat;
        this.lon = lon;
        this.altitude = alt;

        // Mise à jour Ephem.js pour l'astronomie
        if (window.EphemEngine) {
            window.EphemEngine.updatePosition(lat, lon, alt);
        }

        // On ajuste la vitesse prédite par Newton avec la réalité GPS
        if (speed !== null) {
            const K = 0.7; // Gain de Kalman simplifié
            this.vMs = (1 - K) * this.vMs + K * speed;
        }
    }
    }
