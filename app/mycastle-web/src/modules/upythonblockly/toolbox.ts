/**
 * JSON toolbox definition for the uPython Blockly workspace.
 * Categories are grouped into three top-level sections: System, Hardware, Language.
 */
export const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    // ── System ──────────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: 'System',
      colour: '#FF6680',
      expanded: true,
      contents: [
        {
          kind: 'category',
          name: 'Events',
          colour: '#FF6680',
          contents: [
            { kind: 'block', type: 'upy_start' },
            { kind: 'block', type: 'upy_forever' },
          ],
        },
        {
          kind: 'category',
          name: 'Button',
          colour: '#e05050',
          contents: [
            { kind: 'block', type: 'upy_m5_begin' },
            { kind: 'block', type: 'upy_m5_update' },
            { kind: 'block', type: 'upy_m5_btn_state' },
            { kind: 'block', type: 'upy_m5_btn_event' },
          ],
        },
        {
          kind: 'category',
          name: 'PinButton',
          colour: '#e07530',
          contents: [
            {
              kind: 'block',
              type: 'upy_pin_btn_init',
              inputs: { PIN: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            { kind: 'block', type: 'upy_pin_btn_tick' },
            { kind: 'block', type: 'upy_pin_btn_state' },
            { kind: 'block', type: 'upy_pin_btn_event' },
          ],
        },
        {
          kind: 'category',
          name: 'UI Color',
          colour: '#cc3388',
          contents: [
            { kind: 'block', type: 'upy_ui_color' },
          ],
        },
        {
          kind: 'category',
          name: 'RGB',
          colour: '#cc3388',
          contents: [
            { kind: 'block', type: 'upy_rgb_init' },
            {
              kind: 'block',
              type: 'upy_rgb_set_color',
              inputs: {
                IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                COLOR: { shadow: { type: 'upy_ui_color' } },
              },
            },
            {
              kind: 'block',
              type: 'upy_rgb_fill_color',
              inputs: { COLOR: { shadow: { type: 'upy_ui_color' } } },
            },
            {
              kind: 'block',
              type: 'upy_rgb_set_brightness',
              inputs: { BRIGHTNESS: { shadow: { type: 'math_number', fields: { NUM: 80 } } } },
            },
          ],
        },
        {
          kind: 'category',
          name: 'IR',
          colour: '#884400',
          contents: [
            { kind: 'block', type: 'upy_ir_init' },
            {
              kind: 'block',
              type: 'upy_ir_send',
              inputs: {
                ADDR: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                DATA: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              },
            },
          ],
        },
        {
          kind: 'category',
          name: 'Time',
          colour: '140',
          contents: [
            {
              kind: 'block',
              type: 'upy_sleep_ms',
              inputs: { MS: { shadow: { type: 'math_number', fields: { NUM: 1000 } } } },
            },
            {
              kind: 'block',
              type: 'upy_sleep_us',
              inputs: { US: { shadow: { type: 'math_number', fields: { NUM: 100 } } } },
            },
            { kind: 'block', type: 'upy_ticks_ms' },
            { kind: 'block', type: 'upy_ticks_us' },
          ],
        },
      ],
    },
    { kind: 'sep' },
    // ── Hardware ─────────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: 'Hardware',
      colour: '220',
      expanded: true,
      contents: [
        {
          kind: 'category',
          name: 'Pin',
          colour: '250',
          contents: [
            {
              kind: 'block',
              type: 'upy_pin2_init',
              inputs: { PIN: { shadow: { type: 'math_number', fields: { NUM: 19 } } } },
            },
            { kind: 'block', type: 'upy_pin2_get_value' },
            { kind: 'block', type: 'upy_pin2_on' },
            { kind: 'block', type: 'upy_pin2_off' },
            { kind: 'block', type: 'upy_pin2_set_bool' },
            {
              kind: 'block',
              type: 'upy_pin2_set_value',
              inputs: { VAL: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
            },
            { kind: 'sep' },
            {
              kind: 'block',
              type: 'upy_pin_write',
              inputs: { VALUE: { shadow: { type: 'upy_highlow' } } },
            },
            { kind: 'block', type: 'upy_pin_read' },
            { kind: 'block', type: 'upy_pin_toggle' },
            {
              kind: 'block',
              type: 'upy_builtin_led',
              inputs: { VALUE: { shadow: { type: 'upy_highlow' } } },
            },
            { kind: 'block', type: 'upy_highlow' },
          ],
        },
        {
          kind: 'category',
          name: 'ADC',
          colour: '200',
          contents: [
            {
              kind: 'block',
              type: 'upy_adc2_init',
              inputs: { PIN: { shadow: { type: 'math_number', fields: { NUM: 26 } } } },
            },
            { kind: 'block', type: 'upy_adc2_read' },
            { kind: 'block', type: 'upy_adc2_read_u16' },
            { kind: 'block', type: 'upy_adc2_read_uv' },
            { kind: 'block', type: 'upy_adc2_atten' },
            { kind: 'block', type: 'upy_adc2_width' },
          ],
        },
        {
          kind: 'category',
          name: 'PWM',
          colour: '60',
          contents: [
            {
              kind: 'block',
              type: 'upy_pwm2_init',
              inputs: {
                PIN: { shadow: { type: 'math_number', fields: { NUM: 19 } } },
                FREQ: { shadow: { type: 'math_number', fields: { NUM: 1000 } } },
                DUTY: { shadow: { type: 'math_number', fields: { NUM: 512 } } },
              },
            },
            { kind: 'block', type: 'upy_pwm2_deinit' },
            { kind: 'block', type: 'upy_pwm2_get_duty' },
            { kind: 'block', type: 'upy_pwm2_get_duty_u16' },
            { kind: 'block', type: 'upy_pwm2_get_freq' },
            {
              kind: 'block',
              type: 'upy_pwm2_set_duty',
              inputs: { DUTY: { shadow: { type: 'math_number', fields: { NUM: 512 } } } },
            },
            {
              kind: 'block',
              type: 'upy_pwm2_set_duty_u16',
              inputs: { DUTY: { shadow: { type: 'math_number', fields: { NUM: 32768 } } } },
            },
            {
              kind: 'block',
              type: 'upy_pwm2_set_freq',
              inputs: { FREQ: { shadow: { type: 'math_number', fields: { NUM: 1000 } } } },
            },
          ],
        },
        {
          kind: 'category',
          name: 'Timer',
          colour: '140',
          contents: [
            { kind: 'block', type: 'upy_timer2_new' },
            {
              kind: 'block',
              type: 'upy_timer2_init',
              inputs: { PERIOD: { shadow: { type: 'math_number', fields: { NUM: 1000 } } } },
            },
            { kind: 'block', type: 'upy_timer2_callback' },
            { kind: 'block', type: 'upy_timer2_deinit' },
          ],
        },
        {
          kind: 'category',
          name: 'UART / Print',
          colour: '160',
          contents: [
            { kind: 'block', type: 'upy_uart2_init' },
            { kind: 'block', type: 'upy_uart2_setup' },
            { kind: 'block', type: 'upy_uart2_deinit' },
            { kind: 'block', type: 'upy_uart2_any' },
            { kind: 'block', type: 'upy_uart2_read_all' },
            {
              kind: 'block',
              type: 'upy_uart2_read_bytes',
              inputs: { NBYTES: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
            },
            { kind: 'block', type: 'upy_uart2_readline' },
            { kind: 'block', type: 'upy_uart2_read_raw' },
            { kind: 'block', type: 'upy_uart2_readinto' },
            { kind: 'block', type: 'upy_uart2_txdone' },
            {
              kind: 'block',
              type: 'upy_uart2_write_str',
              inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello' } } } },
            },
            {
              kind: 'block',
              type: 'upy_uart2_write_line',
              inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello' } } } },
            },
            { kind: 'block', type: 'upy_uart2_write_var' },
            { kind: 'block', type: 'upy_uart2_write_bytes_var' },
            {
              kind: 'block',
              type: 'upy_uart2_write_raw',
              inputs: { VAL: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            { kind: 'block', type: 'upy_uart2_sendbreak' },
            { kind: 'sep' },
            { kind: 'block', type: 'upy_print' },
          ],
        },
        {
          kind: 'category',
          name: 'I2C',
          colour: '170',
          contents: [
            { kind: 'block', type: 'upy_i2c2_init' },
            { kind: 'block', type: 'upy_i2c2_scan' },
            {
              kind: 'block',
              type: 'upy_i2c2_readfrom',
              inputs: {
                ADDR: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
                NBYTES: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_i2c2_readfrom_into',
              inputs: { ADDR: { shadow: { type: 'math_number', fields: { NUM: 60 } } } },
            },
            {
              kind: 'block',
              type: 'upy_i2c2_readfrom_mem',
              inputs: {
                ADDR: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
                MEMADDR: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                NBYTES: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_i2c2_readfrom_mem_into',
              inputs: {
                ADDR: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
                MEMADDR: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_i2c2_writeto',
              inputs: { ADDR: { shadow: { type: 'math_number', fields: { NUM: 60 } } } },
            },
            {
              kind: 'block',
              type: 'upy_i2c2_writeto_stmt',
              inputs: { ADDR: { shadow: { type: 'math_number', fields: { NUM: 60 } } } },
            },
            {
              kind: 'block',
              type: 'upy_i2c2_writeto_mem',
              inputs: {
                ADDR: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
                MEMADDR: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              },
            },
          ],
        },
        {
          kind: 'category',
          name: 'SPI',
          colour: '#cc6600',
          contents: [
            { kind: 'block', type: 'upy_spi2_init' },
            { kind: 'block', type: 'upy_spi2_deinit' },
            {
              kind: 'block',
              type: 'upy_spi2_read_val',
              inputs: { NBYTES: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            { kind: 'block', type: 'upy_spi2_readinto' },
            { kind: 'block', type: 'upy_spi2_write' },
            { kind: 'block', type: 'upy_spi2_write_readinto' },
          ],
        },
        {
          kind: 'category',
          name: 'I2S',
          colour: '#8833cc',
          contents: [
            { kind: 'block', type: 'upy_i2s_init' },
            { kind: 'block', type: 'upy_i2s_deinit' },
            { kind: 'block', type: 'upy_i2s_readinto_val' },
            { kind: 'block', type: 'upy_i2s_readinto' },
            { kind: 'block', type: 'upy_i2s_write' },
          ],
        },
        {
          kind: 'category',
          name: 'SDCard',
          colour: '#2277aa',
          contents: [
            { kind: 'block', type: 'upy_sdcard_init' },
            { kind: 'block', type: 'upy_sdcard_getcwd' },
            {
              kind: 'block',
              type: 'upy_sdcard_listdir',
              inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: 'res/img' } } } },
            },
            {
              kind: 'block',
              type: 'upy_sdcard_isfile',
              inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: 'res/img/file.png' } } } },
            },
            {
              kind: 'block',
              type: 'upy_sdcard_isdir',
              inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: 'res/img' } } } },
            },
            {
              kind: 'block',
              type: 'upy_sdcard_exists',
              inputs: {
                NAME: { shadow: { type: 'text', fields: { TEXT: 'img' } } },
                DIR: { shadow: { type: 'text', fields: { TEXT: 'res' } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_sdcard_chdir',
              inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: 'res/img' } } } },
            },
            {
              kind: 'block',
              type: 'upy_sdcard_mkdir',
              inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: '/sd/res/img' } } } },
            },
            {
              kind: 'block',
              type: 'upy_sdcard_remove',
              inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: '/sd/res/img/file.png' } } } },
            },
            {
              kind: 'block',
              type: 'upy_sdcard_rmdir',
              inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: '/sd/res/img' } } } },
            },
            {
              kind: 'block',
              type: 'upy_sdcard_rename',
              inputs: {
                SRC: { shadow: { type: 'text', fields: { TEXT: '/sd/res/img/old.png' } } },
                DST: { shadow: { type: 'text', fields: { TEXT: '/sd/res/img/new.png' } } },
              },
            },
          ],
        },
        {
          kind: 'category',
          name: 'CAN',
          colour: '#884400',
          contents: [
            { kind: 'block', type: 'upy_can_init' },
            { kind: 'block', type: 'upy_can_init_adv' },
            { kind: 'block', type: 'upy_can_deinit' },
            { kind: 'block', type: 'upy_can_state' },
            { kind: 'block', type: 'upy_can_info' },
            { kind: 'block', type: 'upy_can_any' },
            {
              kind: 'block',
              type: 'upy_can_recv_val',
              inputs: { TIMEOUT: { shadow: { type: 'math_number', fields: { NUM: 5000 } } } },
            },
            {
              kind: 'block',
              type: 'upy_can_recv',
              inputs: { TIMEOUT: { shadow: { type: 'math_number', fields: { NUM: 5000 } } } },
            },
            {
              kind: 'block',
              type: 'upy_can_send',
              inputs: {
                ID: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                TIMEOUT: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              },
            },
            { kind: 'block', type: 'upy_can_restart' },
          ],
        },
        {
          kind: 'category',
          name: 'WatchDog',
          colour: '#cc3300',
          contents: [
            {
              kind: 'block',
              type: 'upy_wdt_init',
              inputs: { TIMEOUT: { shadow: { type: 'math_number', fields: { NUM: 5000 } } } },
            },
            { kind: 'block', type: 'upy_wdt_feed' },
          ],
        },
        {
          kind: 'category',
          name: 'RTC',
          colour: '#006633',
          contents: [
            { kind: 'block', type: 'upy_rtc_init' },
            { kind: 'block', type: 'upy_rtc_get_utc' },
            { kind: 'block', type: 'upy_rtc_get_local' },
            { kind: 'block', type: 'upy_rtc_get_tz' },
            { kind: 'block', type: 'upy_rtc_tuple_get' },
            { kind: 'block', type: 'upy_rtc_set_utc' },
            { kind: 'block', type: 'upy_rtc_set_tz_drop' },
            { kind: 'block', type: 'upy_rtc_set_tz_val' },
          ],
        },
        {
          kind: 'category',
          name: 'WiFi',
          colour: '120',
          contents: [
            {
              kind: 'block',
              type: 'upy_wifi_connect',
              inputs: {
                SSID: { shadow: { type: 'text', fields: { TEXT: 'MyNetwork' } } },
                PASSWORD: { shadow: { type: 'text', fields: { TEXT: 'password' } } },
              },
            },
            { kind: 'block', type: 'upy_wifi_is_connected' },
            { kind: 'block', type: 'upy_wifi_ifconfig' },
            { kind: 'block', type: 'upy_wifi_disconnect' },
          ],
        },
        {
          kind: 'category',
          name: 'Speaker',
          colour: '#aa6600',
          contents: [
            { kind: 'block', type: 'upy_spk_begin' },
            { kind: 'block', type: 'upy_spk_end' },
            { kind: 'block', type: 'upy_spk_stop' },
            {
              kind: 'block',
              type: 'upy_spk_tone',
              inputs: {
                FREQ: { shadow: { type: 'math_number', fields: { NUM: 440 } } },
                MS: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_spk_set_volume',
              inputs: { VOL: { shadow: { type: 'math_number', fields: { NUM: 128 } } } },
            },
            {
              kind: 'block',
              type: 'upy_spk_set_volume_pct',
              inputs: { PCT: { shadow: { type: 'math_number', fields: { NUM: 50 } } } },
            },
            {
              kind: 'block',
              type: 'upy_spk_set_all_ch_vol',
              inputs: { VOL: { shadow: { type: 'math_number', fields: { NUM: 128 } } } },
            },
            { kind: 'block', type: 'upy_spk_set_ch_vol' },
            { kind: 'block', type: 'upy_spk_play_wav' },
            { kind: 'block', type: 'upy_spk_play_raw' },
            { kind: 'block', type: 'upy_spk_play_wav_file' },
            { kind: 'block', type: 'upy_spk_config_init' },
            { kind: 'block', type: 'upy_spk_config_set_int' },
            { kind: 'block', type: 'upy_spk_config_set_bool' },
            { kind: 'block', type: 'upy_spk_is_running' },
            { kind: 'block', type: 'upy_spk_is_enabled' },
            { kind: 'block', type: 'upy_spk_is_playing' },
            { kind: 'block', type: 'upy_spk_begin_ret' },
            { kind: 'block', type: 'upy_spk_get_volume' },
            { kind: 'block', type: 'upy_spk_get_volume_pct' },
            { kind: 'block', type: 'upy_spk_get_playing_channels' },
            { kind: 'block', type: 'upy_spk_get_channel_volume' },
            { kind: 'block', type: 'upy_spk_get_config_int' },
            { kind: 'block', type: 'upy_spk_get_config_bool' },
          ],
        },
        {
          kind: 'category',
          name: 'User Display',
          colour: '#336699',
          contents: [
            { kind: 'block', type: 'upy_display_init' },
          ],
        },
      ],
    },
    { kind: 'sep' },
    // ── Language ─────────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: 'Language',
      colour: '210',
      expanded: true,
      contents: [
        {
          kind: 'category',
          name: 'Logic',
          categorystyle: 'logic_category',
          contents: [
            { kind: 'block', type: 'controls_if' },
            { kind: 'block', type: 'logic_compare' },
            { kind: 'block', type: 'logic_operation' },
            { kind: 'block', type: 'logic_negate' },
            { kind: 'block', type: 'logic_boolean' },
            { kind: 'block', type: 'logic_null' },
            { kind: 'block', type: 'logic_ternary' },
          ],
        },
        {
          kind: 'category',
          name: 'Loops',
          categorystyle: 'loop_category',
          contents: [
            {
              kind: 'block',
              type: 'controls_repeat_ext',
              inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
            },
            { kind: 'block', type: 'controls_whileUntil' },
            {
              kind: 'block',
              type: 'controls_for',
              inputs: {
                FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                TO: { shadow: { type: 'math_number', fields: { NUM: 9 } } },
                BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              },
            },
            { kind: 'block', type: 'controls_flow_statements' },
            {
              kind: 'block',
              type: 'upy_for_in_range',
              inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
            },
            { kind: 'block', type: 'controls_forEach' },
          ],
        },
        {
          kind: 'category',
          name: 'Control',
          colour: '30',
          contents: [
            { kind: 'block', type: 'upy_try_except' },
            { kind: 'block', type: 'upy_switch' },
            { kind: 'block', type: 'upy_when_var_changes' },
          ],
        },
        {
          kind: 'category',
          name: 'Bits',
          colour: '20',
          contents: [
            { kind: 'block', type: 'upy_bitwise' },
            { kind: 'block', type: 'upy_bitnot' },
            {
              kind: 'block',
              type: 'upy_bit_get',
              inputs: { BIT: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_bit_set',
              inputs: { BIT: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_bit_clear',
              inputs: { BIT: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_bit_toggle',
              inputs: { BIT: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            { kind: 'block', type: 'upy_int_from_bytes' },
          ],
        },
        {
          kind: 'category',
          name: 'Math',
          categorystyle: 'math_category',
          contents: [
            { kind: 'block', type: 'math_number' },
            { kind: 'block', type: 'math_arithmetic' },
            { kind: 'block', type: 'math_single' },
            { kind: 'block', type: 'math_trig' },
            { kind: 'block', type: 'math_constant' },
            { kind: 'block', type: 'math_number_property' },
            {
              kind: 'block',
              type: 'math_change',
              inputs: { DELTA: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
            },
            { kind: 'block', type: 'math_round' },
            { kind: 'block', type: 'math_modulo' },
            {
              kind: 'block',
              type: 'math_constrain',
              inputs: {
                LOW: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                HIGH: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
              },
            },
            {
              kind: 'block',
              type: 'math_random_int',
              inputs: {
                FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
              },
            },
            { kind: 'block', type: 'math_random_float' },
          ],
        },
        {
          kind: 'category',
          name: 'Type',
          colour: '230',
          contents: [
            { kind: 'block', type: 'upy_to_int' },
            { kind: 'block', type: 'upy_to_float' },
            { kind: 'block', type: 'upy_list_sum' },
          ],
        },
        {
          kind: 'category',
          name: 'Lists',
          colour: '#5ba5a5',
          contents: [
            { kind: 'block', type: 'upy_list_create_empty' },
            { kind: 'block', type: 'lists_create_with' },
            {
              kind: 'block',
              type: 'upy_list_repeat',
              inputs: {
                ITEM: { shadow: { type: 'text', fields: { TEXT: '0' } } },
                TIMES: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
              },
            },
            { kind: 'sep' },
            { kind: 'block', type: 'upy_list_length' },
            { kind: 'block', type: 'upy_list_is_empty' },
            {
              kind: 'block',
              type: 'upy_list_find',
              inputs: { ITEM: { shadow: { type: 'text', fields: { TEXT: '0' } } } },
            },
            { kind: 'sep' },
            {
              kind: 'block',
              type: 'upy_list_get',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_list_get_remove',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_list_remove',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_list_set',
              inputs: {
                IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                VALUE: { shadow: { type: 'text', fields: { TEXT: '0' } } },
              },
            },
            { kind: 'sep' },
            {
              kind: 'block',
              type: 'upy_list_sublist',
              inputs: {
                FROM_IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                TO_IDX: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_list_from_text',
              inputs: {
                TEXT: { shadow: { type: 'text', fields: { TEXT: '0,1,2' } } },
                DELIM: { shadow: { type: 'text', fields: { TEXT: ',' } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_list_to_text',
              inputs: {
                DELIM: { shadow: { type: 'text', fields: { TEXT: ',' } } },
              },
            },
          ],
        },
        {
          kind: 'category',
          name: 'Tuples',
          colour: '#9b5ba5',
          contents: [
            { kind: 'block', type: 'upy_tuple_create_with' },
            { kind: 'block', type: 'upy_tuple_length' },
            {
              kind: 'block',
              type: 'upy_tuple_get',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
            },
            {
              kind: 'block',
              type: 'upy_tuple_find',
              inputs: { ITEM: { shadow: { type: 'text', fields: { TEXT: '0' } } } },
            },
          ],
        },
        {
          kind: 'category',
          name: 'Bytes',
          colour: '#7952b3',
          contents: [
            { kind: 'block', type: 'upy_bytes_create' },
            { kind: 'sep' },
            {
              kind: 'block',
              type: 'upy_bytes_get',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
            },
            {
              kind: 'block',
              type: 'upy_bytes_remove',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
            },
            {
              kind: 'block',
              type: 'upy_bytes_sublist',
              inputs: {
                FROM_IDX: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
                TO_IDX: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              },
            },
            { kind: 'sep' },
            { kind: 'block', type: 'upy_bytes_decode' },
          ],
        },
        {
          kind: 'category',
          name: 'Bytearray',
          colour: '#2196a8',
          contents: [
            {
              kind: 'block',
              type: 'upy_bytearray_create',
              inputs: { LENGTH: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
            },
            { kind: 'sep' },
            {
              kind: 'block',
              type: 'upy_bytearray_append',
              inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_bytearray_extend',
              inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            { kind: 'sep' },
            {
              kind: 'block',
              type: 'upy_list_set',
              inputs: {
                IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_list_get',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_list_get_remove',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_list_remove',
              inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_list_sublist',
              inputs: {
                FROM_IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
                TO_IDX: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              },
            },
            { kind: 'sep' },
            { kind: 'block', type: 'upy_bytearray_decode' },
          ],
        },
        {
          kind: 'category',
          name: 'JSON',
          colour: '#4a7c59',
          contents: [
            { kind: 'block', type: 'upy_json_dumps' },
            {
              kind: 'block',
              type: 'upy_json_loads',
              inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: '{"key": "value"}' } } } },
            },
          ],
        },
        {
          kind: 'category',
          name: 'Map',
          colour: '#c4527a',
          contents: [
            {
              kind: 'block',
              type: 'upy_map_create',
              inputs: {
                KEY0: { shadow: { type: 'text', fields: { TEXT: 'key' } } },
                VAL0: { shadow: { type: 'text', fields: { TEXT: 'value' } } },
              },
            },
            { kind: 'sep' },
            { kind: 'block', type: 'upy_map_clear' },
            {
              kind: 'block',
              type: 'upy_map_contains_key',
              inputs: { KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } } },
            },
            {
              kind: 'block',
              type: 'upy_map_get',
              inputs: { KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } } },
            },
            { kind: 'sep' },
            {
              kind: 'block',
              type: 'upy_map_add_key',
              inputs: {
                KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } },
                VALUE: { shadow: { type: 'text', fields: { TEXT: 'value' } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_map_set_key',
              inputs: {
                KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } },
                VALUE: { shadow: { type: 'text', fields: { TEXT: 'value' } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_map_delete_key',
              inputs: { KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } } },
            },
          ],
        },
        {
          kind: 'category',
          name: 'Text',
          categorystyle: 'text_category',
          contents: [
            { kind: 'block', type: 'text' },
            { kind: 'block', type: 'text_join' },
            {
              kind: 'block',
              type: 'text_append',
              inputs: { TEXT: { shadow: { type: 'text' } } },
            },
            { kind: 'block', type: 'text_length' },
            { kind: 'block', type: 'text_isEmpty' },
            {
              kind: 'block',
              type: 'text_changeCase',
              inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello M5' } } } },
            },
            {
              kind: 'block',
              type: 'upy_text_count',
              inputs: {
                SUB: { shadow: { type: 'text', fields: { TEXT: 'te' } } },
                TEXT: { shadow: { type: 'text', fields: { TEXT: 'tetete' } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_text_index',
              inputs: {
                IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_text_replace',
              inputs: {
                OLD: { shadow: { type: 'text', fields: { TEXT: 'te' } } },
                NEW: { shadow: { type: 'text', fields: { TEXT: 're' } } },
                TEXT: { shadow: { type: 'text', fields: { TEXT: 'tetete' } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_text_trim',
              inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello M5' } } } },
            },
            {
              kind: 'block',
              type: 'upy_text_prompt',
              inputs: { MSG: { shadow: { type: 'text', fields: { TEXT: 'hello M5' } } } },
            },
            {
              kind: 'block',
              type: 'upy_text_to_str',
              inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
            },
            {
              kind: 'block',
              type: 'upy_text_ord',
              inputs: { CHAR: { shadow: { type: 'text', fields: { TEXT: 'A' } } } },
            },
            {
              kind: 'block',
              type: 'upy_text_decode',
              inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'aaaaaa' } } } },
            },
            {
              kind: 'block',
              type: 'upy_text_encode',
              inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'bbbbbb' } } } },
            },
            {
              kind: 'block',
              type: 'upy_text_format_float',
              inputs: {
                DECIMALS: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              },
            },
            {
              kind: 'block',
              type: 'upy_text_to_hex',
              inputs: {
                NUM: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
                WIDTH: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              },
            },
          ],
        },
        {
          kind: 'category',
          name: 'Variables',
          categorystyle: 'variable_category',
          contents: [
            { kind: 'block', type: 'variables_get' },
            { kind: 'block', type: 'variables_set' },
          ],
        },
        {
          kind: 'category',
          name: 'Functions',
          categorystyle: 'procedure_category',
          custom: 'PROCEDURE',
        },
      ],
    },
  ],
};

// Import needed for type only
import type * as Blockly from 'blockly';

/** Hardware subcategory names that can be toggled in the Configuration panel. */
export const HARDWARE_CATEGORY_NAMES: readonly string[] = [
  'Pin',
  'ADC',
  'PWM',
  'Timer',
  'UART / Print',
  'I2C',
  'SPI',
  'I2S',
  'SDCard',
  'CAN',
  'WatchDog',
  'RTC',
  'WiFi',
  'Speaker',
  'User Display',
];

/**
 * Build a filtered toolbox definition, hiding specified Hardware subcategories.
 */
export function buildToolbox(hidden: ReadonlySet<string>): Blockly.utils.toolbox.ToolboxDefinition {
  const sections = (TOOLBOX as { kind: string; contents: unknown[] }).contents as Array<{ kind: string; name?: string; contents?: unknown[] } & Record<string, unknown>>;

  const mapped = sections.map((section) => {
    if (section.kind !== 'category' || section.name !== 'Hardware') return section;
    const filtered = (section.contents ?? []).filter(
      (item) => (item as { kind: string; name?: string }).kind !== 'category' || !hidden.has((item as { name?: string }).name ?? ''),
    );
    return { ...section, contents: filtered };
  });

  return { kind: 'categoryToolbox', contents: mapped };
}
