
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "account_daily_metrics": {
                  Row: {
                    "account_id": string,"api_version": string | null,"client_id": string,"collected_at": string,"day": string,"extra": Json | null,"followers": number | null,"followers_gained": number | null,"followers_lost": number | null,"impressions": number | null,"organization_id": string,"profile_visits": number | null,"reach": number | null,"source": Database["public"]['Enums']["data_source_t"],"views": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"api_version"?: string | null,"client_id": string,"collected_at"?: string,"day": string,"extra"?: Json | null,"followers"?: number | null,"followers_gained"?: number | null,"followers_lost"?: number | null,"impressions"?: number | null,"organization_id": string,"profile_visits"?: number | null,"reach"?: number | null,"source"?: Database["public"]['Enums']["data_source_t"],"views"?: number | null
                  }
                  Update: {
                    "account_id"?: string,"api_version"?: string | null,"client_id"?: string,"collected_at"?: string,"day"?: string,"extra"?: Json | null,"followers"?: number | null,"followers_gained"?: number | null,"followers_lost"?: number | null,"impressions"?: number | null,"organization_id"?: string,"profile_visits"?: number | null,"reach"?: number | null,"source"?: Database["public"]['Enums']["data_source_t"],"views"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_daily_metrics_account_id_client_id_organization_id_fkey"
      columns: ["account_id","client_id","organization_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id","client_id","organization_id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"client_id": string | null,"created_at": string,"entity": string,"entity_id": string | null,"id": number,"organization_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"client_id"?: string | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: never,"organization_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"client_id"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: never,"organization_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"client_assignments": {
                  Row: {
                    "client_id": string,"created_at": string,"organization_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"organization_id": string,"user_id": string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"organization_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_assignments_client_id_organization_id_fkey"
      columns: ["client_id","organization_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "client_assignments_organization_id_user_id_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    }
                  ]
                },"client_users": {
                  Row: {
                    "client_id": string,"created_at": string,"organization_id": string,"role": Database["public"]['Enums']["client_role_t"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"organization_id": string,"role"?: Database["public"]['Enums']["client_role_t"],"user_id": string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["client_role_t"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_users_client_id_organization_id_fkey"
      columns: ["client_id","organization_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "created_at": string,"id": string,"is_demo": boolean,"name": string,"notes": string | null,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"name": string,"notes"?: string | null,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"name"?: string,"notes"?: string | null,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"metric_catalog": {
                  Row: {
                    "api_metric_name": string | null,"available": boolean,"metric": string,"note": string | null,"platform": Database["public"]['Enums']["platform_t"],"scope": Database["public"]['Enums']["metric_scope_t"],"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "api_metric_name"?: string | null,"available": boolean,"metric": string,"note"?: string | null,"platform": Database["public"]['Enums']["platform_t"],"scope": Database["public"]['Enums']["metric_scope_t"],"verified_at"?: string | null
                  }
                  Update: {
                    "api_metric_name"?: string | null,"available"?: boolean,"metric"?: string,"note"?: string | null,"platform"?: Database["public"]['Enums']["platform_t"],"scope"?: Database["public"]['Enums']["metric_scope_t"],"verified_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"oauth_states": {
                  Row: {
                    "client_id": string,"code_verifier": string | null,"created_at": string,"expires_at": string,"organization_id": string,"platform": Database["public"]['Enums']["platform_t"],"state": string,"used_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"code_verifier"?: string | null,"created_at"?: string,"expires_at": string,"organization_id": string,"platform": Database["public"]['Enums']["platform_t"],"state": string,"used_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "client_id"?: string,"code_verifier"?: string | null,"created_at"?: string,"expires_at"?: string,"organization_id"?: string,"platform"?: Database["public"]['Enums']["platform_t"],"state"?: string,"used_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "oauth_states_client_id_organization_id_fkey"
      columns: ["client_id","organization_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": Database["public"]['Enums']["org_role_t"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role": Database["public"]['Enums']["org_role_t"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_role_t"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"post_metric_snapshots": {
                  Row: {
                    "api_version": string | null,"avg_watch_time_seconds": number | null,"client_id": string,"collected_at": string,"comments": number | null,"extra": Json | null,"follows": number | null,"id": number,"impressions": number | null,"likes": number | null,"link_clicks": number | null,"organization_id": string,"post_id": string,"profile_visits": number | null,"reach": number | null,"saves": number | null,"shares": number | null,"source": Database["public"]['Enums']["data_source_t"],"views": number | null,"watch_time_seconds": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "api_version"?: string | null,"avg_watch_time_seconds"?: number | null,"client_id": string,"collected_at": string,"comments"?: number | null,"extra"?: Json | null,"follows"?: number | null,"id"?: never,"impressions"?: number | null,"likes"?: number | null,"link_clicks"?: number | null,"organization_id": string,"post_id": string,"profile_visits"?: number | null,"reach"?: number | null,"saves"?: number | null,"shares"?: number | null,"source"?: Database["public"]['Enums']["data_source_t"],"views"?: number | null,"watch_time_seconds"?: number | null
                  }
                  Update: {
                    "api_version"?: string | null,"avg_watch_time_seconds"?: number | null,"client_id"?: string,"collected_at"?: string,"comments"?: number | null,"extra"?: Json | null,"follows"?: number | null,"id"?: never,"impressions"?: number | null,"likes"?: number | null,"link_clicks"?: number | null,"organization_id"?: string,"post_id"?: string,"profile_visits"?: number | null,"reach"?: number | null,"saves"?: number | null,"shares"?: number | null,"source"?: Database["public"]['Enums']["data_source_t"],"views"?: number | null,"watch_time_seconds"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_metric_snapshots_post_id_client_id_organization_id_fkey"
      columns: ["post_id","client_id","organization_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id","client_id","organization_id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "account_id": string,"caption": string | null,"client_id": string,"created_at": string,"external_post_id": string,"format": Database["public"]['Enums']["post_format_t"],"id": string,"organization_id": string,"permalink": string | null,"platform": Database["public"]['Enums']["platform_t"],"published_at": string,"thumbnail_url": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"caption"?: string | null,"client_id": string,"created_at"?: string,"external_post_id": string,"format"?: Database["public"]['Enums']["post_format_t"],"id"?: string,"organization_id": string,"permalink"?: string | null,"platform": Database["public"]['Enums']["platform_t"],"published_at": string,"thumbnail_url"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"caption"?: string | null,"client_id"?: string,"created_at"?: string,"external_post_id"?: string,"format"?: Database["public"]['Enums']["post_format_t"],"id"?: string,"organization_id"?: string,"permalink"?: string | null,"platform"?: Database["public"]['Enums']["platform_t"],"published_at"?: string,"thumbnail_url"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_account_id_client_id_organization_id_fkey"
      columns: ["account_id","client_id","organization_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id","client_id","organization_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"raw_payloads": {
                  Row: {
                    "body": NonNullable<Json>,"endpoint": string,"fetched_at": string,"id": number,"sync_run_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": NonNullable<Json>,"endpoint": string,"fetched_at"?: string,"id"?: never,"sync_run_id": string
                  }
                  Update: {
                    "body"?: NonNullable<Json>,"endpoint"?: string,"fetched_at"?: string,"id"?: never,"sync_run_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "raw_payloads_sync_run_id_fkey"
      columns: ["sync_run_id"]
isOneToOne: false
      referencedRelation: "sync_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"social_accounts": {
                  Row: {
                    "client_id": string,"connected_by": string | null,"created_at": string,"display_name": string | null,"external_account_id": string,"handle": string | null,"id": string,"last_error": string | null,"last_synced_at": string | null,"next_sync_at": string | null,"organization_id": string,"platform": Database["public"]['Enums']["platform_t"],"revoked_at": string | null,"scopes": (string)[] | null,"status": Database["public"]['Enums']["connection_status_t"],"sync_enabled": boolean,"sync_frequency_minutes": number,"token_expires_at": string | null,"token_secret_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"connected_by"?: string | null,"created_at"?: string,"display_name"?: string | null,"external_account_id": string,"handle"?: string | null,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"next_sync_at"?: string | null,"organization_id": string,"platform": Database["public"]['Enums']["platform_t"],"revoked_at"?: string | null,"scopes"?: (string)[] | null,"status"?: Database["public"]['Enums']["connection_status_t"],"sync_enabled"?: boolean,"sync_frequency_minutes"?: number,"token_expires_at"?: string | null,"token_secret_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"connected_by"?: string | null,"created_at"?: string,"display_name"?: string | null,"external_account_id"?: string,"handle"?: string | null,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"next_sync_at"?: string | null,"organization_id"?: string,"platform"?: Database["public"]['Enums']["platform_t"],"revoked_at"?: string | null,"scopes"?: (string)[] | null,"status"?: Database["public"]['Enums']["connection_status_t"],"sync_enabled"?: boolean,"sync_frequency_minutes"?: number,"token_expires_at"?: string | null,"token_secret_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "social_accounts_client_id_organization_id_fkey"
      columns: ["client_id","organization_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"sync_errors": {
                  Row: {
                    "account_id": string,"client_id": string,"code": string,"created_at": string,"http_status": number | null,"id": number,"message": string,"organization_id": string,"retryable": boolean,"sync_run_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"client_id": string,"code": string,"created_at"?: string,"http_status"?: number | null,"id"?: never,"message": string,"organization_id": string,"retryable"?: boolean,"sync_run_id": string
                  }
                  Update: {
                    "account_id"?: string,"client_id"?: string,"code"?: string,"created_at"?: string,"http_status"?: number | null,"id"?: never,"message"?: string,"organization_id"?: string,"retryable"?: boolean,"sync_run_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_errors_account_id_client_id_organization_id_fkey"
      columns: ["account_id","client_id","organization_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id","client_id","organization_id"]
    },{
      foreignKeyName: "sync_errors_sync_run_id_fkey"
      columns: ["sync_run_id"]
isOneToOne: false
      referencedRelation: "sync_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_runs": {
                  Row: {
                    "account_id": string,"api_calls": number,"attempt": number,"client_id": string,"finished_at": string | null,"id": string,"next_retry_at": string | null,"organization_id": string,"posts_upserted": number,"queued_at": string,"requested_by": string | null,"snapshots_written": number,"started_at": string | null,"status": Database["public"]['Enums']["sync_status_t"],"trigger": Database["public"]['Enums']["sync_trigger_t"]
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"api_calls"?: number,"attempt"?: number,"client_id": string,"finished_at"?: string | null,"id"?: string,"next_retry_at"?: string | null,"organization_id": string,"posts_upserted"?: number,"queued_at"?: string,"requested_by"?: string | null,"snapshots_written"?: number,"started_at"?: string | null,"status"?: Database["public"]['Enums']["sync_status_t"],"trigger": Database["public"]['Enums']["sync_trigger_t"]
                  }
                  Update: {
                    "account_id"?: string,"api_calls"?: number,"attempt"?: number,"client_id"?: string,"finished_at"?: string | null,"id"?: string,"next_retry_at"?: string | null,"organization_id"?: string,"posts_upserted"?: number,"queued_at"?: string,"requested_by"?: string | null,"snapshots_written"?: number,"started_at"?: string | null,"status"?: Database["public"]['Enums']["sync_status_t"],"trigger"?: Database["public"]['Enums']["sync_trigger_t"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_runs_account_id_client_id_organization_id_fkey"
      columns: ["account_id","client_id","organization_id"]
isOneToOne: false
      referencedRelation: "social_accounts"
      referencedColumns: ["id","client_id","organization_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "bootstrap_organization":
{ Args: { "p_admin": string,"p_name": string }; Returns: string
                           },
"client_posts":
{ Args: { "p_client": string,"p_from": string,"p_to": string }; Returns: {
              "account_id": string,"avg_watch_time_seconds": number,"caption": string,"collected_at": string,"comments": number,"follows": number,"format": Database["public"]['Enums']["post_format_t"],"id": string,"impressions": number,"likes": number,"link_clicks": number,"permalink": string,"platform": Database["public"]['Enums']["platform_t"],"profile_visits": number,"published_at": string,"reach": number,"saves": number,"shares": number,"source": Database["public"]['Enums']["data_source_t"],"thumbnail_url": string,"views": number,"watch_time_seconds": number
            }[]
                           },
"read_account_token":
{ Args: { "p_account_id": string }; Returns: Json
                           },
"revoke_account_connection":
{ Args: { "p_account_id": string }; Returns: undefined
                           },
"store_account_token":
{ Args: { "p_account_id": string,"p_token": Json }; Returns: string
                           }
          }
          Enums: {
            "client_role_t": "client_viewer","connection_status_t": "connected"|"expired"|"revoked"|"error","data_source_t": "api"|"manual"|"import"|"calc","metric_scope_t": "account"|"post","org_role_t": "org_admin"|"org_analyst","platform_t": "instagram"|"facebook"|"youtube"|"tiktok"|"x"|"linkedin","post_format_t": "reels"|"story"|"carousel"|"photo"|"video"|"short"|"long_video"|"live"|"text"|"other","sync_status_t": "queued"|"running"|"success"|"partial"|"error","sync_trigger_t": "cron"|"manual"|"retry"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "client_role_t": ["client_viewer"],"connection_status_t": ["connected", "expired", "revoked", "error"],"data_source_t": ["api", "manual", "import", "calc"],"metric_scope_t": ["account", "post"],"org_role_t": ["org_admin", "org_analyst"],"platform_t": ["instagram", "facebook", "youtube", "tiktok", "x", "linkedin"],"post_format_t": ["reels", "story", "carousel", "photo", "video", "short", "long_video", "live", "text", "other"],"sync_status_t": ["queued", "running", "success", "partial", "error"],"sync_trigger_t": ["cron", "manual", "retry"]
          }
        }
} as const
