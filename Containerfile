FROM quay.io/fedora/fedora:42
MAINTAINER Roy Golan<royg21@gmail.com>

RUN dnf update -y && \
    dnf install -y rpmdevtools fedora-packager && \
    useradd -m builder && \
    passwd -d builder && \
    usermod -aG wheel builder && \
    mkdir -p /home/builder/rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS} && \
    chown -R builder:builder /home/builder/rpmbuild

USER builder
WORKDIR /home/builder/rpmbuild/SPECS
COPY gnome-shell-extension-containers.spec .
COPY gnome-shell-extension-containers-1.2.2.tar.gz ../SOURCES
RUN rpmbuild -ba gnome-shell-extension-containers.spec
RUN chmod 777 -R ../RPMS && ls -lar ../RPMS && cp -r -v ../RPMS/* /rpms
