import http.server
import socketserver
import json
import os
import mimetypes
import time
import hashlib
import hmac
import urllib.request
import urllib.error
import threading

PORT = int(os.environ.get("PORT", 3000))
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

APP_PIN = os.environ.get("APP_PIN", "1234")
AUTH_TOKEN = hashlib.sha256(f"benedito_auth_{APP_PIN}".encode('utf-8')).hexdigest()

ACCESS_ID = os.environ.get("TUYA_ACCESS_ID", "5jejpuygmpjse3vpc8ct")
ACCESS_SECRET = os.environ.get("TUYA_ACCESS_SECRET", "4286596817f94549a81ac43dfdab1d08")
ENDPOINT = "https://openapi.tuyaus.com"

# Dispositivos Casa BENEDITO
DEVICES = [
    {
        "id": "eb0c2bc123fe9329d5uzfi",
        "name": "PORTEIRA",
        "room": "Entrada Principal",
        "categoryLabel": "Portão Automático",
        "type": "gate",
        "icon": "🚪",
        "online": True,
        "state": False,
        "group": "access"
    },
    {
        "id": "eba17a82c93dce8ff521ri",
        "name": "Heat Pump1",
        "room": "Área Externa",
        "categoryLabel": "Bomba de Calor / Aquecimento",
        "type": "climate",
        "icon": "♨️",
        "online": True,
        "state": False,
        "temp": 30,
        "temp_current": 25,
        "mode": "eco",
        "group": "utility"
    },
    {
        "id": "ebeb785d97910cf4926gpa",
        "name": "Sala",
        "room": "Sala de Estar",
        "categoryLabel": "Iluminação",
        "type": "light",
        "icon": "💡",
        "online": True,
        "state": False,
        "group": "living"
    },
    {
        "id": "eb79a14ded479609e6oew1",
        "name": "Gramado",
        "room": "Jardim & Área Externa",
        "categoryLabel": "Iluminação Gramado",
        "type": "light",
        "icon": "🌱",
        "online": False,
        "state": False,
        "group": "utility"
    },
    {
        "id": "ebd69334e2329acb42ueuq",
        "name": "Cozinha",
        "room": "Cozinha",
        "categoryLabel": "Iluminação",
        "type": "light",
        "icon": "🍳",
        "online": False,
        "state": False,
        "group": "living"
    },
    {
        "id": "ebaa1acad41d62b7c6cyte",
        "name": "Quarto",
        "room": "Dormitório",
        "categoryLabel": "Iluminação",
        "type": "light",
        "icon": "🛏️",
        "online": False,
        "state": False,
        "group": "living"
    },
    {
        "id": "eb5a0293865b098d5dxqvq",
        "name": "Muro",
        "room": "Perímetro",
        "categoryLabel": "Interruptor Muro",
        "type": "light",
        "icon": "🧱",
        "online": False,
        "state": False,
        "group": "access"
    },
    {
        "id": "eb955ac00c7bed821fgyxw",
        "name": "Poço",
        "room": "Abastecimento",
        "categoryLabel": "Bomba d'Água",
        "type": "switch",
        "icon": "💧",
        "online": False,
        "state": False,
        "group": "utility"
    },
    {
        "id": "ebe225d89f4d353dbdatue",
        "name": "ZEFA",
        "room": "Geral",
        "categoryLabel": "Interruptor Auxiliar",
        "type": "switch",
        "icon": "⚡",
        "online": False,
        "state": False,
        "group": "utility"
    }
]

token_cache = {"token": None, "expire_at": 0}

