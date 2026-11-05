/**
 * Guest signing links prefill the signer's name, email and phone, never the ID
 * number or address.
 * Run: cd supabase/functions && deno test _shared/guest-signer-prefill.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickGuestSignerPrefill } from "./guest-signer-prefill.ts";

const parent = { name: "Dana Cohen", email: "Dana@Example.test", phone: "050-000-0001" };
const child = { name: "Yael Cohen", email: "yael@example.test", phone: null };

Deno.test("the link's email picks the signer: name, email and phone", () => {
  assertEquals(pickGuestSignerPrefill("dana@example.test", [parent, child]), {
    full_name: "Dana Cohen",
    email: "dana@example.test",
    phone: "050-000-0001",
  });
  assertEquals(pickGuestSignerPrefill(" YAEL@example.test ", [parent, child]), {
    full_name: "Yael Cohen",
    email: "yael@example.test",
    phone: null,
  });
});

Deno.test("never carries an ID number or address", () => {
  const withExtras = { ...parent, id_number: "000000018", address: "1 Example St" } as typeof parent;
  const prefill = pickGuestSignerPrefill("dana@example.test", [withExtras]);
  assertEquals(Object.keys(prefill).sort(), ["email", "full_name", "phone"]);
});

Deno.test("an email no one has on file prefills the email only", () => {
  assertEquals(pickGuestSignerPrefill("other@example.test", [parent, child]), {
    full_name: null,
    email: "other@example.test",
    phone: null,
  });
});
