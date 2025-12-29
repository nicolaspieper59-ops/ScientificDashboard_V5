const AstroEngine = {
    pointCloud: [],
    updateAstro(lat, lon) {
        if (typeof Ephem === 'undefined') return;
        const obs = new Ephem.Observer(lat, lon, 0);
        const sun = Ephem.Sun.get(new Date(), obs);
        document.getElementById('sun-alt').textContent = sun.altitude.toFixed(3) + "°";
    },
    scan(pos, gyro) {
        const range = 2.0 + Math.random() * 5; 
        this.pointCloud.push({
            x: pos.x + range * Math.sin(gyro.alpha * Math.PI/180),
            y: pos.y + range * Math.cos(gyro.beta * Math.PI/180),
            z: pos.z + range * Math.sin(gyro.gamma * Math.PI/180)
        });
    }
};
