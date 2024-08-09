# gnome-shell-extension-containers

**Containers** is a gnome-shell extension to manage linux container with [podman](https://podman.io/)

Supported actions:
- start
- stop 
- remove
- pause
- restart
- top resources
- shell - opens a shell in a new termainl
- stats - open statistics in a new terminal, updating live
- logs  - following logs in a new termianl
- view and copy most of the `inspect` info

# Install using your browser 

See the [gnome extensions page](https://extensions.gnome.org/extension/1500/containers/)  

# Install from source

Checkout `main` branch for latest Gnome Shell version available.
For older Gnome Shell versions see `gnome-shell-x.xx` branches per version.

Clone, Pack, and Install

```console
$ git clone https://github.com/rgolangh/gnome-shell-extension-containers
$ make all
```

Enalble using `make enable` or using 'Tweaks' -> Extensions -> toggle 'Containers'

<p>
  <img src="screenshot.png" width="350" title="gnome-shell-extension-containers">
</p>

# Developing / Hacking

Clone and make your changes, and then use this to spin an inline gnome-shell in a dedicated window (works with your system dbus):
```
make debug
```


