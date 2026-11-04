import { z } from 'zod';
import { BaseService } from '@/services/base.service';
import { TenantDB } from '@/lib/db';
import type { Tenant } from '@shared/schemas';

/**
 * Appointment-based services are offerings with offering_type='appointment':
 * 1:1 bookable services (private lesson, assessment, consultation) defined by a
 * duration + the tenant's availability rules, with no fixed weekly slot. They are
 * managed separately from classes and surface on the public /book flow.
 */
export interface AppointmentService {
  id: string;
  name: string;
  duration_mins: number;
  price_minor: number;
  currency: string;
  location: string | null;
  is_public: boolean;
  status: string;
  /** Photos the package includes in the photo shop (beta). */
  photos_included: number;
  /** Clients can pick a free time and book it online. Off = they enquire instead. */
  online_booking: boolean;
  /** How the price shows to clients. */
  price_display: PriceDisplay;
  /** Deposit in minor units; null = none set. */
  deposit_minor: number | null;
}

export const PRICE_DISPLAYS = ['show', 'from', 'on_request'] as const;
export type PriceDisplay = (typeof PRICE_DISPLAYS)[number];

export function safePriceDisplay(raw: unknown): PriceDisplay {
  return (PRICE_DISPLAYS as readonly unknown[]).includes(raw) ? (raw as PriceDisplay) : 'show';
}

const ServiceInputSchema = z.object({
  name: z.string().min(1, 'Service name required'),
  duration_mins: z.number().int().positive('Duration must be > 0'),
  price_minor: z.number().int().nonnegative('Price must be >= 0'),
  currency: z.string().min(1).default('ILS'),
  location: z.string().max(500).nullable().optional(),
  is_public: z.boolean().optional(),
  status: z.enum(['active', 'cancelled']).optional(),
  photos_included: z.number().int().min(0).max(10000).optional(),
  online_booking: z.boolean().optional(),
  price_display: z.enum(PRICE_DISPLAYS).optional(),
  deposit_minor: z.number().int().nonnegative('Deposit must be >= 0').nullable().optional(),
});

export type ServiceInput = z.input<typeof ServiceInputSchema>;

function toService(row: Record<string, unknown>): AppointmentService {
  return {
    id: row.id as string,
    name: row.name as string,
    duration_mins: (row.duration_mins as number | null) ?? 0,
    price_minor: (row.price_minor as number) ?? 0,
    currency: (row.currency as string) ?? 'ILS',
    location: (row.location as string | null) ?? null,
    is_public: Boolean(row.is_public),
    status: (row.status as string) ?? 'active',
    photos_included: (row.photos_included as number | null) ?? 0,
    online_booking: row.online_booking === undefined ? true : Boolean(row.online_booking),
    price_display: safePriceDisplay(row.price_display),
    deposit_minor: (row.deposit_minor as number | null | undefined) ?? null,
  };
}

export class ServicesService extends BaseService {
  static async list(tenant: Tenant): Promise<AppointmentService[]> {
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.selectFor('offerings', tenant)
        .eq('offering_type', 'appointment')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => toService(row as Record<string, unknown>));
    }, 'ServicesService.list');
  }

  static async create(tenant: Tenant, input: ServiceInput): Promise<AppointmentService> {
    const values = ServiceInputSchema.parse(input);
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.insert('offerings', tenant, {
        ...values,
        offering_type: 'appointment',
        billing_mode: 'one_time',
        billing_interval: null,
        // Appointments carry no weekly slot; availability comes from booking hours.
        day_of_week: null,
        start_time: null,
        end_time: null,
        status: values.status ?? 'active',
      })
        .select()
        .single();
      if (error) throw error;
      const result = toService(data as Record<string, unknown>);
      await this.logAudit(tenant, 'CREATE', 'offerings', result.id);
      return result;
    }, 'ServicesService.create');
  }

  static async update(tenant: Tenant, id: string, input: ServiceInput): Promise<AppointmentService> {
    const values = ServiceInputSchema.parse(input);
    return this.withRetry(async () => {
      const { data, error } = await TenantDB.update('offerings', tenant, id, values)
        .select()
        .single();
      if (error) throw error;
      const result = toService(data as Record<string, unknown>);
      await this.logAudit(tenant, 'UPDATE', 'offerings', id);
      return result;
    }, 'ServicesService.update');
  }

  /** Soft-delete: appointment services are cancelled, never hard-deleted (bookings reference them). */
  static async remove(tenant: Tenant, id: string): Promise<void> {
    return this.withRetry(async () => {
      const { error } = await TenantDB.update('offerings', tenant, id, { status: 'cancelled' });
      if (error) throw error;
      await this.logAudit(tenant, 'UPDATE', 'offerings', id);
    }, 'ServicesService.remove');
  }
}
