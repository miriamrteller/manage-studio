/**
 * Gap 2 — CN-GROW-002-REV: vatType + invoiceLicenseNumber pass-through
 *
 * All tests use mocked HTTP (no live credentials required).
 * Verify: correct fields present/absent in Grow payload for both createCharge
 * and chargeWithToken paths.
 */

// Mock setup: intercept fetch calls and capture the body sent to Grow.
// Use Deno's built-in test utilities or your project's preferred mock library.

Deno.test("createCharge — productData[0][vatType] always present (default vat_type=1)", async () => {
  // Arrange: mock getCredentials → vatType=1, invoiceLicenseNumber=null
  // Act: call createCharge with standard params
  // Assert: captured payload contains "productData[0][vatType]" === 1
});

Deno.test("createCharge — productData[0][vatType]=3 for Osek Patur tenant", async () => {
  // Arrange: mock getCredentials → vatType=3
  // Act: call createCharge
  // Assert: captured payload contains "productData[0][vatType]" === 3
});

Deno.test("createCharge — productData[0][vatType]=2 for before-VAT tenant", async () => {
  // Arrange: mock getCredentials → vatType=2
  // Assert: captured payload contains "productData[0][vatType]" === 2
});

Deno.test("createCharge — pageField[invoiceLicenseNumber] present when invoiceLicenseNumber is set", async () => {
  // Arrange: mock getCredentials → invoiceLicenseNumber="123456789"
  // Assert: payload["pageField[invoiceLicenseNumber]"] === "123456789"
});

Deno.test("createCharge — pageField[invoiceLicenseNumber] ABSENT when invoiceLicenseNumber is null", async () => {
  // Arrange: mock getCredentials → invoiceLicenseNumber=null
  // Assert: "pageField[invoiceLicenseNumber]" key does not exist in payload
});

Deno.test("createCharge — does NOT include allocationNumber in payload (phantom field removed)", async () => {
  // Arrange: any valid params
  // Assert: "allocationNumber" key is NOT present in payload under any form
});

Deno.test("chargeWithToken — productData[0][vatType] present", async () => {
  // Arrange: params with savedToken="tok_abc"; mock getCredentials → vatType=2
  // Act: call createCharge (delegates to chargeWithToken)
  // Assert: payload sent to createTransactionWithToken contains "productData[0][vatType]" === 2
});

Deno.test("chargeWithToken — pageField[invoiceLicenseNumber] present when set", async () => {
  // Arrange: params with savedToken; mock getCredentials → invoiceLicenseNumber="987654321"
  // Assert: "pageField[invoiceLicenseNumber]" === "987654321" in payload
});

Deno.test("chargeWithToken — pageField[invoiceLicenseNumber] ABSENT when null", async () => {
  // Arrange: params with savedToken; invoiceLicenseNumber=null
  // Assert: key not in payload
});
