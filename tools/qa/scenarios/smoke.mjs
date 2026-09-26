// Boots, shows the title and the one-sentence opening.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(3000);
  await shot('01-title');
  await page.mouse.click(420, 200);
  await wait(1500);
  await shot('02-opening');
}
