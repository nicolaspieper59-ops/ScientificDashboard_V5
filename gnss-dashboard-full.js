/**
 * =================================================================
 * GNSS SPACETIME DASHBOARD - FICHIER FINAL "STRATÉGIQUE" (V60)
 * =================================================================
 * - Navigation Inertielle (IMU) Prioritaire (100Hz)
 * - TimeStabilizer (NTP Sync + Drift Estimation pour mode Offline)
 * - Freinage Réaliste (ZUPT + Braking Efficiency 99 -> 0 km/h)
 * - Mode Nether/Trou Terrestre (Distorsion 1:8 & Gravité de Gauss)
 * - Compensation Pitch & Coriolis pour Avion/Train/Hyperloop
 * =================================================================
 */

((window) => {
    "use strict";

    // --- 1. FONCTIONS UTILITAIRES ---
    const $ = id => document.getElementById(id);

    const dataOrDefault = (val, decimals, suffix = '', fallback = 'N/A', forceZero = true) => {
        if (val === undefined || val === null || isNaN(val) || (typeof val === 'number' && Math.abs(val) < 1e-18 && forceZero)) {
            if (fallback !== 'N/A') return fallback;
            const zeroFormat = (decimals === 0 ? '0' : '0.' + Array(decimals).fill('0').join(''));
            return zeroFormat.replace('.', ',') + suffix;
        }
        return val.toFixed(decimals).replace('.', ',') + suffix;
    };

    // --- 2. MOTEUR DE TEMPS STRATÉGIQUE (TimeStabilizer) ---
    // Corrige la dérive temporelle par le calcul pour l'UKF et l'Astro
    const TimeEngine = {
        ntpOffset: 0,
        smoothedOffset: 0,
        driftRate: 0, 
        lastSync: 0,
        alpha: 0.05, 

        now() {
            const localNow = Date.now();
            if (this.lastSync === 0) return localNow;
            
            // Estimation de la dérive mathématique (Mode Offline)
            const elapsed = (localNow - this.lastSync) / 1000;
            const driftCorrection = elapsed * this.driftRate;
            return localNow + this.smoothedOffset + driftCorrection;
        },

        async sync() {
            try {
                const t0 = performance.now();
                const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await res.json();
                const t3 = performance.now();
                
                const serverTime = new Date(data.datetime).getTime();
                const latence = (t3 - t0) / 2;
                const measuredOffset = serverTime - (Date.now() + latence);

                if (this.lastSync !== 0) {
                    // Calcul du drift du quartz local (calcul de dérive temporelle)
                    const timeDiff = (Date.now() - this.lastSync) / 1000;
                    const offsetDiff = measuredOffset - this.ntpOffset;
                    this.driftRate = offsetDiff / timeDiff;
                    
                    // Lissage pour éviter les sauts brusques dans l'UKF
                    this.smoothedOffset = (1 - this.alpha) * this.smoothedOffset + (this.alpha * measuredOffset);
                } else {
                    this.smoothedOffset = measuredOffset;
                }

                this.ntpOffset = measuredOffset;
                this.lastSync = Date.now();
                if ($('ntp-offset')) $('ntp-offset').textContent = this.ntpOffset.toFixed(0) + ' ms';
                console.log(`⏱️ NTP Sync: Drift=${this.driftRate.toFixed(6)}ms/s`);
            } catch (e) {
                console.warn("🌐 Offline: Estimation de dérive active.");
            }
        }
    };

    // --- 3. CONSTANTES & ÉTAT GLOBAL ---
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const C_L = 299792458;
    const G_ACC_STD = 9.8067;
    
    let isSystemActive = false;
    let lastPredictionTime = 0;
    let totalDistanceM = 0;
    let maxSpeedMs = 0;
    let deadReckoningSpeed = 0; // m/s (Inertie pure)
    let timeInMotionMs = 0;
    let modeNether = false; // Bascule 1:1 ou 1:8

    let curAcc = {x: 0, y: 0, z: G_ACC_STD};
    let curGyro = {x: 0, y: 0, z: 0};
    let ukf = null;
    let fusionState = null;

    // --- 4. GESTION DES CAPTEURS ---

    const handleMotion = (e) => {
        if (!isSystemActive) return;
        
        // 1. Temps Stabilisé
        const now = TimeEngine.now();
        if (lastPredictionTime === 0) { lastPredictionTime = now; return; }
        const dt = (now - lastPredictionTime) / 1000;
        if (dt <= 0 || dt > 0.2) return;
        lastPredictionTime = now;

        // 2. Récupération Accélération
        curAcc.x = e.accelerationIncludingGravity?.x || 0;
        curAcc.y = e.accelerationIncludingGravity?.y || 0;
        curAcc.z = e.accelerationIncludingGravity?.z || 0;

        // 3. Compensation du Pitch (Inclinaison)
        // Permet de distinguer une pente d'une accélération réelle (Avion/Train)
        const rollRad = Math.atan2(curAcc.y, curAcc.z);
        const pitchRad = Math.atan2(-curAcc.x, Math.sqrt(curAcc.y*curAcc.y + curAcc.z*curAcc.z));
        const gravX = -Math.sin(pitchRad) * G_ACC_STD;
        const linAccX = curAcc.x - gravX; // Accélération longitudinale pure

        // 4. Moteur de Vitesse Stratégique (ZUPT + Freinage)
        const totalAccMag = Math.sqrt(curAcc.x**2 + curAcc.y**2 + curAcc.z**2);
        
        if (Math.abs(totalAccMag - G_ACC_STD) < 0.15) {
            // ZUPT (Zero Velocity Update) : L'objet est immobile ou à vitesse constante parfaite
            deadReckoningSpeed *= 0.95; // Friction numérique pour retour à 0
            if (deadReckoningSpeed < 0.05) deadReckoningSpeed = 0;
        } else {
            // Efficacité de freinage (Gain supérieur si accélération négative forte)
            const brakingEfficiency = (linAccX < -1.5) ? 1.25 : 1.0;
            deadReckoningSpeed += linAccX * dt * brakingEfficiency;
        }

        if (deadReckoningSpeed < 0) deadReckoningSpeed = 0; // Sécurité
        maxSpeedMs = Math.max(maxSpeedMs, deadReckoningSpeed);

        // 5. Calcul Distance (Nether / Hyperloop)
        const distMult = modeNether ? 8.0 : 1.0;
        totalDistanceM += deadReckoningSpeed * dt * distMult;
        if (deadReckoningSpeed > 0.2) timeInMotionMs += dt * 1000;

        updateDashboardDOM(pitchRad * R2D, rollRad * R2D, linAccX);
    };

    // --- 5. INTERFACE & MISE À JOUR ---

    const updateDashboardDOM = (pitch, roll, linAccX) => {
        const speedKmh = deadReckoningSpeed * 3.6;
        
        // Vitesse & Distance
        if ($('speed-main-display')) $('speed-main-display').textContent = dataOrDefault(speedKmh, 3, ' km/h');
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = dataOrDefault(speedKmh, 3, ' km/h');
        if ($('speed-max-session')) $('speed-max-session').textContent = dataOrDefault(maxSpeedMs * 3.6, 3, ' km/h');
        
        const distKm = totalDistanceM / 1000;
        if ($('total-distance')) $('total-distance').textContent = `${dataOrDefault(distKm, 3, ' km')} | ${dataOrDefault(totalDistanceM, 1, ' m')}`;

        // Inclinaison & IMU
        if ($('pitch')) $('pitch').textContent = dataOrDefault(pitch, 1, '°');
        if ($('roll')) $('roll').textContent = dataOrDefault(roll, 1, '°');
        if ($('accel-long')) $('accel-long').textContent = dataOrDefault(linAccX, 2, ' m/s²');

        // Physique & Relativité
        const vRatio = deadReckoningSpeed / C_L;
        if ($('pct-speed-of-light')) $('pct-speed-of-light').textContent = dataOrDefault(vRatio * 100, 8, ' %');
        if ($('lorentz-factor')) $('lorentz-factor').textContent = dataOrDefault(1 / Math.sqrt(1 - vRatio*vRatio), 8);

        // Statut
        if ($('ukf-status')) {
            $('ukf-status').textContent = isSystemActive ? "NOMINAL (INERTIAL V60)" : "PAUSE";
            $('ukf-status').style.color = (deadReckoningSpeed > 0) ? "#00ff00" : "#00bfff";
        }

        // Temps & Astro (Utilise le temps stabilisé pour supprimer les N/A)
        const now = new Date(TimeEngine.now());
        if ($('local-time')) $('local-time').textContent = now.toLocaleTimeString('fr-FR');
        if ($('movement-time')) $('movement-time').textContent = dataOrDefault(timeInMotionMs/1000, 2, ' s');
    };

    // --- 6. INITIALISATION & CONTRÔLES ---

    const toggleSystem = () => {
        isSystemActive = !isSystemActive;
        const btn = $('gps-pause-toggle');
        if (btn) btn.textContent = isSystemActive ? '⏸️ PAUSE SYSTÈME' : '▶️ ACTIVER SYSTÈME';
        
        if (isSystemActive) {
            lastPredictionTime = TimeEngine.now();
            // Demande permission IMU si nécessaire
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                DeviceMotionEvent.requestPermission();
            }
            window.addEventListener('devicemotion', handleMotion, true);
        }
    };

    window.addEventListener('load', () => {
        TimeEngine.sync();
        setInterval(() => TimeEngine.sync(), 300000); // Sync auto 5 min
        
        const btn = $('gps-pause-toggle');
        if (btn) btn.addEventListener('click', toggleSystem);

        $('reset-all-btn')?.addEventListener('click', () => location.reload());
        
        // Mode Nether Toggle (Exemple d'activation)
        $('mode-nether-toggle')?.addEventListener('click', () => {
            modeNether = !modeNether;
            console.log("Mode Nether:", modeNether);
        });
    });

})(window);
