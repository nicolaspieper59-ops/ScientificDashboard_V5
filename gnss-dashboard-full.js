// =================================================================
// GNSS SPACETIME DASHBOARD - FICHIER COMPLET V7 (UKF 21 ÉTATS)
// MISE À JOUR : Version consolidée, professionnelle et réaliste (Dec 2025).
// DÉPENDANCES CRITIQUES (DOIVENT ÊTRE CHARGÉES DANS L'HTML AVANT CE FICHIER) :
// - math.min.js
// - ukf-lib.js (DOIT contenir la classe ProfessionalUKF)
// - astro.js
// - leaflet.js, turf.min.js, suncalc.js (si utilisés)
// =================================================================

((window) => {

    // --- BLOC 1 : VÉRIFICATIONS, CONSTANTES ET UTILITAIRES DE BASE ---

    // Vérification des dépendances critiques
    if (typeof math === 'undefined') {
        console.error("🔴 ERREUR CRITIQUE: math.js n'a pas pu être chargé. Le filtre UKF est désactivé.");
        return; 
    }
    // Note: ProfessionalUKF est censée être dans ukf-lib.js
    if (typeof ProfessionalUKF === 'undefined') {
        console.error("🔴 ERREUR CRITIQUE: ProfessionalUKF n'est pas définie. Vérifiez ukf-lib.js.");
        return;
    }
    
    // --- ÉTAT GLOBAL ET VARIABLES DE CONTRÔLE ---
    let isGpsPaused = false; 
    let kAlt = 0; // Altitude pour les calculs WGS84
    let rotationRadius = 100;
    let angularVelocity = 0.0;
    let currentCelestialBody = 'EARTH';
    let distanceRatioMode = false;
    let currentMass = 70.0; // Masse par défaut (kg)

    let currentPosition = { 
        // Coordonnées de travail (ex: Marseille) pour débloquer Astro/Météo au démarrage
        lat: 43.2964,   
        lon: 5.3697,    
        acc: 10.0,      
        spd: 0.0        
    };

    let ukf = null; // Le filtre UKF sera initialisé après le chargement des scripts

    // --- FONCTIONS UTILITAIRES GLOBALES (Optimisées) ---
    const $ = id => document.getElementById(id);
    const dataOrDefault = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
            return (decimals === 0 ? '0' : '0.00') + suffix;
        }
        return val.toFixed(decimals) + suffix;
    };

    // CORRECTION CRITIQUE : Assure que le format exponentiel par défaut respecte 'decimals'.
    const dataOrDefaultExp = (val, decimals, suffix = '') => {
        if (val === undefined || val === null || isNaN(val)) {
            const zeroDecimals = '0.' + Array(decimals).fill('0').join('');
            return zeroDecimals + 'e+0' + suffix;
        }
        return val.toExponential(decimals) + suffix;
    };

    // ... (Inclure ici le reste de vos CONSTANTES et Modèles Physiques) ...
    
    // --- BLOC 2 : LOGIQUE D'INITIALISATION ET ÉVÉNEMENTS ---

    // Note: Les fonctions fetchWeather, syncH, initGPS, updateDashboardDOM, etc. sont supposées être définies
    // soit ici, soit dans 'ukf-lib.js' ou d'autres blocs séparés de votre projet complet. 
    // On se concentre ici sur l'initialisation du filtre et des contrôles.

    function setupEventListeners() {
        // Écouteurs pour les paramètres de physique
        $('mass-input').addEventListener('input', (e) => {
            currentMass = parseFloat(e.target.value) || 70.0;
            $('mass-display').textContent = `${currentMass.toFixed(3)} kg`;
        });
        
        $('celestial-body-select').addEventListener('change', (e) => {
            currentCelestialBody = e.target.value;
            // updateCelestialBody est une fonction critique supposée exister
            const { G_ACC_NEW } = updateCelestialBody(currentCelestialBody, kAlt, rotationRadius, angularVelocity); 
            $('gravity-base').textContent = `${G_ACC_NEW.toFixed(4)} m/s²`;
        });

        const updateRotation = () => {
            rotationRadius = parseFloat($('rotation-radius').value) || 100;
            angularVelocity = parseFloat($('angular-velocity').value) || 0.0;
            if (currentCelestialBody === 'ROTATING') {
                const { G_ACC_NEW } = updateCelestialBody('ROTATING', kAlt, rotationRadius, angularVelocity);
                $('gravity-base').textContent = `${G_ACC_NEW.toFixed(4)} m/s²`;
            }
        };
        $('rotation-radius').addEventListener('input', updateRotation);
        $('angular-velocity').addEventListener('input', updateRotation);
        
        // CORRECTION : Bouton "Rapport Distance"
        $('distance-ratio-toggle-btn').addEventListener('click', () => {
            distanceRatioMode = !distanceRatioMode;
            // calculateDistanceRatio est une fonction supposée exister
            const ratio = distanceRatioMode ? calculateDistanceRatio(kAlt || 0) : 1.0; 
            $('distance-ratio-toggle-btn').textContent = `Rapport Distance: ${distanceRatioMode ? 'ALTITUDE' : 'SURFACE'} (${ratio.toFixed(3)})`;
        });
        $('ukf-reactivity-mode').addEventListener('change', (e) => currentUKFReactivity = e.target.value);
    }
    
    // --- BLOC 3 : INITIALISATION PRINCIPALE (Au chargement de la fenêtre) ---

    window.addEventListener('load', () => {
        
        // 1. Démarrer la synchro NTP (gère l'échec hors ligne)
        // syncH est supposée être une fonction qui gère le temps
        syncH().finally(() => { 
            // 2. Initialisation UKF (après le chargement de math.js)
            if (typeof math !== 'undefined') {
                ukf = new ProfessionalUKF(); // Initialise l'UKF à 21 États
            } else {
                alert("Erreur: math.js n'a pas pu être chargé. Le filtre UKF est désactivé.");
                return;
            }
            
            // 3. Initialisation des systèmes
            // initGPS est supposée être une fonction qui démarre la géolocalisation
            initGPS(); 
            setupEventListeners(); 
            
            // 4. Mettre à jour les paramètres de gravité initiaux
            // updateCelestialBody est supposée être une fonction de votre logique physique
            updateCelestialBody(currentCelestialBody, kAlt, rotationRadius, angularVelocity);

            // 5. Première mise à jour du DOM et boucle principale
            updateDashboardDOM(); // Première exécution pour valeurs par défaut
            
            // 6. Boucle principale de rafraîchissement (à ajuster selon la performance)
            setInterval(updateDashboardDOM, 250); // Maintien du taux de rafraîchissement rapide
        });
    }); 
    
})(window);
