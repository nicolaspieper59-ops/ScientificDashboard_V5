import http.server
import socketserver
import json

class ThermalHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        # Lecture directe du noyau (Zéro Fiction)
        try:
            with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                # La valeur est en millidegrés (ex: 35000 pour 35°C)
                raw_temp = f.read().strip()
                temp_c = float(raw_temp) / 1000.0
        except:
            temp_c = 0.0

        # Envoi des headers CORS pour que Kiwi Browser accepte la donnée
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = json.dumps({'temp': temp_c})
        self.wfile.write(response.encode())

    # Désactiver les logs pour ne pas ralentir le CPU
    def log_message(self, format, *args):
        return

PORT = 5000
with socketserver.TCPServer(("", PORT), ThermalHandler) as httpd:
    print(f"Suture Thermique active sur le port {PORT}")
    httpd.serve_forever()
