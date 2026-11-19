import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { DOWNLOAD_URL, QUESTIONS, STEPS } from '../src/content/site'

const isPhone = (name: string): boolean => name === 'phone'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('opens on the headline and a download for the current release', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Instant replay for voice chat.')
  const download = page.locator('#top').getByRole('link', { name: 'Download for Windows' })
  await expect(download).toHaveAttribute('href', DOWNLOAD_URL)
  await expect(page.getByRole('banner').getByRole('link', { name: 'Download' })).toHaveAttribute('href', DOWNLOAD_URL)
})

test('turns the header into a capsule once the page scrolls', async ({ page }) => {
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-scrolled')
  await page.mouse.wheel(0, 400)
  await expect(html).toHaveAttribute('data-scrolled', '')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(html).not.toHaveAttribute('data-scrolled')
})

test('never scrolls sideways', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})

test('opens the phone menu and closes it from a link or Escape', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'the menu button shows on narrow screens only')
  const menu = page.getByTestId('site-menu')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  await page.getByRole('button', { name: 'Open menu' }).click()
  await menu.getByRole('link', { name: 'Questions' }).click()
  await expect(menu).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeInViewport()
})

test('slides the nav pill behind the link under the pointer', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'the links sit in the menu on narrow screens')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Features' }).hover()
  await expect.poll(() => nav.evaluate((element) => element.style.getPropertyValue('--nav-o'))).toBe('1')
})

test('answers a question when it is opened', async ({ page }) => {
  const first = QUESTIONS[0]
  if (first === undefined) throw new Error('no questions')
  const answer = page.getByText(first.answer)
  await expect(answer).toBeHidden()
  await page.getByText(first.question).click()
  await expect(answer).toBeVisible()
})

test('loads every step picture and the demo video', async ({ page, request }) => {
  await page.locator('#how').scrollIntoViewIfNeeded()
  for (const step of STEPS) {
    const image = page.getByRole('img', { name: step.alt })
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
  }
  const video = page.getByTestId('demo-video')
  const sources = await video.locator('source').evaluateAll((elements) => elements.map((element) => element.getAttribute('src') ?? ''))
  const poster = (await video.getAttribute('poster')) ?? ''
  for (const url of [...sources, poster]) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(200)
  }
})

test('meets WCAG AA, contrast included', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.evaluate(() => window.scrollTo(0, 0))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('nextjs-portal').analyze()
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
})
