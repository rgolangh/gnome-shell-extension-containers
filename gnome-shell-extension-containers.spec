Name:           gnome-shell-extension-containers
Version:        1.2.2
Release:        %autorelease
Summary:        Manage podman containers through a GNOME Shell menu.
License:        Apache 2.0
URL:            https://github.com/rgolangh/gnome-shell-extension-containers
Source0:        %{name}-%{version}.tar.gz
BuildArch:      noarch # Typically noarch for GNOME Shell extensions

Requires:       gnome-shell >= 45.0

%description
%{summary}

%prep
%autosetup -n %{name}-%{version}

%build
# No specific build steps are usually needed for GNOME Shell extensions
# as they are primarily interpreted files (JavaScript, CSS, etc.)

%install
# Create the installation directory
install -d %{buildroot}%{_datadir}/gnome-shell/extensions/%{name}

# Install the extension files
cp -r * %{buildroot}%{_datadir}/gnome-shell/extensions/%{name}/

%files
%{_datadir}/gnome-shell/extensions/%{name}/

%changelog
* Tue Apr 15 2025 Your Name <your.email@example.com> - <your_extension_version>-1
- Initial RPM release.
