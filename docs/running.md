
pnpm dev:backend     # uruchom backend
pnpm dev:web         # uruchom frontend
pnpm dev:scene3d     # uruchom demo scene3d
pnpm build           # zbuduj wszystko


MQTT_PORT służy do dual-port mode — trybu deweloperskiego, gdzie MQTT działa na osobnym porcie niż HTTP.

Jeśli MQTT_PORT nie jest ustawiony lub jest równy PORT → shared mode: HTTP + MQTT WebSocket na jednym porcie (np. 1894), MQTT dostępny pod /mqtt
Jeśli MQTT_PORT jest ustawiony i różny od PORT → dual-port mode: HTTP na PORT, MQTT na osobnym MQTT_PORT
