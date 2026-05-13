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
  public: {
    Tables: {
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
      classes: {
        Row: {
          billing_frequency: string
          created_at: string
          currency: string
          day_of_week: number | null
          end_time: string
          id: string
          is_public: boolean
          level_id: string | null
          max_capacity: number
          name: string
          price_minor: number
          start_time: string
          status: string
          tenant_id: string
          term_id: string
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          billing_frequency?: string
          created_at?: string
          currency?: string
          day_of_week?: number | null
          end_time: string
          id?: string
          is_public?: boolean
          level_id?: string | null
          max_capacity?: number
          name: string
          price_minor?: number
          start_time: string
          status?: string
          tenant_id: string
          term_id: string
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          billing_frequency?: string
          created_at?: string
          currency?: string
          day_of_week?: number | null
          end_time?: string
          id?: string
          is_public?: boolean
          level_id?: string | null
          max_capacity?: number
          name?: string
          price_minor?: number
          start_time?: string
          status?: string
          tenant_id?: string
          term_id?: string
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_preferences: {
        Row: {
          created_at: string
          email: string | null
          email_opted_in: boolean
          family_member_id: string | null
          id: string
          language: string
          notify_class_cancellation: boolean
          notify_payment_due: boolean
          notify_schedule_change: boolean
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
          created_at?: string
          email?: string | null
          email_opted_in?: boolean
          family_member_id?: string | null
          id?: string
          language?: string
          notify_class_cancellation?: boolean
          notify_payment_due?: boolean
          notify_schedule_change?: boolean
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
          created_at?: string
          email?: string | null
          email_opted_in?: boolean
          family_member_id?: string | null
          id?: string
          language?: string
          notify_class_cancellation?: boolean
          notify_payment_due?: boolean
          notify_schedule_change?: boolean
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
            foreignKeyName: "contact_preferences_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
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
      families: {
        Row: {
          created_at: string
          id: string
          primary_contact_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          primary_contact_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          primary_contact_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "families_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string
          email: string | null
          family_id: string
          id: string
          name: string
          phone: string | null
          role: string
          tenant_id: string
          user_profile_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          family_id: string
          id?: string
          name: string
          phone?: string | null
          role?: string
          tenant_id: string
          user_profile_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          family_id?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string
          tenant_id?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
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
            foreignKeyName: "levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
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
          recipient_email: string | null
          recipient_family_member_id: string | null
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
          recipient_email?: string | null
          recipient_family_member_id?: string | null
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
          recipient_email?: string | null
          recipient_family_member_id?: string | null
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
            foreignKeyName: "notification_log_recipient_family_member_id_fkey"
            columns: ["recipient_family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
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
      people: {
        Row: {
          allergies: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          family_id: string | null
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
          allergies?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          family_id?: string | null
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
          allergies?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          family_id?: string | null
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
            foreignKeyName: "people_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
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
          country: string
          created_at: string
          currency: string
          id: string
          language: string
          name: string
          primary_color: string
          subdomain: string
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          accent_color?: string
          country?: string
          created_at?: string
          currency?: string
          id?: string
          language?: string
          name: string
          primary_color?: string
          subdomain: string
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          accent_color?: string
          country?: string
          created_at?: string
          currency?: string
          id?: string
          language?: string
          name?: string
          primary_color?: string
          subdomain?: string
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: []
      }
      terms: {
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
            foreignKeyName: "terms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_otps: { Args: never; Returns: undefined }
      get_my_family_ids: { Args: never; Returns: string[] }
      get_my_person_id: { Args: never; Returns: string }
      get_my_tenant_id: { Args: never; Returns: string }
      is_minor: { Args: { date_of_birth: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
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
  public: {
    Enums: {},
  },
} as const