def get_tuya_token():
    now = time.time()
    if token_cache["token"] and now < token_cache["expire_at"]:
        return token_cache["token"]
        
    t = str(int(now * 1000))
    url_path = "/v1.0/token?grant_type=1"
    method = "GET"
    body_hash = hashlib.sha256(b"").hexdigest()
    string_to_sign = f"{method}\n{body_hash}\n\n{url_path}"
    sign_str = ACCESS_ID + t + string_to_sign
    sign = hmac.new(ACCESS_SECRET.encode('utf-8'), sign_str.encode('utf-8'), hashlib.sha256).hexdigest().upper()
    
    headers = {
        "client_id": ACCESS_ID,
        "sign": sign,
        "t": t,
        "sign_method": "HMAC-SHA256"
    }
    
    req = urllib.request.Request(ENDPOINT + url_path, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            token = data.get("result", {}).get("access_token")
            expire = data.get("result", {}).get("expire_time", 7200)
            token_cache["token"] = token
            token_cache["expire_at"] = now + expire - 60
            return token
    except Exception as e:
        print("[Tuya Token Error]:", e)
        return None

def tuya_api_call(method, url_path, body=None):
    token = get_tuya_token()
    if not token:
        return None
    t = str(int(time.time() * 1000))
    
    if body is not None:
        body_bytes = json.dumps(body).encode('utf-8')
        body_hash = hashlib.sha256(body_bytes).hexdigest()
    else:
        body_bytes = None
        body_hash = hashlib.sha256(b"").hexdigest()
        
    string_to_sign = f"{method}\n{body_hash}\n\n{url_path}"
    sign_str = ACCESS_ID + token + t + string_to_sign
    sign = hmac.new(ACCESS_SECRET.encode('utf-8'), sign_str.encode('utf-8'), hashlib.sha256).hexdigest().upper()
    
    headers = {
        "client_id": ACCESS_ID,
        "access_token": token,
        "sign": sign,
        "t": t,
        "sign_method": "HMAC-SHA256",
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(ENDPOINT + url_path, data=body_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return None

def sync_live_device_statuses():
    """Consulta o status real dos dispositivos na Tuya Cloud e atualiza os estados locais"""
    for dev in DEVICES:
        dev_id = dev["id"]
        res = tuya_api_call("GET", f"/v1.0/devices/{dev_id}/status")
        if res and res.get("success"):
            dps = {dp["code"]: dp["value"] for dp in res.get("result", [])}
            
            # Heat Pump1
            if dev["type"] == "climate":
                if "switch" in dps:
                    dev["state"] = bool(dps["switch"])
                if "temp_set" in dps:
                    dev["temp"] = int(dps["temp_set"])
                if "temp_current" in dps:
                    dev["temp_current"] = int(dps["temp_current"])
                if "mode" in dps:
                    dev["mode"] = str(dps["mode"])
            else:
                # Interruptores (switch_1 ou switch)
                if "switch_1" in dps:
                    dev["state"] = bool(dps["switch_1"])
                elif "switch" in dps:
                    dev["state"] = bool(dps["switch"])

def background_tuya_poller():
    while True:
        try:
            sync_live_device_statuses()
        except Exception as e:
            pass
        time.sleep(6)

# Inicia sincronização em segundo plano
threading.Thread(target=background_tuya_poller, daemon=True).start()

def send_tuya_command(device_id, code, value):
    body = {"commands": [{"code": code, "value": value}]}
    res = tuya_api_call("POST", f"/v1.0/devices/{device_id}/commands", body)
    if res and res.get("success"):
        return True
    return False

class DashboardRequestHandler(http.server.SimpleHTTPRequestHandler):
    def is_authorized(self):
        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            return token == AUTH_TOKEN
        return False

    def do_GET(self):
        if self.path == "/api/devices":
            if not self.is_authorized():
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Unauthorized"}).encode('utf-8'))
                return

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"devices": DEVICES}, ensure_ascii=False).encode('utf-8'))
            return

        clean_path = self.path.split('?')[0]
        if clean_path == "/":
            clean_path = "/index.html"
            
        file_path = os.path.join(PUBLIC_DIR, clean_path.lstrip('/'))
        if os.path.exists(file_path) and os.path.isfile(file_path):
            self.send_response(200)
            mime_type, _ = mimetypes.guess_type(file_path)
            self.send_header("Content-Type", (mime_type or "application/octet-stream") + "; charset=utf-8")
            self.end_headers()
            with open(file_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, "Arquivo não encontrado")

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            body = json.loads(post_data.decode('utf-8')) if post_data else {}
        except:
            body = {}

        if self.path == "/api/auth":
            pin = body.get("pin", "")
            authenticated = (str(pin).strip() == str(APP_PIN).strip())
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            resp_body = {
                "authenticated": authenticated,
                "token": AUTH_TOKEN if authenticated else None
            }
            self.wfile.write(json.dumps(resp_body).encode('utf-8'))
            return

        if not self.is_authorized():
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Unauthorized"}).encode('utf-8'))
            return

        if self.path.startswith("/api/device/") and self.path.endswith("/toggle"):
            dev_id = self.path.split("/")[3]
            dev = next((d for d in DEVICES if d["id"] == dev_id), None)
            if dev:
                dev["state"] = not dev["state"]
                cmd_code = "switch" if dev["type"] == "climate" else "switch_1"
                send_tuya_command(dev_id, cmd_code, dev["state"])

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "device": dev}, ensure_ascii=False).encode('utf-8'))
                return

        if self.path.startswith("/api/device/") and self.path.endswith("/set"):
            dev_id = self.path.split("/")[3]
            dev = next((d for d in DEVICES if d["id"] == dev_id), None)
            if dev:
                if "temp" in body:
                    dev["temp"] = body["temp"]
                    send_tuya_command(dev_id, "temp_set", dev["temp"])
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "device": dev}, ensure_ascii=False).encode('utf-8'))
                return

        if self.path == "/api/scene/all-off":
            for d in DEVICES:
                if d["type"] != "gate":
                    d["state"] = False
                    cmd_code = "switch" if d["type"] == "climate" else "switch_1"
                    send_tuya_command(d["id"], cmd_code, False)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

        self.send_error(404, "Endpoint não encontrado")

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), DashboardRequestHandler) as httpd:
        print(f"🔒 DASHBOARD CASA BENEDITO RODANDO NA PORTA {PORT}")
        httpd.serve_forever()
