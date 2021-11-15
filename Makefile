EXTRA_SOURCES = \
	--extra-source=podman-icon.png \
	--extra-source=classic.css \
	--extra-source=modules


build:
	gnome-extensions pack -f $(EXTRA_SOURCES)

install:
	gnome-extensions install -f containers@royg.shell-extension.zip

enable:
	gnome-extensions enable containers@royg

debug:
	dbus-run-session -- gnome-shell --nested --wayland

all: \
	build \
	install \
	enable

.PHONY: build debug enable install all

