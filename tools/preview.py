#!/usr/bin/env python3
"""Serve the site on localhost with byte-range support for video seeking.

Usage: python tools/preview.py [--port 8000]
"""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        self._range_length = None
        requested = self.headers.get("Range")
        path = Path(self.translate_path(self.path))
        # Ignore conditional ranges rather than risk serving an outdated fragment.
        if not requested or self.headers.get("If-Range") or not path.is_file():
            return super().send_head()
        try:
            source = path.open("rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        stat = path.stat()
        size = stat.st_size
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested.strip())
        try:
            if not match or not any(match.groups()) or size == 0:
                raise ValueError
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            else:
                suffix = int(last)
                if suffix == 0:
                    raise ValueError
                start, end = max(0, size - suffix), size - 1
            if not 0 <= start <= end < size:
                raise ValueError
        except ValueError:
            source.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        self._range_length = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Content-Length", str(self._range_length))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.end_headers()
        source.seek(start)
        return source

    def copyfile(self, source, output):
        try:
            if self._range_length is None:
                return super().copyfile(source, output)
            remaining = self._range_length
            while remaining:
                chunk = source.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                output.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            # Switching playback versions cancels the previous request normally.
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    handler = partial(PreviewHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Preview: http://localhost:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
