import { finish, test, eq, ok } from "./harness";
import { seedFixtures } from "./fixtures";
import { detectBrandsByDictionary, detectBrandsInText } from "../detect-text";
import { ImageValidationError, sniffImageType, validateImage, MAX_IMAGE_BYTES } from "../detect-image";
import { rateLimit, resetRateLimits } from "../rate-limit";

seedFixtures();

console.log("text dictionary fallback");
void test("finds brands and aliases", () => {
  const d = detectBrandsByDictionary("I drink Coke, use Crest and take Nature Made vitamins");
  eq(d.map((x) => x.brand).sort(), ["Coca-Cola", "Crest", "Nature Made"]);
  ok(d.every((x) => x.source === "text"), "source");
});
void test("longest phrase wins, whole words only", () => {
  eq(detectBrandsByDictionary("Blue Bottle coffee and a Dover Saddlery saddle").map((x) => x.brand).sort(), [
    "Blue Bottle Coffee", "Dover Saddlery",
  ]);
  eq(detectBrandsByDictionary("Doves flew over Dovercourt").length, 0);
});
void test("negation skips brands after the negator", () => {
  eq(detectBrandsByDictionary("I drink Coke but I don't use Crest").map((x) => x.brand), ["Coca-Cola"]);
});
void test("no API key -> dictionary path", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    eq((await detectBrandsInText("netflix and amazon")).map((x) => x.brand).sort(), ["Amazon", "Netflix"]);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

console.log("image validation");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const heic = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);
void test("sniffs formats", () => {
  eq(sniffImageType(jpeg), "image/jpeg");
  eq(sniffImageType(png), "image/png");
  eq(sniffImageType(webp), "image/webp");
  eq(sniffImageType(heic), "image/heic");
});
const status = (fn: () => unknown) => {
  try {
    fn();
    return 0;
  } catch (e) {
    return e instanceof ImageValidationError ? e.status : -1;
  }
};
void test("rejects HEIC (415), oversize (413), unknown (415), empty (400)", () => {
  eq(status(() => validateImage(heic, "image/heic")), 415);
  eq(status(() => validateImage(jpeg, "image/heif")), 415);
  eq(status(() => validateImage(new Uint8Array(MAX_IMAGE_BYTES + 1).fill(0xff))), 413);
  eq(status(() => validateImage(new TextEncoder().encode("GIF89a......"))), 415);
  eq(status(() => validateImage(new Uint8Array())), 400);
  eq(validateImage(png, "image/jpeg"), "image/png"); // magic bytes beat the declared type
});

console.log("rate limit");
void test("blocks after limit per key", () => {
  resetRateLimits();
  const r = Array.from({ length: 4 }, () => rateLimit("t", "1.2.3.4", 3, 60_000).ok);
  eq(r, [true, true, true, false]);
  eq(rateLimit("t", "5.6.7.8", 3, 60_000).ok, true);
});

setTimeout(finish, 50);
