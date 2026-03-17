/**
 * Base interface for all IoT device extensions.
 *
 * An extension implements a specific protocol (e.g. VFS) on top of MQTT
 * sub-topics under the device's base topic prefix:
 *   minis/{user}/{device}/ext/{type}/req  — server → device
 *   minis/{user}/{device}/ext/{type}/res  — device → server
 *
 * Extensions are registered in IotExtensionRegistry, keyed by deviceId + type.
 */
export interface IotExtension {
  /** Matches the extType segment in the MQTT topic (e.g. 'vfs') */
  readonly type: string;

  /**
   * Called by IotExtensionRegistry when a message arrives from the device
   * on `.../ext/{type}/{subTopic}` (e.g. subTopic = 'res').
   */
  handleMessage(subTopic: string, payload: unknown): void;

  /** Release resources held by the extension (pending promises, timers, …) */
  dispose(): void;
}
