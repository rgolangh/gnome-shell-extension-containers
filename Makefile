EXTRA_SOURCES = \
	--extra-source=podman-icon.png

build:
	gnome-extensions pack -f $(EXTRA_SOURCES)

install:
	gnome-extensions install -f containers@royg.shell-extension.zip

enable:
	gnome-extensions enable containers@royg

all: \
	build \
	install \
	enable

.PHONY: build install enable all

