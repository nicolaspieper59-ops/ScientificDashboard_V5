/**
 * OMNIPOTENCE V25.9.55 - ANTIBRUIT_RK4
 * Spécial : Stabilisation des vibrations & Réalisme Inertiel
 */

const OMNI_V25 = {
    // ... (garder les constantes math.js et _BN de la V50)
    
    // NOUVEAUX PARAMÈTRES DE STABILISATION
    filter: {
        accel_buffer: [],
        buffer_size: 10, // Moyenne glissante sur 10 échantillons (100ms)
        noise_threshold: 0.15, // Ignore tout en dessous de 0.15 m/s² (vibrations)
        k_friction: 0.95 // Freinage de stabilisation à très basse vitesse
    },

    activate() {
        this.active = true;
        window.addEventListener('devicemotion', (e) => {
            const now = performance.now();
            const dt = _BN((now - this.lastT) / 1000);
            this.lastT = now;
            if (Number(dt) <= 0 || Number(dt) > 0.1) return;

            let raw_a = e.acceleration || { x: 0, y: 0, z: 0 };
            let mag = Math.sqrt(raw_a.x**2 + raw_a.y**2 + raw_a.z**2);

            // 1. FILTRAGE DU BRUIT (Moving Average)
            this.filter.accel_buffer.push(mag);
            if (this.filter.accel_buffer.length > this.filter.buffer_size) this.filter.accel_buffer.shift();
            
            // Calcul de la moyenne filtrée
            let filtered_mag = this.filter.accel_buffer.reduce((a, b) => a + b) / this.filter.accel_buffer.length;

            // 2. SEUIL DE PORTE (Noise Gate)
            // Si l'accélération est trop faible, on considère que c'est du bruit de capteur
            let final_a = filtered_mag < this.filter.noise_threshold ? 0 : filtered_mag;

            // 3. LOGIQUE DE DÉCÉLÉRATION RÉALISTE
            if (final_a === 0 && Number(this.v) > 0) {
                // Si aucun mouvement n'est détecté, on applique une friction naturelle + traînée
                this.v = m.multiply(this.v, this.filter.k_friction); 
            }

            this.computeRK4(_BN(final_a), dt);
        }, true);

        setInterval(() => this.refreshHUD(), 100);
    },

    computeRK4(a_in, dt) {
        // Moteur RK4 identique à la V50 pour la précision
        const rho = _BN((this.pos.press * 100) / (287.05 * (this.pos.temp + 273.15)));
        const CdA = _BN(0.47 * 0.55); 
        
        const accelerationFunction = (v) => {
            const drag = m.divide(m.multiply(0.5, rho, m.pow(v, 2), CdA), this.mass);
            return m.subtract(a_in, drag);
        };

        const k1 = accelerationFunction(this.v);
        const k2 = accelerationFunction(m.add(this.v, m.multiply(k1, m.divide(dt, 2))));
        const k3 = accelerationFunction(m.add(this.v, m.multiply(k2, m.divide(dt, 2))));
        const k4 = accelerationFunction(m.add(this.v, m.multiply(k3, dt)));

        const deltaV = m.multiply(m.divide(dt, 6), m.add(k1, m.multiply(2, k2), m.multiply(2, k3), k4));
        this.v = m.add(this.v, deltaV);

        // Verrouillage du repos (évite la vitesse rampante)
        if (this.v < 0.01) this.v = _BN(0);
        this.dist = m.add(this.dist, m.multiply(this.v, dt));
    },

    refreshHUD() {
        // Mapping spécifique à vos IDs HTML
        const v = Number(this.v);
        const v_kmh = v * 3.6;

        this.setUI('main-speed', v_kmh.toFixed(2));
        this.setUI('v-cosmic', v_kmh.toFixed(6));
        this.setUI('speed-stable-kmh', v_kmh.toFixed(4));
        this.setUI('speed-stable-ms', v.toFixed(6));
        
        // Mise à jour de la G-Force avec l'accélération filtrée
        this.setUI('g-force-resultant', (1 + (this.last_acc / 9.81)).toFixed(4));
        
        // ... (Reste du mapping identique à votre interface)
    }
};
