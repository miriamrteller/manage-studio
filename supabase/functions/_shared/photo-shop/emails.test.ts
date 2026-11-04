import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildClientDeliveredEmail, buildStudioOrderEmail } from "./email-copy.ts";

Deno.test("studio email lists every photo with its gallery key, and the shoot link", () => {
  const e = buildStudioOrderEmail({
    language: "en",
    clientName: "Pat",
    totalFormatted: "₪30.00",
    photos: [{ fileName: "IMG_0001.jpg", key: "g-0001" }, { fileName: "IMG_0003.jpg", key: "g-0003" }],
    shootUrl: "https://studio.example/admin/jobs/e1",
  });
  assertEquals(e.subject, "New photo order: Pat (2)");
  assert(e.body.includes("• IMG_0001.jpg (g-0001)\n• IMG_0003.jpg (g-0003)"));
  assert(e.body.includes("₪30.00"));
  assert(e.body.endsWith("https://studio.example/admin/jobs/e1"));
  const he = buildStudioOrderEmail({ language: "he", clientName: "פט", totalFormatted: "₪30", photos: [], shootUrl: "u" });
  assertEquals(he.subject, "הזמנת תמונות חדשה: פט (0)");
});

Deno.test("client email has the download link and the account link", () => {
  const one = buildClientDeliveredEmail({
    language: "en", studioName: "Light Studio", photoCount: 1,
    downloadUrl: "https://smugmug.example/dl", portalUrl: "https://studio.example/dashboard/portal",
  });
  assertEquals(one.subject, "Your photos are ready to download");
  assert(one.body.startsWith("Light Studio has sent the photo you bought."));
  assert(one.body.includes("https://smugmug.example/dl"));
  const he = buildClientDeliveredEmail({
    language: "he", studioName: "סטודיו אור", photoCount: 3, downloadUrl: "d", portalUrl: "p",
  });
  assert(he.body.startsWith("סטודיו אור שלח/ה את 3 התמונות שקנית."));
});
