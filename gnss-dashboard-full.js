<script>
        if (typeof math === 'undefined') {
            console.error("⛔ CRITIQUE: math.min.js n'a pas chargé la variable 'math'.");
            alert("Erreur Critique: Librairie math.js manquante !");
        } else {
            console.log("✅ math.js chargé avec succès.");
        }
    </script> <script src="lib/ukf-class.js"></script>      
    <script src="lib/ephem.js"></script>
    <script src="lib/astro.js"></script>

    <script src="gnss-dashboard-full.js"></script>

    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker Enregistré'))
                .catch(err => console.error('Erreur Service Worker:', err));
        }
    </script>
</body>
</html>
