export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_members: {
        Row: {
          account_id: string
          created_at: string
          id: string
          person_id: string
          role: string
          tenant_id: string
          user_profile_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          person_id: string
          role?: string
          tenant_id: string
          user_profile_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          person_id?: string
          role?: string
          tenant_id?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_members_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          id: string
          name: string | null
          person_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          person_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          person_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attended: boolean
          created_at: string
          id: string
          person_id: string
          session_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attended?: boolean
          created_at?: string
          id?: string
          person_id: string
          session_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attended?: boolean
          created_at?: string
          id?: string
          person_id?: string
          session_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "offering_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_accounts: {
        Row: {
          account_id: string | null
          business_name: string | null
          business_tax_id: string | null
          created_at: string
          id: string
          person_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          business_name?: string | null
          business_tax_id?: string | null
          created_at?: string
          id?: string
          person_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          business_name?: string | null
          business_tax_id?: string | null
          created_at?: string
          id?: string
          person_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_schedules: {
        Row: {
          attempt_count: number
          billing_account_id: string | null
          created_at: string
          engagement_id: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_attempt_at: string | null
          next_billing_date: string
          payment_method_token_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          billing_account_id?: string | null
          created_at?: string
          engagement_id: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          next_billing_date: string
          payment_method_token_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          billing_account_id?: string | null
          created_at?: string
          engagement_id?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          next_billing_date?: string
          payment_method_token_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_schedules_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_schedules_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_schedules_payment_method_token_id_fkey"
            columns: ["payment_method_token_id"]
            isOneToOne: false
            referencedRelation: "payment_method_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
          version_hash: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          version_hash: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          version_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_preferences: {
        Row: {
          account_member_id: string | null
          created_at: string
          email_opted_in: boolean
          id: string
          language: string
          notify_announcements: boolean
          notify_offering_cancellation: boolean
          notify_payment_due: boolean
          notify_schedule_change: boolean
          notify_waitlist: boolean
          person_id: string | null
          preferred_channel: string
          tenant_id: string
          updated_at: string
          voice_number: string | null
          voice_opted_in: boolean
          whatsapp_number: string | null
          whatsapp_opted_in: boolean
          whatsapp_verified: boolean
        }
        Insert: {
          account_member_id?: string | null
          created_at?: string
          email_opted_in?: boolean
          id?: string
          language?: string
          notify_announcements?: boolean
          notify_offering_cancellation?: boolean
          notify_payment_due?: boolean
          notify_schedule_change?: boolean
          notify_waitlist?: boolean
          person_id?: string | null
          preferred_channel?: string
          tenant_id: string
          updated_at?: string
          voice_number?: string | null
          voice_opted_in?: boolean
          whatsapp_number?: string | null
          whatsapp_opted_in?: boolean
          whatsapp_verified?: boolean
        }
        Update: {
          account_member_id?: string | null
          created_at?: string
          email_opted_in?: boolean
          id?: string
          language?: string
          notify_announcements?: boolean
          notify_offering_cancellation?: boolean
          notify_payment_due?: boolean
          notify_schedule_change?: boolean
          notify_waitlist?: boolean
          person_id?: string | null
          preferred_channel?: string
          tenant_id?: string
          updated_at?: string
          voice_number?: string | null
          voice_opted_in?: boolean
          whatsapp_number?: string | null
          whatsapp_opted_in?: boolean
          whatsapp_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contact_preferences_account_member_id_fkey"
            columns: ["account_member_id"]
            isOneToOne: false
            referencedRelation: "account_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_queue: {
        Row: {
          attempts: number
          created_at: string
          document_kind: string
          id: string
          last_error: string | null
          payment_id: string
          processing_started_at: string | null
          scheduled_for: string
          status: string
          succeeded_at: string | null
          tenant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          document_kind: string
          id?: string
          last_error?: string | null
          payment_id: string
          processing_started_at?: string | null
          scheduled_for?: string
          status?: string
          succeeded_at?: string | null
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          document_kind?: string
          id?: string
          last_error?: string | null
          payment_id?: string
          processing_started_at?: string | null
          scheduled_for?: string
          status?: string
          succeeded_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_queue_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          age_at_season_start: number | null
          age_override_at: string | null
          age_override_by: string | null
          age_override_reason: string | null
          age_review_note: string | null
          billing_account_id: string | null
          billing_status: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          offering_id: string
          payment_received_at: string | null
          person_id: string
          provider_customer_ref: string | null
          season_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          waiver_48h_reminded_at: string | null
          waiver_5d_reminded_at: string | null
          waiver_deadline: string | null
          waiver_evidence_id: string | null
        }
        Insert: {
          age_at_season_start?: number | null
          age_override_at?: string | null
          age_override_by?: string | null
          age_override_reason?: string | null
          age_review_note?: string | null
          billing_account_id?: string | null
          billing_status?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          offering_id: string
          payment_received_at?: string | null
          person_id: string
          provider_customer_ref?: string | null
          season_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          waiver_48h_reminded_at?: string | null
          waiver_5d_reminded_at?: string | null
          waiver_deadline?: string | null
          waiver_evidence_id?: string | null
        }
        Update: {
          age_at_season_start?: number | null
          age_override_at?: string | null
          age_override_by?: string | null
          age_override_reason?: string | null
          age_review_note?: string | null
          billing_account_id?: string | null
          billing_status?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          offering_id?: string
          payment_received_at?: string | null
          person_id?: string
          provider_customer_ref?: string | null
          season_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          waiver_48h_reminded_at?: string | null
          waiver_5d_reminded_at?: string | null
          waiver_deadline?: string | null
          waiver_evidence_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagements_age_override_by_fkey"
            columns: ["age_override_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_waiver_evidence_id_fkey"
            columns: ["waiver_evidence_id"]
            isOneToOne: false
            referencedRelation: "waiver_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolment_resume_drafts: {
        Row: {
          created_at: string
          engagement_id: string | null
          expires_at: string
          id: string
          resume_key: string
          state_json: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          engagement_id?: string | null
          expires_at: string
          id?: string
          resume_key: string
          state_json: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          engagement_id?: string | null
          expires_at?: string
          id?: string
          resume_key?: string
          state_json?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolment_resume_drafts_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolment_resume_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_vat_eligible: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_vat_eligible?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_vat_eligible?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoicing_token_cache: {
        Row: {
          expires_at: string
          tenant_id: string
          token: string
        }
        Insert: {
          expires_at: string
          tenant_id: string
          token: string
        }
        Update: {
          expires_at?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoicing_token_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          body_preview: string | null
          channel: string
          created_at: string
          external_msg_id: string | null
          failure_reason: string | null
          id: string
          recipient_account_member_id: string | null
          recipient_email: string | null
          recipient_person_id: string | null
          recipient_phone: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_name: string
          tenant_id: string
          variables: Json | null
        }
        Insert: {
          body_preview?: string | null
          channel?: string
          created_at?: string
          external_msg_id?: string | null
          failure_reason?: string | null
          id?: string
          recipient_account_member_id?: string | null
          recipient_email?: string | null
          recipient_person_id?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_name: string
          tenant_id: string
          variables?: Json | null
        }
        Update: {
          body_preview?: string | null
          channel?: string
          created_at?: string
          external_msg_id?: string | null
          failure_reason?: string | null
          id?: string
          recipient_account_member_id?: string | null
          recipient_email?: string | null
          recipient_person_id?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_name?: string
          tenant_id?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_recipient_account_member_id_fkey"
            columns: ["recipient_account_member_id"]
            isOneToOne: false
            referencedRelation: "account_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_recipient_person_id_fkey"
            columns: ["recipient_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_requirements: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          offering_id: string
          requirement_template_id: string | null
          tenant_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          offering_id: string
          requirement_template_id?: string | null
          tenant_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          offering_id?: string
          requirement_template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_requirements_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_requirements_requirement_template_id_fkey"
            columns: ["requirement_template_id"]
            isOneToOne: false
            referencedRelation: "requirement_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_requirements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_sessions: {
        Row: {
          created_at: string
          end_time: string
          id: string
          offering_id: string
          session_date: string
          start_time: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          offering_id: string
          session_date: string
          start_time: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          offering_id?: string
          session_date?: string
          start_time?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_sessions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          billing_interval: string | null
          billing_mode: string
          category_id: string | null
          cover_image_path: string | null
          created_at: string
          currency: string
          day_of_week: number | null
          delivery_mode: string
          end_time: string
          id: string
          is_public: boolean
          max_age: number | null
          max_capacity: number
          min_age: number | null
          name: string
          price_minor: number
          renewal_policy: string
          season_id: string | null
          setup_fee_minor: number
          staff_id: string | null
          start_time: string
          status: string
          tenant_id: string
          updated_at: string
          waiver_required: boolean
        }
        Insert: {
          billing_interval?: string | null
          billing_mode?: string
          category_id?: string | null
          cover_image_path?: string | null
          created_at?: string
          currency?: string
          day_of_week?: number | null
          delivery_mode?: string
          end_time: string
          id?: string
          is_public?: boolean
          max_age?: number | null
          max_capacity?: number
          min_age?: number | null
          name: string
          price_minor?: number
          renewal_policy?: string
          season_id?: string | null
          setup_fee_minor?: number
          staff_id?: string | null
          start_time: string
          status?: string
          tenant_id: string
          updated_at?: string
          waiver_required?: boolean
        }
        Update: {
          billing_interval?: string | null
          billing_mode?: string
          category_id?: string | null
          cover_image_path?: string | null
          created_at?: string
          currency?: string
          day_of_week?: number | null
          delivery_mode?: string
          end_time?: string
          id?: string
          is_public?: boolean
          max_age?: number | null
          max_capacity?: number
          min_age?: number | null
          name?: string
          price_minor?: number
          renewal_policy?: string
          season_id?: string | null
          setup_fee_minor?: number
          staff_id?: string | null
          start_time?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          waiver_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "offerings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          message_id: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          message_id: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          message_id?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: []
      }
      payment_method_tokens: {
        Row: {
          billing_account_id: string
          card_brand: string | null
          created_at: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          provider: string
          provider_token: string
          revoked_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_account_id: string
          card_brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          provider: string
          provider_token: string
          revoked_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_account_id?: string
          card_brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          provider?: string
          provider_token?: string
          revoked_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_tokens_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_id: string | null
          anonymised_at: string | null
          approved_by: string | null
          billing_account_id: string | null
          charge_type: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          engagement_id: string | null
          external_document_id: string | null
          external_document_number: string | null
          id: string
          invoice_issued_at: string | null
          invoice_url: string | null
          offering_id: string | null
          paid_at: string | null
          payment_method: string | null
          person_id: string | null
          pretax_amount_minor: number
          provider: string
          provider_payment_ref: string | null
          refund_amount_minor: number | null
          refunded_at: string | null
          refunds_payment_id: string | null
          status: string
          tenant_id: string
          total_amount_minor: number
          vat_amount_minor: number
          vat_rate: number
        }
        Insert: {
          account_id?: string | null
          anonymised_at?: string | null
          approved_by?: string | null
          billing_account_id?: string | null
          charge_type?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          engagement_id?: string | null
          external_document_id?: string | null
          external_document_number?: string | null
          id?: string
          invoice_issued_at?: string | null
          invoice_url?: string | null
          offering_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          person_id?: string | null
          pretax_amount_minor: number
          provider?: string
          provider_payment_ref?: string | null
          refund_amount_minor?: number | null
          refunded_at?: string | null
          refunds_payment_id?: string | null
          status?: string
          tenant_id: string
          total_amount_minor: number
          vat_amount_minor?: number
          vat_rate?: number
        }
        Update: {
          account_id?: string | null
          anonymised_at?: string | null
          approved_by?: string | null
          billing_account_id?: string | null
          charge_type?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          engagement_id?: string | null
          external_document_id?: string | null
          external_document_number?: string | null
          id?: string
          invoice_issued_at?: string | null
          invoice_url?: string | null
          offering_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          person_id?: string | null
          pretax_amount_minor?: number
          provider?: string
          provider_payment_ref?: string | null
          refund_amount_minor?: number | null
          refunded_at?: string | null
          refunds_payment_id?: string | null
          status?: string
          tenant_id?: string
          total_amount_minor?: number
          vat_amount_minor?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_refunds_payment_id_fkey"
            columns: ["refunds_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          account_id: string | null
          allergies: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          media_consent: boolean
          medical_notes: string | null
          name: string
          photo_consent: boolean
          status: string
          tenant_id: string
          updated_at: string
          user_profile_id: string | null
          waiver_accepted_at: string | null
          waiver_version: string | null
        }
        Insert: {
          account_id?: string | null
          allergies?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          media_consent?: boolean
          medical_notes?: string | null
          name: string
          photo_consent?: boolean
          status?: string
          tenant_id: string
          updated_at?: string
          user_profile_id?: string | null
          waiver_accepted_at?: string | null
          waiver_version?: string | null
        }
        Update: {
          account_id?: string | null
          allergies?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          media_consent?: boolean
          medical_notes?: string | null
          name?: string
          photo_consent?: boolean
          status?: string
          tenant_id?: string
          updated_at?: string
          user_profile_id?: string | null
          waiver_accepted_at?: string | null
          waiver_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_people_account"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_overrides: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          person_id: string
          request_reason: string | null
          requirement_template_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          person_id: string
          request_reason?: string | null
          requirement_template_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          person_id?: string
          request_reason?: string | null
          requirement_template_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_overrides_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_overrides_requirement_template_id_fkey"
            columns: ["requirement_template_id"]
            isOneToOne: false
            referencedRelation: "requirement_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_templates: {
        Row: {
          config: Json
          created_at: string
          display_text: string | null
          id: string
          is_hard_block: boolean
          name: string
          requirement_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          display_text?: string | null
          id?: string
          is_hard_block?: boolean
          name: string
          requirement_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          display_text?: string | null
          id?: string
          is_hard_block?: boolean
          name?: string
          requirement_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_credits: {
        Row: {
          created_at: string
          credit_type: string
          expires_at: string | null
          id: string
          offering_id: string
          person_id: string
          sessions_remaining: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_type?: string
          expires_at?: string | null
          id?: string
          offering_id: string
          person_id: string
          sessions_remaining?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_type?: string
          expires_at?: string | null
          id?: string
          offering_id?: string
          person_id?: string
          sessions_remaining?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_credits_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_credits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          contract_type: string | null
          created_at: string
          email: string | null
          hourly_rate_minor: number | null
          id: string
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
          user_profile_id: string | null
        }
        Insert: {
          contract_type?: string | null
          created_at?: string
          email?: string | null
          hourly_rate_minor?: number | null
          id?: string
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
          user_profile_id?: string | null
        }
        Update: {
          contract_type?: string | null
          created_at?: string
          email?: string | null
          hourly_rate_minor?: number | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_email_customizations: {
        Row: {
          created_at: string
          id: string
          language: string
          overrides: Json
          template_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          language: string
          overrides: Json
          template_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          overrides?: Json
          template_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_email_customizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_notification_templates: {
        Row: {
          approval_date: string | null
          approval_notes: string | null
          channel: string
          created_at: string
          email_template_id: string | null
          id: string
          status: string
          template_name: string
          tenant_id: string
          twilio_content_sid: string | null
          updated_at: string
          version: number
          voice_script_sid: string | null
        }
        Insert: {
          approval_date?: string | null
          approval_notes?: string | null
          channel: string
          created_at?: string
          email_template_id?: string | null
          id?: string
          status?: string
          template_name: string
          tenant_id: string
          twilio_content_sid?: string | null
          updated_at?: string
          version?: number
          voice_script_sid?: string | null
        }
        Update: {
          approval_date?: string | null
          approval_notes?: string | null
          channel?: string
          created_at?: string
          email_template_id?: string | null
          id?: string
          status?: string
          template_name?: string
          tenant_id?: string
          twilio_content_sid?: string | null
          updated_at?: string
          version?: number
          voice_script_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_notification_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string
          billing_policy: Json
          business_preset: string
          country: string
          created_at: string
          currency: string
          from_email: string | null
          id: string
          invoicing_account_id: string | null
          invoicing_api_key_enc: string | null
          invoicing_auth_checked_at: string | null
          invoicing_auth_valid_until: string | null
          invoicing_credentials_updated_at: string | null
          invoicing_provider: string
          invoicing_secret_enc: string | null
          labels: Json
          language_default: string
          name: string
          payment_provider: string
          payment_provider_account_id: string | null
          payment_provider_public_key: string | null
          payment_provider_secret_enc: string | null
          payment_provider_updated_at: string | null
          payment_provider_webhook_enc: string | null
          phone_region: string
          phone_region_updated_at: string
          prices_include_vat: boolean
          primary_color: string
          subdomain: string
          updated_at: string
          vat_rate: number | null
          waiver_require_otp: boolean
        }
        Insert: {
          accent_color?: string
          billing_policy?: Json
          business_preset?: string
          country?: string
          created_at?: string
          currency?: string
          from_email?: string | null
          id?: string
          invoicing_account_id?: string | null
          invoicing_api_key_enc?: string | null
          invoicing_auth_checked_at?: string | null
          invoicing_auth_valid_until?: string | null
          invoicing_credentials_updated_at?: string | null
          invoicing_provider?: string
          invoicing_secret_enc?: string | null
          labels?: Json
          language_default?: string
          name: string
          payment_provider?: string
          payment_provider_account_id?: string | null
          payment_provider_public_key?: string | null
          payment_provider_secret_enc?: string | null
          payment_provider_updated_at?: string | null
          payment_provider_webhook_enc?: string | null
          phone_region?: string
          phone_region_updated_at?: string
          prices_include_vat?: boolean
          primary_color?: string
          subdomain: string
          updated_at?: string
          vat_rate?: number | null
          waiver_require_otp?: boolean
        }
        Update: {
          accent_color?: string
          billing_policy?: Json
          business_preset?: string
          country?: string
          created_at?: string
          currency?: string
          from_email?: string | null
          id?: string
          invoicing_account_id?: string | null
          invoicing_api_key_enc?: string | null
          invoicing_auth_checked_at?: string | null
          invoicing_auth_valid_until?: string | null
          invoicing_credentials_updated_at?: string | null
          invoicing_provider?: string
          invoicing_secret_enc?: string | null
          labels?: Json
          language_default?: string
          name?: string
          payment_provider?: string
          payment_provider_account_id?: string | null
          payment_provider_public_key?: string | null
          payment_provider_secret_enc?: string | null
          payment_provider_updated_at?: string | null
          payment_provider_webhook_enc?: string | null
          phone_region?: string
          phone_region_updated_at?: string
          prices_include_vat?: boolean
          primary_color?: string
          subdomain?: string
          updated_at?: string
          vat_rate?: number | null
          waiver_require_otp?: boolean
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          country: string | null
          created_at: string
          email: string | null
          id: string
          language: string | null
          person_id: string | null
          role: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email?: string | null
          id: string
          language?: string | null
          person_id?: string | null
          role?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          language?: string | null
          person_id?: string | null
          role?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_attempts: {
        Row: {
          attempt_count: number
          blocked_until: string | null
          channel: string
          contact_point: string
          created_at: string
          id: string
          last_attempt_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          blocked_until?: string | null
          channel: string
          contact_point: string
          created_at?: string
          id?: string
          last_attempt_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          blocked_until?: string | null
          channel?: string
          contact_point?: string
          created_at?: string
          id?: string
          last_attempt_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          added_at: string
          id: string
          offering_id: string
          person_id: string
          tenant_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          offering_id: string
          person_id: string
          tenant_id: string
        }
        Update: {
          added_at?: string
          id?: string
          offering_id?: string
          person_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          tenant_id: string
          waiver_evidence_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          tenant_id: string
          waiver_evidence_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string
          waiver_evidence_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiver_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_events_waiver_evidence_id_fkey"
            columns: ["waiver_evidence_id"]
            isOneToOne: false
            referencedRelation: "waiver_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_evidence: {
        Row: {
          accept_language: string | null
          account_member_id: string | null
          consent_template_id: string
          consent_version: number
          consent_version_hash: string
          created_at: string
          guardian_confirmed: boolean
          hmac_key_version: number
          id: string
          idempotency_key: string
          ip_address: unknown
          offering_id: string | null
          otp_verify_sid: string | null
          pdf_sha256: string
          pdf_storage_path: string
          person_id: string
          record_hmac: string
          signature_method: string
          signed_at: string
          signed_by_email: string | null
          signed_by_name: string
          signed_by_role: string
          status: string
          tenant_id: string
          user_agent: string | null
          viewed_at: string | null
          wording_snapshot: string
        }
        Insert: {
          accept_language?: string | null
          account_member_id?: string | null
          consent_template_id: string
          consent_version: number
          consent_version_hash: string
          created_at?: string
          guardian_confirmed?: boolean
          hmac_key_version?: number
          id?: string
          idempotency_key: string
          ip_address?: unknown
          offering_id?: string | null
          otp_verify_sid?: string | null
          pdf_sha256: string
          pdf_storage_path: string
          person_id: string
          record_hmac: string
          signature_method?: string
          signed_at?: string
          signed_by_email?: string | null
          signed_by_name: string
          signed_by_role?: string
          status?: string
          tenant_id: string
          user_agent?: string | null
          viewed_at?: string | null
          wording_snapshot: string
        }
        Update: {
          accept_language?: string | null
          account_member_id?: string | null
          consent_template_id?: string
          consent_version?: number
          consent_version_hash?: string
          created_at?: string
          guardian_confirmed?: boolean
          hmac_key_version?: number
          id?: string
          idempotency_key?: string
          ip_address?: unknown
          offering_id?: string | null
          otp_verify_sid?: string | null
          pdf_sha256?: string
          pdf_storage_path?: string
          person_id?: string
          record_hmac?: string
          signature_method?: string
          signed_at?: string
          signed_by_email?: string | null
          signed_by_name?: string
          signed_by_role?: string
          status?: string
          tenant_id?: string
          user_agent?: string | null
          viewed_at?: string | null
          wording_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_evidence_account_member_id_fkey"
            columns: ["account_member_id"]
            isOneToOne: false
            referencedRelation: "account_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_evidence_consent_template_id_fkey"
            columns: ["consent_template_id"]
            isOneToOne: false
            referencedRelation: "consent_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_evidence_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_evidence_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_enrolment_lookup_email: { Args: { p_email: string }; Returns: Json }
      cancel_engagement: {
        Args: { p_engagement_id: string; p_reason?: string }
        Returns: Json
      }
      check_subdomain_available: {
        Args: { p_subdomain: string }
        Returns: boolean
      }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_old_verification_attempts: { Args: never; Returns: number }
      get_billing_account_payment_method: {
        Args: { p_billing_account_id: string }
        Returns: {
          card_brand: string
          exp_month: number
          exp_year: number
          is_default: boolean
          last4: string
        }[]
      }
      get_engagement_person_id: {
        Args: { p_engagement_id: string }
        Returns: string
      }
      get_my_account_ids: { Args: never; Returns: string[] }
      get_my_person_id: { Args: never; Returns: string }
      get_my_profile: {
        Args: never
        Returns: {
          country: string | null
          created_at: string
          email: string | null
          id: string
          language: string | null
          person_id: string | null
          role: string[]
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_tenant_id: { Args: never; Returns: string }
      get_pending_waiver_engagement: {
        Args: { p_engagement_id: string }
        Returns: {
          current_status: string
          offering_id: string
          person_id: string
        }[]
      }
      get_public_offerings_by_subdomain: {
        Args: { p_subdomain: string }
        Returns: {
          billing_interval: string
          billing_mode: string
          category_id: string
          category_name: string
          cover_image_path: string
          currency: string
          day_of_week: number
          end_time: string
          id: string
          max_age: number
          max_capacity: number
          min_age: number
          name: string
          price_minor: number
          season_id: string
          season_start_date: string
          start_time: string
          status: string
          tenant_id: string
          tenant_subdomain: string
          updated_at: string
          waiver_required: boolean
        }[]
      }
      get_tenant_config_by_subdomain: {
        Args: { p_subdomain: string }
        Returns: {
          accent_color: string
          business_preset: string
          country: string
          currency: string
          id: string
          labels: Json
          language_default: string
          name: string
          payment_provider_public_key: string
          payment_provider_secret_configured: boolean
          payment_provider_updated_at: string
          payment_provider_webhook_configured: boolean
          prices_include_vat: boolean
          primary_color: string
          tenant_subdomain: string
          vat_rate: number
        }[]
      }
      get_tenant_invoicing_credentials: {
        Args: { p_tenant_id: string }
        Returns: {
          invoicing_account_id: string
          invoicing_api_key: string
          invoicing_secret: string
        }[]
      }
      get_tenant_payment_credentials: {
        Args: { p_tenant_id: string }
        Returns: {
          payment_provider_public_key: string
          payment_provider_secret_key: string
          payment_provider_webhook_secret: string
        }[]
      }
      guest_enrolment_check_email: {
        Args: { p_email: string; p_subdomain: string }
        Returns: Json
      }
      guest_enrolment_create_adult: {
        Args: {
          p_date_of_birth?: string
          p_email: string
          p_name: string
          p_phone?: string
          p_subdomain: string
        }
        Returns: Json
      }
      guest_enrolment_create_engagement: {
        Args: {
          p_offering_id: string
          p_season_id: string
          p_student_person_id: string
          p_subdomain: string
        }
        Returns: Json
      }
      guest_enrolment_create_family: {
        Args: {
          p_guardian_email: string
          p_guardian_name: string
          p_guardian_phone: string
          p_student_dob: string
          p_student_name: string
          p_subdomain: string
        }
        Returns: Json
      }
      increment_verification_attempt: {
        Args: {
          p_channel: string
          p_contact_point: string
          p_tenant_id: string
        }
        Returns: {
          attempt_count: number
          blocked_until: string
        }[]
      }
      is_minor: { Args: { date_of_birth: string }; Returns: boolean }
      is_service_role: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      link_auth_user_to_guardian_for_engagement: {
        Args: { p_engagement_id: string }
        Returns: undefined
      }
      link_auth_user_to_person: {
        Args: { p_person_id: string }
        Returns: undefined
      }
      provision_tenant: {
        Args: {
          p_accent_color?: string
          p_admin_email?: string
          p_business_preset?: string
          p_country?: string
          p_currency?: string
          p_from_email?: string
          p_labels?: Json
          p_language_default?: string
          p_name: string
          p_phone_region?: string
          p_prices_include_vat?: boolean
          p_primary_color?: string
          p_subdomain: string
          p_vat_rate?: number
        }
        Returns: string
      }
      resolve_engagement_guardian: {
        Args: { p_engagement_id: string }
        Returns: {
          account_id: string
          guardian_email: string
          guardian_name: string
          guardian_person_id: string
          student_person_id: string
        }[]
      }
      save_tenant_invoicing_credentials: {
        Args: { p_account_id: string; p_api_key: string; p_secret: string }
        Returns: undefined
      }
      save_tenant_payment_credentials: {
        Args: {
          p_public_key: string
          p_secret_key: string
          p_webhook_secret: string
        }
        Returns: undefined
      }
      search_enrolment_students: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      sign_waiver: {
        Args: {
          p_accept_language: string
          p_account_member_id: string
          p_actor_id: string
          p_consent_template_id: string
          p_consent_version: number
          p_consent_version_hash: string
          p_guardian_confirmed?: boolean
          p_hmac_key_version: number
          p_id: string
          p_idempotency_key: string
          p_ip_address: unknown
          p_offering_id?: string
          p_otp_verify_sid: string
          p_pdf_sha256: string
          p_pdf_storage_path: string
          p_person_id: string
          p_record_hmac: string
          p_signature_method: string
          p_signed_at: string
          p_signed_by_email: string
          p_signed_by_name: string
          p_signed_by_role: string
          p_tenant_id: string
          p_user_agent: string
          p_viewed_at: string
          p_wording_snapshot: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
