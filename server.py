#!/usr/bin/env python3
"""
My Avatar App - Local Server
双击运行或在终端执行: python3 server.py
然后浏览器打开 http://localhost:8000
"""
import http.server
import json
import urllib.request
import urllib.error
import ssl
import os
import sys
import gzip
import webbrowser
from functools import partial

# Fix macOS Python SSL certificate issue
def get_ssl_context():
    ctx = ssl.create_default_context()
    try:
        ctx.load_default_certs()
    except Exception:
        pass
    # If certs still don't work, try certifi
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
        return ctx
    except ImportError:
        pass
    # Last resort: disable verification (not ideal but works locally)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

SSL_CTX = get_ssl_context()

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))

class AvatarHandler(http.server.SimpleHTTPRequestHandler):
    # Add MIME types for 3D model files
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json',
        '.vrm': 'application/octet-stream',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for all responses
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        # Gzip compression for large files (.glb, .js, .html, .css)
        path = self.translate_path(self.path)
        if os.path.isfile(path) and any(path.endswith(ext) for ext in ['.glb', '.js', '.html', '.css', '.json']):
            accept_enc = self.headers.get('Accept-Encoding', '')
            if 'gzip' in accept_enc:
                try:
                    with open(path, 'rb') as f:
                        content = f.read()
                    compressed = gzip.compress(content, compresslevel=6)
                    self.send_response(200)
                    ctype = self.guess_type(path)
                    self.send_header('Content-Type', ctype)
                    self.send_header('Content-Encoding', 'gzip')
                    self.send_header('Content-Length', len(compressed))
                    self.end_headers()
                    self.wfile.write(compressed)
                    return
                except Exception:
                    pass
        super().do_GET()

    def do_POST(self):
        # Proxy: /api/fish-tts → Fish Audio API
        if self.path == '/api/fish-tts':
            self.proxy_fish_tts()
        else:
            self.send_error(404)

    def proxy_fish_tts(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            fish_key = data.pop('_fish_key', '')
            if not fish_key:
                self.send_json_error(400, 'Missing Fish Audio API key')
                return

            req = urllib.request.Request(
                'https://api.fish.audio/v1/tts',
                data=json.dumps(data).encode('utf-8'),
                headers={
                    'Authorization': f'Bearer {fish_key}',
                    'Content-Type': 'application/json'
                },
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as resp:
                audio_data = resp.read()
                content_type = resp.headers.get('Content-Type', 'audio/mpeg')

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(audio_data))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(audio_data)

        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='replace')
            print(f'[Fish Audio Error] {e.code}: {err_body}')
            self.send_json_error(e.code, f'Fish Audio API error: {err_body}')
        except Exception as e:
            print(f'[Proxy Error] {e}')
            self.send_json_error(500, str(e))

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def send_json_error(self, code, msg):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'error': msg}).encode())

    def log_message(self, format, *args):
        # Cleaner logging
        msg = format % args
        if '/api/' in msg or 'POST' in msg:
            print(f'  {msg}')

def kill_old_server():
    """Kill any existing process on our port"""
    import subprocess
    try:
        result = subprocess.run(['lsof', '-ti', f':{PORT}'], capture_output=True, text=True)
        pids = result.stdout.strip().split('\n')
        for pid in pids:
            if pid:
                subprocess.run(['kill', '-9', pid], capture_output=True)
        if any(p for p in pids if p):
            import time; time.sleep(0.5)
    except:
        pass

def main():
    os.chdir(DIR)
    kill_old_server()
    handler = AvatarHandler
    with http.server.HTTPServer(('', PORT), handler) as server:
        server.socket.setsockopt(__import__('socket').SOL_SOCKET, __import__('socket').SO_REUSEADDR, 1)
        url = f'http://localhost:{PORT}'
        print(f'\n  🤖 My Avatar App 运行中')
        print(f'  📍 打开浏览器访问: {url}')
        print(f'  🛑 关闭此窗口即可停止\n')
        try:
            webbrowser.open(url)
        except:
            pass
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\n  已停止')

if __name__ == '__main__':
    main()
