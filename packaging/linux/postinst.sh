#!/bin/sh
# Pattelock : applique la règle udev de /dev/uinput et charge le module (Wayland).
# Il reste à ajouter l'utilisateur au groupe « input » : sudo usermod -aG input $USER
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger --subsystem-match=misc 2>/dev/null || true
modprobe uinput 2>/dev/null || true
exit 0
