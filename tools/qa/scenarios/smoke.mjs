export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(3000);
  await shot('01-title');
  await page.mouse.click(420, 300);
  await wait(2500);
  await shot('02-letter');
}
