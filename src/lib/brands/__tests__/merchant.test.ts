import { finish, test, eq } from "./harness";
import { cleanMerchantString, companyKey, editDistance, stripCorporateSuffix } from "../normalize";

console.log("merchant-string cleanup");
const cases: Array<[string, string]> = [
  ["AMZN Mktp US*2K4AB1CD2", "Amazon"],
  ["AMZN Mktp US*2K4", "Amazon"],
  ["Amazon.com*MK1234", "Amazon"],
  ["AMAZON PRIME*1A2B3", "Amazon"],
  ["SQ *BLUE BOTTLE", "BLUE BOTTLE"],
  ["SQ *BLUE BOTTLE COFFEE OAKLAND CA", "BLUE BOTTLE COFFEE OAKLAND"],
  ["TST* SWEETGREEN 1234", "SWEETGREEN"],
  ["PAYPAL *NETFLIX", "NETFLIX"],
  ["PAYPAL *NETFLIX.COM", "NETFLIX"],
  ["NETFLIX.COM", "NETFLIX"],
  ["Netflix.com 866-579-7172 CA", "Netflix"],
  ["APPLE.COM/BILL 866-712-7753", "Apple"],
  ["GOOGLE *YouTubePremium", "YouTubePremium"],
  ["WM SUPERCENTER #1234", "Walmart"],
  ["PELOTON* MEMBERSHIP", "PELOTON"],
  ["STARBUCKS STORE 12345", "Starbucks"],
  ["Coca-Cola", "Coca-Cola"],
  ["CeraVe", "CeraVe"],
];
for (const [input, expected] of cases) {
  void test(`${input} -> ${expected}`, () => eq(cleanMerchantString(input), expected));
}

void test("corporate suffixes", () => {
  eq(stripCorporateSuffix("The Coca-Cola Company"), "Coca-Cola");
  eq(stripCorporateSuffix("Procter & Gamble Co."), "Procter & Gamble");
  eq(stripCorporateSuffix("Peloton Interactive, Inc."), "Peloton Interactive");
  eq(companyKey("The Coca-Cola Company"), companyKey("Coca-Cola"));
});

void test("edit distance (OSA)", () => {
  eq(editDistance("dove", "dover"), 1);
  eq(editDistance("netflix", "netlfix"), 1); // transposition
  eq(editDistance("kitten", "sitting"), 3);
  eq(editDistance("abc", "abcdefg", 2), 3); // bounded
});

void finish();
