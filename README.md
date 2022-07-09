# gnome-shell-extension-containers

**Containers** is a gnome-shell extension to manage linux container, run by [libpod](https://github.com/containers/libpod) and <https://podman.io>

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

## Install using your browser

See the [gnome extensions page](https://extensions.gnome.org/extension/1500/containers/)  

## Install from source

Checkout `master` branch for latest available, or `gnome-shell-x.xx` for a specific version.

Clone, Pack, and Install

```console
git clone https://github.com/rgolangh/gnome-shell-extension-containers
make all
```

Enable using `make enable` or using 'Tweaks' -> Extensions -> toggle 'Containers'

<p>
  <img src="screenshot.png" width="350" title="gnome-shell-extension-containers">
</p>
