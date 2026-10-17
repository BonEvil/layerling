#!/usr/bin/env python3
"""Read-only SpaceMouse stream for the local Layerling camera experiment."""
import atexit
import ctypes as C
import json
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class Motion(C.Structure):
    _fields_ = [(k, C.c_int) for k in ('type','x','y','z','rx','ry','rz')] + [('period',C.c_uint),('data',C.POINTER(C.c_int))]
class Button(C.Structure):
    _fields_ = [(k,C.c_int) for k in ("type","press","bnum")]
class Event(C.Union):
    _fields_ = [('type',C.c_int),('motion',Motion),('button',Button),('padding',C.c_byte*64)]
lib=C.CDLL('libspnav.so.0')
if lib.spnav_open()<0:
    raise SystemExit('Cannot connect to spacenavd')
# Keep steady off-center deflections alive through the stale-input cutoff.
previous_repeat = lib.spnav_cfg_get_repeat()
if lib.spnav_cfg_set_repeat(16) < 0:
    raise SystemExit('Cannot enable spacenavd motion repeats')
atexit.register(lambda: lib.spnav_cfg_set_repeat(previous_repeat))
def stop(signum, frame):
    raise SystemExit(0)
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
latest={'yaw':0,'pitch':0,'pan':0,'zoom':0,'roll':0,'panVertical':0}
last=0.0
count=0
home_count=0
focus_count=0
right_button_down=False
button_down=False
def read():
    global latest,last,count,home_count,button_down,focus_count,right_button_down
    e=Event()
    while True:
        while lib.spnav_poll_event(C.byref(e)):
            if e.type==1:
                latest={'yaw':e.motion.ry,'pitch':e.motion.rx,'pan':e.motion.x,'zoom':e.motion.z,'roll':e.motion.rz,'panVertical':e.motion.y}
                last=time.monotonic()
                count+=1
            elif e.type==2 and e.button.bnum==0:
                down=bool(e.button.press)
                if down and not button_down:
                    home_count+=1
                button_down=down
            elif e.type==2 and e.button.bnum==1:
                down=bool(e.button.press)
                if down and not right_button_down:
                    focus_count+=1
                right_button_down=down
        time.sleep(.004)
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get('Origin') not in (None,'http://127.0.0.1:3000','http://localhost:3000'):
            self.send_error(403);return
        if self.path not in ('/events','/status'):
            self.send_error(404);return
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin','http://127.0.0.1:3000'))
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Type','text/event-stream' if self.path=='/events' else 'application/json')
        self.end_headers()
        if self.path=='/status':
            self.wfile.write(json.dumps({'home_presses':home_count,'focus_presses':focus_count,'motion_events':count,'axes':latest,'age_seconds':round(time.monotonic()-last,2) if last else None}).encode());return
        try:
            while True:
                axes=latest if time.monotonic()-last<.15 else {'yaw':0,'pitch':0,'pan':0,'zoom':0,'roll':0,'panVertical':0}
                self.wfile.write(('data: '+json.dumps({**axes,'homePresses':home_count,'focusPresses':focus_count})+'\n\n').encode());self.wfile.flush();time.sleep(1/60)
        except (BrokenPipeError,ConnectionResetError):
            pass
    def log_message(self,*args):pass
threading.Thread(target=read,daemon=True).start()
print('SpaceMouse camera relay listening on loopback port 3001',flush=True)
ThreadingHTTPServer(('127.0.0.1',3001),Handler).serve_forever()
