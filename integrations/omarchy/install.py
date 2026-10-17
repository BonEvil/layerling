#!/usr/bin/env python3
"""Install this checkout as Layerling CAD on Omarchy, including SpaceMouse support."""
import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def run(argv, **kw):
    return subprocess.run(argv, check=True, **kw)


def succeeds(argv):
    return subprocess.run(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read-only dependency and source check')
    parser.add_argument('--skip-npm', action='store_true', help='Use dependencies already installed by npm ci')
    args = parser.parse_args()
    if os.geteuid() == 0:
        sys.exit('Run as your desktop user, not root. Only driver installation uses sudo.')
    here = Path(__file__).resolve().parent
    root = here.parent.parent
    manifest = json.loads((here/'dependencies.json').read_text())
    if not shutil.which('pacman'):
        sys.exit('This installer requires Omarchy/Arch Linux.')
    missing = [p for p in manifest['arch_packages'] if not succeeds(['pacman','-Q',p])]
    commands = [c for c in manifest['runtime_commands'] if not shutil.which(c)]
    print('Checkout:', root)
    print('Missing Arch packages:', ', '.join(missing) or 'none')
    print('Missing runtime commands:', ', '.join(commands) or 'none')
    if commands:
        sys.exit('Install the listed runtime commands before proceeding.')
    if args.check:
        return
    # npm ci changes node_modules, so refuse before modifying a running app.
    if succeeds(['systemctl','--user','is-active','--quiet','layerling-desktop.service']):
        sys.exit('Close Layerling, then rerun setup. No app files were changed.')
    if missing:
        if not shutil.which('yay'):
            sys.exit('Install the missing dependencies using an AUR helper (spacenavd is in AUR), then retry.')
        run(['yay','-S','--needed',*missing])
    if not (succeeds(['systemctl','is-enabled','--quiet','spacenavd.service']) and succeeds(['systemctl','is-active','--quiet','spacenavd.service'])):
        run(['sudo','systemctl','enable','--now','spacenavd.service'])
    if args.skip_npm:
        if not (root/'node_modules/next/package.json').exists():
            sys.exit('--skip-npm requires dependencies installed in this checkout.')
    else:
        run(['npm','ci'],cwd=root)
    home = Path.home()
    backup = home/'.local/share/layerling-setup-backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True)
    def write(path, text, executable=False):
        path.parent.mkdir(parents=True,exist_ok=True)
        if path.exists():
            relative = path.relative_to(home)
            saved = backup/relative
            saved.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(path,saved)
        path.write_text(text)
        if executable:
            path.chmod(0o755)
    units = home/'.config/systemd/user'
    for name in ['layerling-cad','layerling-desktop-session']:
        write(home/'.local/bin'/name,(here/name).read_text(),True)
    write(home/'.local/lib/layerling/spacemouse-relay.py',(here/'spacemouse-relay.py').read_text())
    for name in ['layerling-desktop.service','layerling-spacemouse-camera.service']:
        write(units/name,(here/name).read_text())
    # Quote/escape systemd values: paths are never interpreted by a shell.
    def unit_value(value):
        return '"'+str(value).replace('\\','\\\\').replace('"','\\"').replace('%','%%')+'"'
    node_dir = Path(shutil.which('node')).resolve().parent
    npm = Path(shutil.which('npm')).resolve()
    path = f'{node_dir}:/usr/local/bin:/usr/bin:/bin'
    write(units/'layerling.service',f'''[Unit]
Description=Layerling local CAD from BonEvil fork

[Service]
Type=simple
WorkingDirectory={str(root).replace("%", "%%")}
Environment={unit_value('PATH='+path)}
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart={unit_value(npm)} run dev -- --hostname 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=3
KillMode=control-group
TimeoutStopSec=15
''')
    icon = root/'apps/web/public/assets/layerling/layerling-icon-512.png'
    desktop = f'''[Desktop Entry]
Version=1.0
Name=Layerling CAD
Comment=Local 3D CAD with SpaceMouse support
Exec="{home}/.local/bin/layerling-cad"
Terminal=false
Type=Application
Icon={icon}
StartupNotify=true
StartupWMClass=chrome-127.0.0.1__-Default
'''
    write(home/'.local/share/applications/Layerling CAD.desktop',desktop)
    run(['systemctl','--user','daemon-reload'])
    run(['systemd-analyze','--user','verify',str(units/'layerling.service'),str(units/'layerling-desktop.service'),str(units/'layerling-spacemouse-camera.service')])
    print('Installed Layerling CAD launcher. Backups:',backup)
    print('Open Layerling CAD normally; the relay follows the last-window lifecycle.')


if __name__ == '__main__':
    main()
