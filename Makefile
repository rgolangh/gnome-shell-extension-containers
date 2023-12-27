EXTRA_SOURCES = \
	--extra-source=podman-icon.png \
	--extra-source=classic.css \
	--extra-source=modules


build:
	gnome-extensions pack -f $(EXTRA_SOURCES)

install: build
	gnome-extensions install -f containers@royg.shell-extension.zip

enable:
	gnome-extensions enable containers@royg

debug:
	G_MESSAGES_DEBUG="GNOME Shell" dbus-run-session -- gnome-shell --nested --wayland

all: \
	install \
	enable

.PHONY: build debug enable install all

