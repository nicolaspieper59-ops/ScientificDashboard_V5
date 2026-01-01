/**
 * OMNISCIENCE V100 - 3D INERTIAL NAVIGATION
 */
const Navigation3D = {
    x: 4617623, // Coordonnées approx Marseille ECEF
    y: 433134,
    z: 4368164,

    update(vx, vy, vz, dt) {
        this.x += vx * dt;
        this.y += vy * dt;
        this.z += vz * dt;

        document.getElementById('coord-x').innerText = this.x.toFixed(2);
        document.getElementById('coord-y').innerText = this.y.toFixed(2);
        document.getElementById('coord-z').innerText = this.z.toFixed(2);
    }
};
