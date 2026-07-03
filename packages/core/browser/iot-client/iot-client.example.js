/*
 * IoT Client — zbuduj wirtualne urządzenie MyCastle w przeglądarce.
 *
 * Otwórz ten plik w MyCastle **Drive** i kliknij ▶ "Uruchom w przeglądarce".
 * Sandbox wstrzykuje globalny `client` (MQTT po wbudowanym połączeniu) oraz
 * `console` (→ konsola w prawym panelu). Ten skrypt tworzy urządzenie z kilkoma
 * encjami i jednym rozszerzeniem, po czym ogłasza je serwerowi (hello) i reaguje
 * na komendy z UI IoT MyCastle.
 *
 * Klasy IotDevice/IotEntity/IotExtension pochodzą z `iot-client.module.js`
 * (bundle `core/browser/iot-client`) — w Drive są dostępne jako globale po
 * dołączeniu modułu przez `// @library` lub gdy bundle jest załadowany.
 *
 * Wymaga rdzenia `qobject.module.js` (Signal/QObject) — jest ładowany automatycznie.
 */

// Subskrypcje zostają żywe po zakończeniu runu — urządzenie dalej odbiera komendy,
// dopóki nie klikniesz ⏹ Stop (albo nie uruchomisz ponownie / zamkniesz panelu).

const dev = new IotDevice({
  transport: client,          // globalny MQTT z sandboxa Drive
  deviceName: 'wirtualka-1',  // klucz urządzenia w MyCastle (deviceName)
  heartbeatSec: 30,
  telemetrySec: 15,
  label: 'Wirtualne urządzenie z Drive',
});

// ── Encje ──────────────────────────────────────────────────────────────────────
const temp = dev.addEntity(IotEntity.sensor('temp', 'Temperatura', { unit: '°C', deviceClass: 'temperature' }));
const online = dev.addEntity(IotEntity.binarySensor('online', 'Połączenie', { onLabel: 'Online', offLabel: 'Offline' }));
const pump = dev.addEntity(IotEntity.switch('pump', 'Pompa'));
const bright = dev.addEntity(IotEntity.number('bright', 'Jasność', { min: 0, max: 100, step: 5, unit: '%' }));
const reboot = dev.addEntity(IotEntity.button('reboot', 'Restart'));
const mode = dev.addEntity(IotEntity.select('mode', 'Tryb', { options: ['auto', 'manual', 'off'] }));

// ── Reakcje na komendy z serwera ─────────────────────────────────────────────────
pump.commanded.connect((on) => console.log('🔌 Pompa →', on ? 'ON' : 'OFF'));
bright.commanded.connect((v) => console.log('💡 Jasność →', v + '%'));
reboot.pressed.connect(() => console.log('♻️  Restart wywołany'));
mode.commanded.connect((m) => console.log('⚙️  Tryb →', m));

// ── Rozszerzenie: prosty licznik operacji (request-response na ext/counter/req) ──
let n = 0;
dev.addExtension(IotExtension.define('counter', {
  inc: () => ({ value: ++n }),
  get: () => ({ value: n }),
  reset: () => { n = 0; return { value: n }; },
}));

// ── Log zdarzeń protokołu ────────────────────────────────────────────────────────
dev.helloSent.connect(() => console.info('▶ hello wysłane:', dev.entities().length, 'encji'));
dev.commandReceived.connect((id, payload, entity) =>
  console.log('◀ command', id, entity ? '(znane)' : '(NIEZNANE)', payload));

// ── Symulacja odczytów czujników ─────────────────────────────────────────────────
online.report(true);
temp.report(21.0);
let t = 21.0;
const sim = setInterval(() => {
  t = Math.round((t + (Math.random() - 0.5)) * 10) / 10;
  temp.report(t);                 // reaktywna telemetria: publikuje od razu
}, 5000);

// Zatrzymaj symulator gdy urządzenie zostanie zatrzymane (⏹ Stop → panel czyści subskrypcje).
dev.stopped.connect(() => clearInterval(sim));

dev.start();
console.log('Urządzenie', dev.deviceName(), 'wystartowało jako', client.userName + '. Steruj nim z panelu IoT MyCastle.');
