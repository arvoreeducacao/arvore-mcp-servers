import puppeteer from "puppeteer";

export async function capturePage(options: {
  url: string;
  width: number;
  height: number;
  accessToken: string;
  delay?: number;
}): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.setViewport({
    width: options.width,
    height: options.height,
    deviceScaleFactor: 1,
  });

  const url = new URL(options.url);
  await page.setCookie({
    name: "access_token",
    value: options.accessToken,
    domain: url.hostname,
    path: "/",
  });

  await page.goto(options.url, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });

  await new Promise((r) => setTimeout(r, options.delay || 3000));

  const screenshot = await page.screenshot({
    type: "png",
    fullPage: false,
  });

  await browser.close();
  return Buffer.from(screenshot);
}
