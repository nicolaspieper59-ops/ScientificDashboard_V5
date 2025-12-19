/**
 * GNSS SpaceTime Dashboard - MOTEUR V7 "DEEP CAVE" (INERTIE PURE)
 * Intégration Newtonienne stricte sans dépendance GPS
 */

((window) => {
    "use strict";
    const $ = id => document.getElementById(id);

    // --- CONSTANTES PHYSIQUES ---
    const PHYS = {
        C: 299792458,
        R_GAS: 287.05,
        P0: 101325,
        T0: 288.15,
        L_RATE: 0.0065
    };

    // --- ÉTAT DU SYSTÈME ---
    const state = {
        running: false,
        v: 0,           // Vitesse en m/s
        vMax: 0,
        dist: 0,
        lastT: 0,
        pos: { lat: 0, lon: 0, alt: 0 },
        // On stocke l'accélération linéaire (sans gravité)
        linAcc: { x: 0, y: 0, z: 0 } 
    };

    // --- 1. DÉMARRAGE ET PERMISSIONS ---
    const initSystem = async () => {
        const btn = $('gps-pause-toggle');
        
        // Permissions iOS/Android
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try { await DeviceMotionEvent.requestPermission(); } catch (e) {}
        }

        state.running = !state.running;
        
        if (state.running) {
            btn.textContent = "⏸️ PAUSE SYSTÈME";
            btn.style.backgroundColor = "#dc3545";
            btn.classList.add('pulse-active');
            
            // On ne remet PAS la vitesse à 0 si on reprend une session (Inertie)
            state.lastT = performance.now();
            
            // GPS (Juste pour la carte et l'altitude, pas pour la vitesse)
            if (navigator.geolocation) {
                navigator.geolocation.watchPosition(
                    p => {
                        state.pos.lat = p.coords.latitude;
                        state.pos.lon = p.coords.longitude;
                        state.pos.alt = p.coords.altitude || 0;
                        // Note : On n'utilise PLUS p.coords.speed pour écraser l'inertie
                    },
                    err => console.warn(err),
                    { enableHighAccuracy: true, maximumAge: 0 }
                );
            }
            requestAnimationFrame(physicsLoop);
        } else {
            btn.textContent = "▶️ DÉMARRER SYSTÈME";
            btn.style.backgroundColor = "#28a745";
            btn.classList.remove('pulse-active');
        }
    };

    const startBtn = $('gps-pause-toggle');
    if(startBtn) startBtn.onclick = initSystem;


    // --- 2. MOTEUR PHYSIQUE (INTEGRATION PURE) ---
    function updatePhysics(dt) {
        // 1. Récupération de l'accélération linéaire brute (Capteur matériel)
        // On utilise la magnitude du vecteur 3D pour connaitre la force totale
        // Attention : Math.sign permet de savoir si on avance ou freine (simplifié ici par l'axe Y dominant du téléphone)
        
        // Axe principal du mouvement (supposons que le téléphone pointe vers l'avant en Y ou Z)
        // On prend la magnitude globale pour être sûr de capter tout mouvement
        let accMag = Math.sqrt(state.linAcc.x**2 + state.linAcc.y**2 + state.linAcc.z**2);
        
        // Détection de direction (Simplifiée : Si le téléphone pointe vers le haut/avant)
        // Pour un calcul pur, on considère toute accélération comme positive (gain de vitesse)
        // SAUF si l'utilisateur freine (accélération inverse).
        // Ici, pour la simulation "Grotte", on intègre la magnitude.
        
        // SEUIL DE BRUIT (DEADBAND)
        // On ignore seulement le bruit électronique pur (< 0.02 m/s²)
        // Cela permet de capter le "1mm/s" demandé.
        if (accMag < 0.02) {
            accMag = 0; 
            // ICI : PAS de remise à zéro de la vitesse. INERTIE TOTALE.
        }

        // 2. LOI DE NEWTON : v = v0 + a * t
        // Si accMag est actif, on l'ajoute.
        // Problème des accéléromètres : ils ne savent pas si on accélère ou freine sans boussole complexe.
        // Astuce : On utilise l'inclinaison ou on suppose que toute force > 0 ajoute de l'énergie cinétique
        // Pour ce script, on ajoute l'accélération à la vitesse.
        
        // Note critique : Pour gérer la décélération, il faudrait que le capteur envoie une valeur négative.
        // Les capteurs 'LinearAcceleration' donnent souvent des valeurs signées.
        // On va utiliser l'axe Y (longitudinal téléphone) comme référence principale.
        
        let forwardAcc = state.linAcc.y; // Axe vertical du téléphone (ou Z selon la tenue)
        // Si on tient le téléphone à plat, Y est l'avant/arrière.
        
        // Filtre ultra-fin
        if (Math.abs(forwardAcc) < 0.02) forwardAcc = 0;

        // INTÉGRATION
        state.v += forwardAcc * dt;

        // Protection : La vitesse ne peut pas être négative (marche arrière non gérée pour simplifier l'affichage)
        if (state.v < 0) state.v = 0;

        // Calculs dérivés
        state.dist += state.v * dt;
        if (state.v > state.vMax) state.vMax = state.v;
        if (state.v > 0.001) state.moveTime += dt;

        // Modèle ISA pour combler les trous N/A
        const temp = PHYS.T0 - (PHYS.L_RATE * state.pos.alt);
        const press = PHYS.P0 * Math.pow((1 - (PHYS.L_RATE * state.pos.alt) / PHYS.T0), 5.255);
        const rho = press / (PHYS.R_GAS * temp);
        
        // Traînée (Air Resistance) - Optionnel
        // Si vous voulez une inertie PARFAITE (vide spatial), mettez drag à 0.
        // Ici on laisse une traînée minime réaliste.
        const q = 0.5 * rho * state.v**2;
        const drag = q * 0.47 * 0.5; 
        
        // Application de la traînée (freinage aérodynamique naturel)
        const mass = parseFloat($('mass-input')?.value) || 70;
        state.v -= (drag / mass) * dt; 

        return { rho, press, q, drag, mass };
    }


    // --- 3. BOUCLE VISUELLE ---
    function physicsLoop() {
        if (!state.running) return;

        const now = performance.now();
        // dt limité à 0.1s pour éviter les sauts si le navigateur lag
        const dt = Math.min((now - state.lastT) / 1000, 0.1); 
        state.lastT = now;

        const phys = updatePhysics(dt);
        const vKmh = state.v * 3.6;

        // AFFICHAGE
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(2) + " km/h";
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(3) + " m/s"; // Affichage millimétrique
        if($('total-distance')) $('total-distance').textContent = state.dist.toFixed(2) + " m";
        
        // Suppressions N/A Fluides
        if($('air-density')) $('air-density').textContent = phys.rho.toFixed(3);
        if($('drag-force')) $('drag-force').textContent = phys.drag.toFixed(2) + " N";
        if($('accel-long')) $('accel-long').textContent = state.linAcc.y.toFixed(3); // Axe Y affiché

        // Relativité
        const gamma = 1 / Math.sqrt(1 - (state.v**2 / PHYS.C**2));
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(14);
        
        // Astro & GPS
        if($('gps-accuracy-display')) $('gps-accuracy-display').textContent = "OFF (Inertial Mode)";
        
        requestAnimationFrame(physicsLoop);
    }

    // --- 4. CAPTEURS HAUTE FRÉQUENCE ---
    // On utilise 'devicemotion' pour l'accélération linéaire pure (sans gravité)
    window.addEventListener('devicemotion', (e) => {
        // acceleration = Accélération pure (sans gravité). C'est la clé pour l'inertie spatiale.
        if (e.acceleration) {
            // Lissage léger (Moyenne mobile) pour éviter les sauts violents
            const alpha = 0.8; 
            state.linAcc.x = state.linAcc.x * alpha + (e.acceleration.x || 0) * (1 - alpha);
            state.linAcc.y = state.linAcc.y * alpha + (e.acceleration.y || 0) * (1 - alpha);
            state.linAcc.z = state.linAcc.z * alpha + (e.acceleration.z || 0) * (1 - alpha);
        } else {
            // Fallback si le capteur linéaire est absent (moins précis)
            const gX = e.accelerationIncludingGravity.x || 0;
            const gY = e.accelerationIncludingGravity.y || 0;
            const gZ = e.accelerationIncludingGravity.z || 0;
            // On tente de retirer la gravité (très approximatif)
            state.linAcc.z = gZ - 9.81;
        }

        // Gestion Pitch/Roll pour l'affichage
        const gX = e.accelerationIncludingGravity.x || 0;
        const gY = e.accelerationIncludingGravity.y || 0;
        const gZ = e.accelerationIncludingGravity.z || 0;
        if($('pitch')) $('pitch').textContent = (Math.atan2(-gX, gZ)*57.3).toFixed(1)+"°";
        if($('roll')) $('roll').textContent = (Math.atan2(gY, gZ)*57.3).toFixed(1)+"°";
    });

})(window);
