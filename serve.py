#!/usr/bin/env python3
"""Serve this static release locally; no mail ever passes through this server."""
from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class AppHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webmanifest": "application/manifest+json; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main():
    parser = ArgumentParser(description="Open the Sneakernet Social Club app on this computer.")
    parser.add_argument("--port", type=int, default=8787, help="Local port (default: 8787)")
    parser.add_argument("--web", action="store_true", help="Serve only the ready-to-upload web directory")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    root = Path(__file__).resolve().parent
    if args.web:
        root = root / "web"
        if not (root / "index.html").is_file():
            parser.error("web/index.html is missing. Run npm run build:web first.")
    handler = partial(AppHandler, directory=str(root))
    try:
        with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
            print(f"Sneakernet Social Club: http://127.0.0.1:{args.port}/", flush=True)
            print("Keep this address for this desk. Press Ctrl+C to stop the local file server.", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        print("\nLocal file server stopped.")


if __name__ == "__main__":
    main()
