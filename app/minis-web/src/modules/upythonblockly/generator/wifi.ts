import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerWifiGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_wifi_connect'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const ssid = g.valueToCode(block, 'SSID', Order.NONE) || "''";
    const password = g.valueToCode(block, 'PASSWORD', Order.NONE) || "''";
    g.addImport('network', 'import network');
    g.addImport('utime', 'import utime');
    g.addInit('wlan', '_wlan = network.WLAN(network.STA_IF)');
    return (
      `_wlan.active(True)\n` +
      `if not _wlan.isconnected():\n` +
      `    _wlan.connect(${ssid}, ${password})\n` +
      `    while not _wlan.isconnected():\n` +
      `        utime.sleep_ms(100)\n`
    );
  };

  gen.forBlock['upy_wifi_is_connected'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('network', 'import network');
    g.addInit('wlan', '_wlan = network.WLAN(network.STA_IF)');
    return ['_wlan.isconnected()', Order.ATOMIC];
  };

  gen.forBlock['upy_wifi_ifconfig'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('network', 'import network');
    g.addInit('wlan', '_wlan = network.WLAN(network.STA_IF)');
    return ['_wlan.ifconfig()[0]', Order.ATOMIC];
  };

  gen.forBlock['upy_wifi_disconnect'] = function (_block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('network', 'import network');
    g.addInit('wlan', '_wlan = network.WLAN(network.STA_IF)');
    return '_wlan.disconnect()\n';
  };
}
