from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys

# A fresh browser requests Admin scripts together; the default backlog of 5 resets some connections.
ThreadingHTTPServer.request_queue_size = 128
with ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), partial(SimpleHTTPRequestHandler, directory='public')) as server:
    server.serve_forever()
