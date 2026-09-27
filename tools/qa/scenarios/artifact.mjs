export default async function ({ page, shot, wait }) {
  await page.goto('http://localhost:5174/postcard-perfect.html');
  await wait(3500);
  await shot('99-artifact-title');
}
