EXTRA_SOURCES = \
        podman-icon.png \
        classic.css \
        modules/*

build:
	zip containers@royg.shell-extension.zip extension.js metadata.json stylesheet.css $(EXTRA_SOURCES)

install:
	unzip -o -u containers@royg.shell-extension.zip -d ~/.local/share/gnome-shell/extensions/containers@royg

enable:
	gnome-shell-extension-tool -e containers@royg

debug:
	dbus-run-session -- gnome-shell --nested --wayland

all: \
	build \
	install \
	enable

.PHONY: build debug enable install all

