# Omarchy desktop and SpaceMouse setup

This fork includes direct camera control for a 3Dconnexion SpaceMouse Wireless,
plus a desktop launcher that starts the app and relay together and stops them
about three seconds after the last Layerling window closes. The system
`spacenavd` driver stays available to other apps.

From a checkout of **BonEvil/layerling**:

```sh
npm run setup:omarchy
```

The setup installs missing `spacenavd`, `libspnav`, and `python` Arch packages
using `yay`, enables `spacenavd.service`, runs `npm ci`, and installs the
**Layerling CAD** launcher and user services. Run as your desktop user; sudo is
used only for the system driver. Node/npm, Omarchy, Hyprland, and systemd must
already be available. Close Layerling before installing or updating its setup.

```sh
python integrations/omarchy/install.py --check     # read-only prerequisites
python integrations/omarchy/install.py --skip-npm # dependencies already installed
```

The launcher serves this checkout on `127.0.0.1:3000`. The read-only input relay
uses `libspnav` and serves events on `127.0.0.1:3001`, accepting only the local
Layerling origin. It never injects pointer motion, mouse clicks, or system keys.
Other hosted Layerling copies do not connect to the relay. Keep these ports free.

| SpaceMouse input | Camera action |
| --- | --- |
| Twist | Horizontal orbit |
| Tilt forward/back | Vertical orbit |
| Tilt sideways | Roll |
| Slide sideways | Horizontal pan |
| Lift/press | Vertical pan |
| Push/pull | Zoom |
| Left button | Home |
| Right button | Fit selected objects (select an object first) |

Directions and a +/-500 input range were calibrated with a SpaceMouse Wireless
using the Universal Receiver. The center deadzone is 35. Motion repeats keep
steady deflections moving. Input applies only to the focused editor and stops
when the input stream becomes stale. Reload the editor after camera code changes.

User services are `layerling.service`, `layerling-desktop.service`, and
`layerling-spacemouse-camera.service`. The relay is copied to
`~/.local/lib/layerling/spacemouse-relay.py`; setup files are backed up under
`~/.local/share/layerling-setup-backups/`. No app-specific services are enabled
at login: they start through the app launcher.

To update this fork, close Layerling, pull the changes, and run
`npm run setup:omarchy` again. The setup always points the launcher at the
checkout from which it runs, so keep that checkout in a permanent location.

To stop the relay manually:

```sh
systemctl --user stop layerling-spacemouse-camera
```
