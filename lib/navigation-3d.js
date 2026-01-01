/**
 * 3D SPATIAL ENGINE (ECEF)
 */
const Nav3DEngine = {
    dist3D: math.bignumber(0),

    calculate(accelX, accelY, accelZ, lat, lon, alt) {
        // 1. FORCE G RÉSULTANTE (Vecteur Magnitude)
        const gTotal = Math.sqrt(accelX**2 + accelY**2 + accelZ**2) / 9.80665;
        document.getElementById('g-force-resultant').innerText = gTotal.toFixed(3) + " G";

        // 2. COORDONNÉES X,Y,Z GÉOCENTRIQUES (ECEF)
        const R = 6371000;
        const radLat = lat * Math.PI / 180;
        const radLon = lon * Math.PI / 180;
        
        const x = (R + alt) * Math.cos(radLat) * Math.cos(radLon);
        const y = (R + alt) * Math.cos(radLat) * Math.sin(radLon);
        const z = (R + alt) * Math.sin(radLat);

        document.getElementById('coord-x').innerText = x.toFixed(2);
        document.getElementById('coord-y').innerText = y.toFixed(2);
        document.getElementById('coord-z').innerText = z.toFixed(2);
    }
};
