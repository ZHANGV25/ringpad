// Every word and link on the Ringpad page, so the copy can be read and checked in one place.
// The version and installer size match the v0.1.0 release; site.test.ts holds them to the app's
// own version so a release can't ship a page that points at the last one.

export const VERSION = '0.1.0'
export const INSTALLER_BYTES = 3_626_703
export const REPO_URL = 'https://github.com/ZHANGV25/ringpad'
export const DOWNLOAD_URL = `${REPO_URL}/releases/download/v${VERSION}/Ringpad_${VERSION}_x64-setup.exe`
export const RELEASES_URL = `${REPO_URL}/releases`
export const SETUP_URL = `${REPO_URL}/blob/main/docs/SETUP.md`
export const ISSUES_URL = `${REPO_URL}/issues/new/choose`
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
export const VB_CABLE_URL = 'https://vb-audio.com/Cable/'

export const SITE_TITLE = 'Ringpad: instant replay for voice chat'
export const SITE_DESCRIPTION =
  'A free soundboard for Windows that keeps the last 30 seconds of what your PC plays. F8 clips what a teammate just said, and F7 plays it into your mic.'

/** The installer's size as the page prints it, for example "3.6 MB". */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

export interface PageLink {
  readonly label: string
  readonly href: string
}

export const NAV_LINKS: readonly PageLink[] = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Questions', href: '#faq' },
]

export const FOOTER_LINKS: readonly PageLink[] = [
  { label: 'Setup guide', href: SETUP_URL },
  { label: 'Source code', href: REPO_URL },
  { label: 'Releases', href: RELEASES_URL },
  { label: 'Report a bug', href: ISSUES_URL },
  { label: 'License', href: LICENSE_URL },
]

export const HERO = {
  title: 'Instant replay for voice chat.',
  lead: 'Ringpad keeps the last 30 seconds of what your PC plays. When a teammate says something worth hearing again, F8 clips it and F7 plays it into your mic.',
  download: 'Download for Windows',
  tapeLabel: 'F8 clips the last 5 seconds',
} as const

export interface Figure {
  readonly value: string
  readonly label: string
}

export const FIGURES: readonly Figure[] = [
  { value: '30 s', label: 'of sound kept, ready to clip' },
  { value: '2 keys', label: 'F8 clips it, F7 sends it' },
  { value: '8 pads', label: 'for the clips you keep' },
  { value: 'Free', label: 'and open source' },
]

export const SCREEN = {
  title: 'Your team hears it over your voice',
  lead: 'F8 trims the silence, evens out the level and plays the clip to you first. F7 plays it into your mic, in Discord or in game, and you can keep talking while it plays.',
  alt: 'The Ringpad window: a clip is taken from the last 30 seconds, sent to the team, saved to pad 1 and played from it.',
} as const

export interface KeyRow {
  readonly keys: readonly string[]
  readonly does: string
}

export const KEYS: readonly KeyRow[] = [
  { keys: ['F8'], does: 'Clip what you just heard' },
  { keys: ['F7'], does: 'Play it to your team' },
  { keys: ['F6', 'F1'], does: 'Save it to pad 1' },
  { keys: ['F9'], does: 'Stop anything playing' },
]

export const KEYS_NOTE = 'Change any key in Settings, mouse side buttons included.'

export interface Step {
  readonly title: string
  readonly body: string
  readonly image: string
  readonly alt: string
}

export const STEPS_TITLE = 'Set up in about a minute'

export const STEPS: readonly Step[] = [
  {
    title: 'Install and add the mic',
    body: 'Run the installer, then let setup add VB-CABLE, the free virtual mic Ringpad plays through. It takes one click.',
    image: '/media/step-install.webp',
    alt: 'Ringpad setup on the Add the mic step, with an Install VB-CABLE button.',
  },
  {
    title: 'Pick Ringpad’s mic',
    body: 'In Discord or your game, set your input device to CABLE Output. Setup ticks it off once Discord can hear Ringpad.',
    image: '/media/step-mic.webp',
    alt: 'Ringpad setup on the Use Ringpad’s mic step, showing that Discord can hear Ringpad.',
  },
  {
    title: 'Press F8, then F7',
    body: 'F8 clips the last 5 seconds and plays it to you. F7 plays it to everyone, mixed with your voice.',
    image: '/media/step-keys.webp',
    alt: 'The Ringpad window with its two keys: F8 to clip what you just heard and F7 to play it to your team.',
  },
]

export interface Feature {
  readonly title: string
  readonly body: string
}

export const FEATURES_TITLE = 'What it does'

export const FEATURES: readonly Feature[] = [
  {
    title: 'Clips one app or all of them',
    body: 'Record everything your PC plays, one app such as Discord, or one output device. Clip from Discord alone and game sounds stay out of your clips.',
  },
  {
    title: 'Eight pads for the keepers',
    body: 'Save a clip to a pad with F6, or drop in your own WAV, MP3, OGG or FLAC file. Each pad has its own key and volume.',
  },
  {
    title: 'Holds your talk key',
    body: 'For push-to-talk chats, Ringpad can hold your talk key while a clip plays. It is a normal key press with no driver, and it stays off until you turn it on.',
  },
  {
    title: 'Never leaves your PC',
    body: 'No account, no telemetry and no network calls. Clips stay in your own folder and are deleted after 7 days.',
  },
]

export interface Question {
  readonly question: string
  readonly answer: string
}

export const FAQ_TITLE = 'Questions'
export const FAQ_GUIDE = 'Read the setup guide'

export const QUESTIONS: readonly Question[] = [
  {
    question: 'Will my team still hear my voice?',
    answer: 'Yes. Ringpad passes your real mic through the same virtual mic, so you sound the same as before and clips play on top.',
  },
  {
    question: 'Does it work with push-to-talk?',
    answer: 'Ringpad can make your own mic push-to-talk or toggle-to-talk. For games that only take voice while their talk key is held, turn on Hold my game’s talk key under Mic and Ringpad holds it while a clip plays.',
  },
  {
    question: 'Why does Windows warn me when I install it?',
    answer: 'The installer is not code-signed yet, so SmartScreen does not know it. Choose More info, then Run anyway. It installs for your user only, with no admin prompt.',
  },
  {
    question: 'What does it record?',
    answer: 'Only sound your PC already plays. The last 30 seconds stay in memory, and nothing is saved to disk until you clip it.',
  },
  {
    question: 'How much does it cost?',
    answer: 'Nothing. Ringpad is free and open source under the MIT license. VB-CABLE, the virtual mic it installs, is donationware from VB-Audio.',
  },
  {
    question: 'Will it slow down my game?',
    answer: 'Ringpad reads keys with Raw Input, the way games do, so it adds no input lag and never blocks a key. Keys work while you hold movement keys.',
  },
  {
    question: 'Can I get in trouble for using it?',
    answer: 'Clip what is funny or useful. Replaying someone to mock or harass them breaks the rules of most games and Discord servers, and it can get you banned.',
  },
]

export const CLOSER = {
  title: 'Get Ringpad',
  lead: 'Free for Windows 10 and 11. Setup takes about a minute.',
  download: 'Download for Windows',
  smallPrint: `Version ${VERSION}, ${formatMegabytes(INSTALLER_BYTES)}. Windows may warn you the first time: choose More info, then Run anyway.`,
} as const

export const FOOTER_LINE = 'Ringpad is free and open source. VB-CABLE is made by VB-Audio Software.'
