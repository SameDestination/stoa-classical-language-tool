#!/usr/bin/env python3
"""Tiny loopback-only server for STOA's losslessly compressed runtime assets."""

from __future__ import annotations

import os
from email.utils import formatdate
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from secrets import token_hex
from threading import Timer
from urllib.parse import urlencode
import webbrowser


HOST = "127.0.0.1"
PREFERRED_PORT = 8765
LAUNCH_QUERY_PARAMETER = "stoa-launch"


class StoaHandler(SimpleHTTPRequestHandler):
    """Serve `.gz` fallbacks with transparent HTTP content decoding."""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "application/javascript; charset=utf-8",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
    }

    def parse_request(self) -> bool:
        if not super().parse_request():
            return False
        # Answer only requests addressed to this server. Otherwise a website
        # could point its own host name at 127.0.0.1 (DNS rebinding) and read
        # files from the Portable folder, including saved projects.
        port = self.server.server_address[1]
        host = (self.headers.get("Host") or "").strip().lower()
        if host not in {f"{HOST}:{port}", f"localhost:{port}"}:
            self.send_error(403, "Forbidden")
            return False
        return True

    def list_directory(self, path):  # type: ignore[override]
        self.send_error(404, "File not found")
        return None

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_head(self):  # type: ignore[override]
        requested_path = Path(self.translate_path(self.path))
        compressed_path = Path(f"{requested_path}.gz")
        if not requested_path.exists() and compressed_path.is_file():
            try:
                handle = compressed_path.open("rb")
            except OSError:
                self.send_error(404, "File not found")
                return None
            metadata = compressed_path.stat()
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(str(requested_path)))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Content-Length", str(metadata.st_size))
            self.send_header("Last-Modified", formatdate(metadata.st_mtime, usegmt=True))
            self.end_headers()
            return handle
        return super().send_head()


def create_server() -> ThreadingHTTPServer:
    try:
        return ThreadingHTTPServer((HOST, PREFERRED_PORT), StoaHandler)
    except OSError:
        return ThreadingHTTPServer((HOST, 0), StoaHandler)


def main() -> None:
    os.chdir(Path(__file__).resolve().parent)
    server = create_server()
    port = server.server_address[1]
    # A unique marker makes a launcher invocation an explicit new portable-app
    # session. The renderer consumes and removes it before React hydration.
    query = urlencode({LAUNCH_QUERY_PARAMETER: token_hex(16)})
    url = f"http://{HOST}:{port}/?{query}"
    print(f"STOA is running at {url}")
    if port != PREFERRED_PORT:
        print(f"Port {PREFERRED_PORT} was busy, so this session is using port {port}.")
        print("Use the new browser tab opened by this launcher, not an older STOA tab or bookmark.")
    print("Keep this window open while using STOA. Press Ctrl+C to stop.")
    if os.environ.get("STOA_NO_BROWSER") != "1":
        Timer(0.35, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSTOA stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
