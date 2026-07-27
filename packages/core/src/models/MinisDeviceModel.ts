export interface MinisDeviceBuild {
  platform: string;  // e.g. 'arduino', 'cmake', 'platformio'
  fqbn?: string;     // e.g. 'esp32:esp32:esp32s3'
  version?: string;
  at: number;        // unix ms
  success: boolean;
  projectId?: string;
  sketchName?: string;
}

export interface MinisDeviceModel {
  type: 'device';
  id: string;
  name: string;
  deviceDefId: string;
  isAssembled: boolean;
  isIot: boolean;
  sn: string;
  description?: string;
  localizationId?: string;
  lastBuild?: MinisDeviceBuild;
}

export interface MinisDevicesModel {
  type: 'devices';
  devices: MinisDeviceModel[];
}

/**
 * Zgłoszenie urządzenia proszącego o dopisanie do listy użytkownika.
 *
 * Urządzenie publikuje je na `minis/{user}/{device}/register-request`, backend
 * trzyma je jako oczekujące, a użytkownik akceptuje lub odrzuca w
 * Electronics → Devices. Dzięki temu nowy klient (firmware, desktop, mobile)
 * nie wymaga ręcznego zakładania wpisu, ale też nie dopisuje się sam.
 */
export interface DeviceRegistrationRequest {
  type: 'device-request';
  /** Nazwa z topiku — klucz zgłoszenia w obrębie użytkownika. */
  deviceName: string;
  /** Nazwa do pokazania; brak = `deviceName`. */
  label?: string;
  kind?: 'firmware' | 'desktop' | 'mobile' | 'web' | 'service';
  sn?: string;
  description?: string;
  version?: string;
  address?: string;
  /** Pierwsze zgłoszenie (ms). */
  requestedAt: number;
  /** Ostatnie powtórzenie — urządzenie zgłasza się przy każdym połączeniu. */
  lastSeenAt: number;
}
