import type { IotDeviceConfig, MqttFS } from '@mhersztowski/core';
import type { IotExtension } from './IotExtension.js';
import type { MqttPublishFn } from './IotService.js';
import { VfsExtension } from './extensions/VfsExtension.js';
import { VirtualKeyboardExtension } from './extensions/VirtualKeyboardExtension.js';
import { VirtualMouseExtension } from './extensions/VirtualMouseExtension.js';
import { SmartDisplayExtension } from './extensions/SmartDisplayExtension.js';

/**
 * Manages IoT device extensions — one set per device.
 *
 * Extensions are keyed by (deviceId, extensionType).  The registry handles:
 *  - creating / disposing extensions as device configs change
 *  - routing inbound MQTT messages from devices to the correct extension
 *  - lazy auto-creation of known extensions when a device message arrives
 *
 * Optional hooks allow the host (e.g. MycastleHttpServer) to mount/unmount
 * device filesystems into a CompositeFS as VFS extensions come and go:
 *   registry.onVfsMounted = (deviceId, fs) => compositeVfs.mount(`/devices/${deviceId}`, fs);
 *   registry.onVfsUnmounted = (deviceId) => compositeVfs.unmount(`/devices/${deviceId}`);
 */
export class IotExtensionRegistry {
  /** deviceId → (extensionType → extension) */
  private readonly registry = new Map<string, Map<string, IotExtension>>();

  /** Called after a VfsExtension is created for a device */
  onVfsMounted?: (deviceId: string, fs: MqttFS) => void;
  /** Called before a VfsExtension is disposed for a device */
  onVfsUnmounted?: (deviceId: string) => void;

  constructor(private readonly publishFn: MqttPublishFn) {}

  // --- Config sync ---

  /**
   * Ensure extensions declared in an IotDeviceConfig are active.
   * Extensions not in the config are left untouched (preserving any that were
   * auto-created from inbound messages).
   */
  syncFromConfig(config: IotDeviceConfig): void {
    for (const extCfg of config.extensions ?? []) {
      if (!extCfg.enabled) {
        this.remove(config.deviceId, extCfg.type);
        continue;
      }
      if (!this.has(config.deviceId, extCfg.type)) {
        this.createExtension(config.deviceId, config.userId, extCfg.type, config.topicPrefix);
      }
    }
  }

  /**
   * Remove all extensions for a device (called when device config is deleted).
   */
  removeDevice(deviceId: string): void {
    this.remove(deviceId);
  }

  // --- Message routing ---

  /**
   * Route an inbound MQTT message from a device to the appropriate extension.
   * If no extension exists yet for a known type, one is created automatically.
   *
   * @param deviceId  Device name / ID segment from the topic
   * @param userId    User segment from the topic (needed for topic prefix on auto-create)
   * @param extType   Extension type segment from the topic, e.g. 'vfs'
   * @param subTopic  Remaining topic segment(s) after extType, e.g. 'res'
   * @param payload   Parsed JSON payload from the MQTT message
   */
  handleMessage(
    deviceId: string,
    userId: string,
    extType: string,
    subTopic: string,
    payload: unknown,
  ): void {
    let ext = this.get(deviceId, extType);

    // Auto-create extension for known types when the first message arrives
    if (!ext) {
      const topicPrefix = `minis/${userId}/${deviceId}`;
      ext = this.createExtension(deviceId, userId, extType, topicPrefix);
    }

    ext?.handleMessage(subTopic, payload);
  }

  // --- Typed accessors ---

  getVfs(deviceId: string): VfsExtension | undefined {
    return this.get(deviceId, 'vfs') as VfsExtension | undefined;
  }

  getVkbd(deviceId: string): VirtualKeyboardExtension | undefined {
    return this.get(deviceId, 'vkbd') as VirtualKeyboardExtension | undefined;
  }

  getVmouse(deviceId: string): VirtualMouseExtension | undefined {
    return this.get(deviceId, 'vmouse') as VirtualMouseExtension | undefined;
  }

  getSmartDisplay(deviceId: string): SmartDisplayExtension | undefined {
    return this.get(deviceId, 'smart-display') as SmartDisplayExtension | undefined;
  }

  /** Returns the list of active extension types for a device. */
  getActiveExtensions(deviceId: string): string[] {
    const deviceExts = this.registry.get(deviceId);
    if (!deviceExts) return [];
    return Array.from(deviceExts.keys());
  }

  // --- Generic accessors ---

  get(deviceId: string, type: string): IotExtension | undefined {
    return this.registry.get(deviceId)?.get(type);
  }

  has(deviceId: string, type: string): boolean {
    return this.registry.get(deviceId)?.has(type) ?? false;
  }

  // --- Lifecycle ---

  dispose(): void {
    for (const deviceExts of this.registry.values()) {
      for (const ext of deviceExts.values()) ext.dispose();
    }
    this.registry.clear();
  }

  // --- Private ---

  private createExtension(
    deviceId: string,
    _userId: string,
    type: string,
    topicPrefix: string,
  ): IotExtension | undefined {
    let ext: IotExtension | undefined;

    switch (type) {
      case 'vfs':
        ext = new VfsExtension(deviceId, topicPrefix, this.publishFn);
        break;
      case 'vkbd':
        ext = new VirtualKeyboardExtension(deviceId, topicPrefix, this.publishFn);
        break;
      case 'vmouse':
        ext = new VirtualMouseExtension(deviceId, topicPrefix, this.publishFn);
        break;
      case 'smart-display':
        ext = new SmartDisplayExtension(deviceId, topicPrefix, this.publishFn);
        break;
      default:
        console.warn(`[IotExtensionRegistry] Unknown extension type: ${type} (device=${deviceId})`);
        return undefined;
    }

    if (!this.registry.has(deviceId)) {
      this.registry.set(deviceId, new Map());
    }
    this.registry.get(deviceId)!.set(type, ext);
    console.log(`[IotExtensionRegistry] Created extension type=${type} device=${deviceId}`);

    if (type === 'vfs') {
      this.onVfsMounted?.(deviceId, (ext as VfsExtension).fs);
    }
    return ext;
  }

  private remove(deviceId: string, type?: string): void {
    const deviceExts = this.registry.get(deviceId);
    if (!deviceExts) return;

    if (type) {
      if (type === 'vfs') this.onVfsUnmounted?.(deviceId);
      const ext = deviceExts.get(type);
      ext?.dispose();
      deviceExts.delete(type);
    } else {
      if (deviceExts.has('vfs')) this.onVfsUnmounted?.(deviceId);
      for (const ext of deviceExts.values()) ext.dispose();
      this.registry.delete(deviceId);
    }
  }
}
