import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { signWaiverToken } from "../_shared/waiver-token.ts";

interface GuardianInput {
  name: string;
  email: string;
  phone?: string;
}

interface StudentInput {
  name: string;
  dateOfBirth: string;
  gender?: "male" | "female" | "other";
}

interface CreateFamilyBody {
  action: "create_family";
  tenantSubdomain: string;
  guardian: GuardianInput;
  student: StudentInput;
}

interface CreateEngagementBody {
  action: "create_engagement";
  tenantSubdomain: string;
  studentPersonId: string;
  offeringId: string;
  seasonId: string;
}

type IntakeBody = CreateFamilyBody | CreateEngagementBody;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as IntakeBody;
    const service = createServiceClient();

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .select("id, business_preset")
      .eq("subdomain", body.tenantSubdomain)
      .single();

    if (tenantError || !tenant) {
      return jsonResponse({ error: "Tenant not found" }, 404);
    }

    const tenantId = tenant.id as string;

    if (body.action === "create_family") {
      const { guardian, student } = body;

      if (!guardian?.name?.trim() || !student?.name?.trim()) {
        return jsonResponse({ error: "Guardian and student names are required" }, 400);
      }
      if (!guardian.email?.trim() || !isValidEmail(guardian.email.trim())) {
        return jsonResponse({ error: "Valid guardian email is required" }, 400);
      }
      if (!student.dateOfBirth || !isValidDate(student.dateOfBirth)) {
        return jsonResponse({ error: "Valid student date of birth is required" }, 400);
      }

      const { data: guardianRow, error: guardianError } = await service
        .from("people")
        .insert({
          tenant_id: tenantId,
          name: guardian.name.trim(),
          email: guardian.email.trim().toLowerCase(),
          emergency_contact_phone: guardian.phone?.trim() || null,
          status: "active",
        })
        .select("id")
        .single();

      if (guardianError || !guardianRow) {
        return jsonResponse({ error: guardianError?.message ?? "Failed to create guardian" }, 500);
      }

      const { data: accountRow, error: accountError } = await service
        .from("accounts")
        .insert({
          tenant_id: tenantId,
          name: `${guardian.name.trim()} family`,
          person_id: guardianRow.id,
        })
        .select("id")
        .single();

      if (accountError || !accountRow) {
        return jsonResponse({ error: accountError?.message ?? "Failed to create family account" }, 500);
      }

      const { data: studentRow, error: studentError } = await service
        .from("people")
        .insert({
          tenant_id: tenantId,
          name: student.name.trim(),
          date_of_birth: student.dateOfBirth,
          gender: student.gender ?? null,
          account_id: accountRow.id,
          status: "active",
        })
        .select("id")
        .single();

      if (studentError || !studentRow) {
        return jsonResponse({ error: studentError?.message ?? "Failed to create student" }, 500);
      }

      const { error: memberError } = await service.from("account_members").insert({
        tenant_id: tenantId,
        account_id: accountRow.id,
        person_id: guardianRow.id,
        role: "account_holder",
        user_profile_id: null,
      });

      if (memberError) {
        return jsonResponse({ error: memberError.message }, 500);
      }

      return jsonResponse({
        accountId: accountRow.id,
        guardianPersonId: guardianRow.id,
        studentPersonId: studentRow.id,
        guardianEmail: guardian.email.trim().toLowerCase(),
      });
    }

    if (body.action === "create_engagement") {
      const { studentPersonId, offeringId, seasonId } = body;

      if (!studentPersonId || !offeringId || !seasonId) {
        return jsonResponse({ error: "studentPersonId, offeringId, and seasonId are required" }, 400);
      }

      const { data: student, error: studentError } = await service
        .from("people")
        .select("id, tenant_id, account_id")
        .eq("id", studentPersonId)
        .eq("tenant_id", tenantId)
        .single();

      if (studentError || !student) {
        return jsonResponse({ error: "Student not found" }, 404);
      }

      const { data: existing } = await service
        .from("engagements")
        .select("id, person_id")
        .eq("tenant_id", tenantId)
        .eq("person_id", studentPersonId)
        .eq("offering_id", offeringId)
        .eq("season_id", seasonId)
        .maybeSingle();

      let tokenRecipientEmail: string | null = null;
      if (student.account_id) {
        const { data: holder } = await service
          .from("account_members")
          .select("person_id")
          .eq("tenant_id", tenantId)
          .eq("account_id", student.account_id)
          .eq("role", "account_holder")
          .limit(1)
          .maybeSingle();
        if (holder?.person_id) {
          const { data: guardian } = await service
            .from("people")
            .select("email")
            .eq("tenant_id", tenantId)
            .eq("id", holder.person_id)
            .maybeSingle();
          tokenRecipientEmail = (guardian?.email as string | null)?.toLowerCase() ?? null;
        }
      }
      if (!tokenRecipientEmail) {
        const { data: studentEmailRow } = await service
          .from("people")
          .select("email")
          .eq("tenant_id", tenantId)
          .eq("id", studentPersonId)
          .maybeSingle();
        tokenRecipientEmail = (studentEmailRow?.email as string | null)?.toLowerCase() ?? null;
      }
      if (!tokenRecipientEmail) {
        return jsonResponse({ error: "No email available for enrolment token" }, 400);
      }

      if (existing) {
        const enrolmentToken = await signWaiverToken({
          eid: existing.id as string,
          tid: tenantId,
          em: tokenRecipientEmail,
          exp: Math.floor(Date.now() / 1000) + 24 * 3600,
        });
        return jsonResponse({ engagementId: existing.id, engagement: existing, enrolmentToken });
      }

      let payerPersonId = studentPersonId;
      if (student.account_id) {
        const { data: accountHolder } = await service
          .from("account_members")
          .select("person_id")
          .eq("account_id", student.account_id)
          .eq("role", "account_holder")
          .limit(1)
          .maybeSingle();
        if (accountHolder?.person_id) {
          payerPersonId = accountHolder.person_id as string;
        }
      }

      let billingAccountId: string | null = null;
      const { data: existingBilling } = await service
        .from("billing_accounts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("person_id", payerPersonId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (existingBilling?.id) {
        billingAccountId = existingBilling.id as string;
      } else {
        const { data: newBilling, error: billingError } = await service
          .from("billing_accounts")
          .insert({
            tenant_id: tenantId,
            person_id: payerPersonId,
            status: "active",
          })
          .select("id")
          .single();
        if (billingError || !newBilling) {
          return jsonResponse(
            { error: billingError?.message ?? "Failed to create billing account" },
            500,
          );
        }
        billingAccountId = newBilling.id as string;
      }

      const { data: engagement, error: engagementError } = await service
        .from("engagements")
        .insert({
          tenant_id: tenantId,
          person_id: studentPersonId,
          offering_id: offeringId,
          season_id: seasonId,
          billing_account_id: billingAccountId,
          status: "pending_payment",
        })
        .select("id, person_id, offering_id, season_id, status")
        .single();

      if (engagementError || !engagement) {
        return jsonResponse({ error: engagementError?.message ?? "Failed to create engagement" }, 500);
      }

      const enrolmentToken = await signWaiverToken({
        eid: engagement.id as string,
        tid: tenantId,
        em: tokenRecipientEmail,
        exp: Math.floor(Date.now() / 1000) + 24 * 3600,
      });

      return jsonResponse({ engagementId: engagement.id, engagement, enrolmentToken });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("[create-enrolment-intake]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
