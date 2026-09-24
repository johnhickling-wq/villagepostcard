export default async function ({ page, shot, wait }) {
  await page.goto('http://localhost:5174/_wrapped.html');
  await wait(3500);
  await shot('99-artifact-title');
}
