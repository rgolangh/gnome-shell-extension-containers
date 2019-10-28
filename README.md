# gnome-shell-extension-containers

'containers' is a gnome-shell extension to manage linux container, run by [libpod](https://github.com/containers/libpod).

The underlying management is being done by podman.

# Install using your browser 

See the [gnome extensions page](https://extensions.gnome.org/extension/1500/containers/)  

# Install from source

First pick the right branch by the gnome-shell-X.XX version: 

| branch | gnome-shell version |
| --- | --- |
| master | 3.32.2 |
| 3.28.3 | 3.28.3 |


```
git clone https://github.com/rgolangh/gnome-shell-extension-containers \
          ~/.local/share/gnome-shell/extensions/containers@rgolan
```

To enable the extension use gnome-tweak-tool -> Extensions -> toggle 'Containers'
or:
```bash
gnome-shell-extension-tool -e containers@royg
```
<p>
  <img src="screenshot.png" width="350" title="gnome-shell-extension-containers">
</p>
