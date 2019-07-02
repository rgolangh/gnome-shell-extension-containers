# gnome-shell-extension-containers

'containers' is a gnome-shell extension to manage linux container, run by [libpod](https://github.com/containers/libpod).

The underlying management is being done by podman.

# Install from gnome-shell:

You can head to [gnome extensions page](https://extensions.gnome.org/extension/1500/containers/)  

# Install from source:

First pick the right branch by the gnome-shell-X.XX version:
master - follows the gnome-shell shipped with latest fedora release, e.g fedora 30 is 3.32.2
gnome-shell-3.28.2 
...

```
git clone https://github.com/rgolangh/gnome-shell-extension-containers \
          ~/.local/share/gnome-shell/extensions/containers@rgolan
```

To enable the extension use gnome-tweak-tool -> Extensions -> toggle 'Containers'

<p>
  <img src="screenshot.png" width="350" title="gnome-shell-extension-containers">
</p>
