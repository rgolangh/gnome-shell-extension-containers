VERSION ?= $(shell git describe --tags --always)
TARGET_FILE := containers@royg.shell-extension_$(VERSION).zip
EXTRA_SOURCES = \
	--extra-source=podman-icon.png \
	--extra-source=classic.css \
	--extra-source=modules

build:
	gnome-extensions pack -f $(EXTRA_SOURCES) src/
	mv containers@royg.shell-extension.zip $(TARGET_FILE)

install: build
	gnome-extensions install -f $(TARGET_FILE)

enable:
	gnome-extensions enable containers@royg

debug:
	G_MESSAGES_DEBUG="GNOME Shell" dbus-run-session -- gnome-shell --nested --wayland

all: \
	install \
	enable

.PHONY: build debug enable install all

