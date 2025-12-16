# Systemd service + timer for enervent-pingvin-sniffer

Files:

- enervent-pingvin-sniffer.service
- enervent-pingvin-sniffer.timer

Installation example (as root):

1. Copy files to systemd system directory:

   cp deploy/systemd/enervent-pingvin-sniffer.service /etc/systemd/system/
   cp deploy/systemd/enervent-pingvin-sniffer.timer /etc/systemd/system/

2. Edit the service file to set `User=` and `WorkingDirectory=` to the installed app path.
   You can also add environment variables to the service using `Environment=` lines (for example
   `Environment=REGISTER_MAP_PATH=/etc/enervent/register-map.yaml` or `Environment=SNIFFER_ARGS=--silent --slave 0 --func 16`).

3. Reload systemd and enable timer:

   systemctl daemon-reload
   systemctl enable --now enervent-pingvin-sniffer.timer

4. Inspect status/logs:

   systemctl status enervent-pingvin-sniffer.timer
   journalctl -u enervent-pingvin-sniffer.service -f

Notes:

- The service runs `npm run start` in the configured `WorkingDirectory`. Ensure Node.js and npm are installed
  and the app is built (or let the service run the build as `start` does `npm run build && node dist/index.js`).
- Adjust `OnUnitActiveSec` in the timer if you want a different interval.
