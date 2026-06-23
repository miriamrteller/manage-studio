import { describe, expect, it } from "vitest";
import {
  resolveAdminLinkRecipientEmail,
  resolveEnrolmentNotificationRecipient,
} from "../../../../supabase/functions/_shared/enrolment-recipient.ts";

type QueryResult = { data: unknown; error: unknown };

function createMockService(handlers: {
  people?: Record<string, QueryResult>;
  accountMembers?: QueryResult;
  userProfiles?: Record<string, QueryResult>;
  auditLog?: QueryResult;
}) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => {
          if (table === "people" && handlers.people?.[value]) {
            return {
              eq: () => ({
                single: async () => handlers.people![value],
                maybeSingle: async () => handlers.people![value],
              }),
              single: async () => handlers.people![value],
              maybeSingle: async () => handlers.people![value],
            };
          }
          if (table === "user_profiles" && handlers.userProfiles?.[value]) {
            return {
              maybeSingle: async () => handlers.userProfiles![value],
            };
          }
          if (table === "account_members") {
            return {
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => handlers.accountMembers ?? { data: null, error: null },
                  }),
                }),
              }),
            };
          }
          if (table === "audit_log") {
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => handlers.auditLog ?? { data: null, error: null },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return chain;
        },
      };
      return chain;
    },
  };
}

describe("resolveEnrolmentNotificationRecipient", () => {
  it("returns guardian email when student has no email", async () => {
    const service = createMockService({
      people: {
        "00000000-0000-0000-0000-000000000501": {
          data: {
            email: null,
            name: "Esther Stern",
            account_id: "00000000-0000-0000-0000-000000000401",
            user_profile_id: null,
          },
          error: null,
        },
        "00000000-0000-0000-0000-000000000504": {
          data: {
            email: "miriamrstern@gmail.com",
            name: "Miriam R Stern",
            user_profile_id: "00000000-0000-0000-0000-000000000510",
          },
          error: null,
        },
      },
      accountMembers: {
        data: { person_id: "00000000-0000-0000-0000-000000000504" },
        error: null,
      },
    });

    const recipient = await resolveEnrolmentNotificationRecipient(
      service as never,
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000501",
    );

    expect(recipient).toEqual({
      email: "miriamrstern@gmail.com",
      name: "Miriam R Stern",
    });
  });

  it("falls back to user_profiles email when guardian people.email is empty", async () => {
    const service = createMockService({
      people: {
        "00000000-0000-0000-0000-000000000501": {
          data: {
            email: null,
            name: "Esther Stern",
            account_id: "00000000-0000-0000-0000-000000000401",
            user_profile_id: null,
          },
          error: null,
        },
        "00000000-0000-0000-0000-000000000504": {
          data: {
            email: null,
            name: "Miriam R Stern",
            user_profile_id: "00000000-0000-0000-0000-000000000510",
          },
          error: null,
        },
      },
      accountMembers: {
        data: { person_id: "00000000-0000-0000-0000-000000000504" },
        error: null,
      },
      userProfiles: {
        "00000000-0000-0000-0000-000000000510": {
          data: { email: "miriamrstern@gmail.com" },
          error: null,
        },
      },
    });

    const recipient = await resolveEnrolmentNotificationRecipient(
      service as never,
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000501",
    );

    expect(recipient?.email).toBe("miriamrstern@gmail.com");
  });
});

describe("resolveAdminLinkRecipientEmail", () => {
  it("reads recipient_email from the latest admin link audit row", async () => {
    const service = createMockService({
      auditLog: {
        data: {
          after_state: { recipient_email: "miriamrstern@gmail.com" },
        },
        error: null,
      },
    });

    const email = await resolveAdminLinkRecipientEmail(
      service as never,
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000301",
    );

    expect(email).toBe("miriamrstern@gmail.com");
  });
});
