const FUNCTION_KEYS = Array.from({ length: 24 }, (_, index) => `f${index + 1}`)
const LETTER_KEYS = 'abcdefghijklmnopqrstuvwxyz'.split('')
const DIGIT_KEYS = Array.from({ length: 10 }, (_, index) => String(index))
const NUMPAD_KEYS = [
  'num0',
  'num1',
  'num2',
  'num3',
  'num4',
  'num5',
  'num6',
  'num7',
  'num8',
  'num9',
  'numadd',
  'numsub',
  'nummul',
  'numdiv',
  'numdec',
  'numenter',
]
const CONTROL_KEYS = [
  'space',
  'enter',
  'tab',
  'backspace',
  'escape',
  'insert',
  'delete',
  'home',
  'end',
  'pageup',
  'pagedown',
  'up',
  'down',
  'left',
  'right',
  'capslock',
  'scrolllock',
  'pause',
  'printscreen',
]
const MODIFIER_KEYS = ['lshift', 'rshift', 'lctrl', 'rctrl', 'lalt', 'ralt', 'lwin', 'rwin', 'menu']
const PUNCTUATION_KEYS = [
  'minus',
  'equals',
  'lbracket',
  'rbracket',
  'backslash',
  'semicolon',
  'quote',
  'comma',
  'period',
  'slash',
  'backtick',
]
const MEDIA_KEYS = ['volumeup', 'volumedown', 'mute', 'playpause', 'nexttrack', 'prevtrack']
const MOUSE_KEYS = ['mouse3', 'mouse4', 'mouse5']

export const KEY_NAMES: readonly string[] = [
  ...FUNCTION_KEYS,
  ...LETTER_KEYS,
  ...DIGIT_KEYS,
  ...NUMPAD_KEYS,
  ...CONTROL_KEYS,
  ...MODIFIER_KEYS,
  ...PUNCTUATION_KEYS,
  ...MEDIA_KEYS,
  ...MOUSE_KEYS,
]

const LABELS: Record<string, string> = {
  space: 'Space',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  escape: 'Escape',
  insert: 'Insert',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  capslock: 'Caps Lock',
  scrolllock: 'Scroll Lock',
  pause: 'Pause',
  printscreen: 'Print Screen',
  lshift: 'Left Shift',
  rshift: 'Right Shift',
  lctrl: 'Left Ctrl',
  rctrl: 'Right Ctrl',
  lalt: 'Left Alt',
  ralt: 'Right Alt',
  lwin: 'Left Windows',
  rwin: 'Right Windows',
  menu: 'Menu',
  minus: '-',
  equals: '=',
  lbracket: '[',
  rbracket: ']',
  backslash: '\\',
  semicolon: ';',
  quote: "'",
  comma: ',',
  period: '.',
  slash: '/',
  backtick: '`',
  volumeup: 'Volume Up',
  volumedown: 'Volume Down',
  mute: 'Mute',
  playpause: 'Play/Pause',
  nexttrack: 'Next Track',
  prevtrack: 'Previous Track',
  mouse3: 'Middle click',
  mouse4: 'Mouse 4 (lower side)',
  mouse5: 'Mouse 5 (upper side)',
  numadd: 'Num +',
  numsub: 'Num -',
  nummul: 'Num *',
  numdiv: 'Num /',
  numdec: 'Num .',
  numenter: 'Num Enter',
}

const KEY_SET = new Set(KEY_NAMES)
const VK_PATTERN = /^vk[0-9a-f]{2}$/

export function keyLabel(name: string | null): string {
  if (!name) {
    return 'None'
  }
  if (/^f\d{1,2}$/.test(name)) {
    return name.toUpperCase()
  }
  if (/^[a-z]$/.test(name) || /^\d$/.test(name)) {
    return name.toUpperCase()
  }
  if (/^num\d$/.test(name)) {
    return `Num ${name.slice(3)}`
  }
  if (VK_PATTERN.test(name)) {
    return `VK 0x${name.slice(2).toUpperCase()}`
  }
  return LABELS[name] ?? name
}

export function isValidKeyName(name: string): boolean {
  return KEY_SET.has(name) || VK_PATTERN.test(name)
}
