# Tenant settings hub — Admin day-2 configuration

**Status:** Implemented  
**Route:** `/admin/setup/settings`  
**Audience:** `tenant_admin`  
**SPEC:** §6.y Tenant settings hub

## Purpose

Single page for ongoing tenant configuration changes after initial provisioning. Not a wizard; not for changing `business_preset` or `subdomain`.

## Sections

| Section | Fields | Save mechanism |
|---------|--------|----------------|
| School profile | `name` (editable), `subdomain` (read-only) | `tenants` UPDATE |
| Branding | `primary_color`, `accent_color` | `tenants` UPDATE + invalidate `['tenant']` |
| Language & region | `language_default`, `country`, `currency`, `phone_region` | `tenants` UPDATE; currency warns when payments exist |
| Integrations | Links to `/admin/setup/stripe` (Twilio/Resend when §6.x #4 ships) |
| Tax | Link to `/admin/setup/tax` |
| Compliance | Link to `/admin/setup/waivers` (when built) |

## Shared form components

- `SchoolProfileForm`
- `BrandingSettingsForm`
- `LocaleSettingsForm`

Reused by V3.0 operator wizard where tenant already exists; wizard steps 3–4 mirror these fields before `provision_tenant` on first-time create.

## Explicitly excluded

- `business_preset` change (operator wizard / support only)
- `subdomain` edit post-launch
- Terminology overrides in v1 (wizard-only until second tenant needs admin edits)
