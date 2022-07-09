EXTRA_SOURCES = \
	--extra-source=podman-icon.png \
	--extra-source=classic.css \
	--extra-source=modules

build: clean
	gnome-extensions pack -f $(EXTRA_SOURCES)

install: build
	gnome-extensions install -f containers@royg.shell-extension.zip

enable: install
	gnome-extensions enable containers@royg

debug: clean install
	dbus-run-session -- gnome-shell --nested --wayland

all: \
	build \
	install \
	enable

clean:
	rm -f containers@royg.shell-extension.zip
	rm -rf ~/.local/share/gnome-shell/extensions/containers@royg/

.PHONY: clean build debug enable install all

