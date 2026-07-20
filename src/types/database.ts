export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          auth_user_id: string | null
          name: string
          email: string | null
          title: string | null
          department: string | null
          supervisor_profile_id: string | null
          authority_level: number
          authority_notes: string | null
          status: 'active' | 'inactive' | 'pending'
          a43ac9: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          name: string
          email?: string | null
          title?: string | null
          department?: string | null
          supervisor_profile_id?: string | null
          authority_level?: number
          authority_notes?: string | null
          status?: 'active' | 'inactive' | 'pending'
          a43ac9?: boolean | null
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          name?: string
          email?: string | null
          title?: string | null
          department?: string | null
          supervisor_profile_id?: string | null
          authority_level?: number
          authority_notes?: string | null
          status?: 'active' | 'inactive' | 'pending'
          a43ac9?: boolean | null
        }
      }
      authority_rules: {
        Row: {
          id: string
          authority_level: number
          label: string
          conflict_behavior: string
          can_apply_updates: boolean
          requires_confirmation: boolean
          created_at: string
        }
        Insert: {
          authority_level: number
          label: string
          conflict_behavior: string
          can_apply_updates?: boolean
          requires_confirmation?: boolean
        }
        Update: {
          label?: string
          conflict_behavior?: string
          can_apply_updates?: boolean
          requires_confirmation?: boolean
        }
      }
      feature_flags: {
        Row: {
          key: string
          label: string
          description: string | null
          created_at: string
        }
        Insert: {
          key: string
          label: string
          description?: string | null
        }
        Update: {
          label?: string
          description?: string | null
        }
      }
      feature_level_access: {
        Row: {
          id: string
          feature_key: string
          authority_level: number
          enabled: boolean
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          feature_key: string
          authority_level: number
          enabled?: boolean
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          updated_by?: string | null
          updated_at?: string
        }
      }
      feature_team_restrictions: {
        Row: {
          id: string
          manager_profile_id: string
          feature_key: string
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          manager_profile_id: string
          feature_key: string
          updated_by?: string | null
        }
        Update: {
          updated_by?: string | null
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          slug: string
          name: string
          category: string | null
          description: string | null
          positioning: string | null
          status: string
          source_refs: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          category?: string | null
          description?: string | null
          positioning?: string | null
          status?: string
          source_refs?: Json
        }
        Update: {
          slug?: string
          name?: string
          category?: string | null
          description?: string | null
          positioning?: string | null
          status?: string
          source_refs?: Json
        }
      }
      product_facts: {
        Row: {
          id: string
          product_id: string
          fact_type: string
          content: string
          confidence: string
          source_document_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          product_id: string
          fact_type: string
          content: string
          confidence?: string
          source_document_id?: string | null
          created_by?: string | null
        }
        Update: {
          fact_type?: string
          content?: string
          confidence?: string
          source_document_id?: string | null
        }
      }
      pricing_config_versions: {
        Row: {
          id: string
          version_name: string
          effective_date: string
          created_by: string | null
          notes: string | null
          is_active: boolean
          source_refs: Json
          validation_status: 'pending' | 'valid' | 'warning' | 'invalid'
          created_at: string
        }
        Insert: {
          id?: string
          version_name: string
          effective_date?: string
          created_by?: string | null
          notes?: string | null
          is_active?: boolean
          source_refs?: Json
          validation_status?: 'pending' | 'valid' | 'warning' | 'invalid'
        }
        Update: {
          version_name?: string
          effective_date?: string
          notes?: string | null
          is_active?: boolean
          source_refs?: Json
          validation_status?: 'pending' | 'valid' | 'warning' | 'invalid'
        }
      }
      pricing_models: {
        Row: {
          id: string
          config_version_id: string
          product_id: string
          tier_name: string | null
          pricing_type: string
          unit: string
          default_price: number | null
          default_cost: number | null
          currency: string
          source_reference: string | null
          confidence: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          config_version_id: string
          product_id: string
          tier_name?: string | null
          pricing_type: string
          unit: string
          default_price?: number | null
          default_cost?: number | null
          currency?: string
          source_reference?: string | null
          confidence?: string
          is_active?: boolean
        }
        Update: {
          tier_name?: string | null
          pricing_type?: string
          unit?: string
          default_price?: number | null
          default_cost?: number | null
          currency?: string
          source_reference?: string | null
          confidence?: string
          is_active?: boolean
        }
      }
      pricing_brackets: {
        Row: {
          id: string
          config_version_id: string
          suite_tier: string
          suite_tier_label: string
          bracket_index: number
          seat_min: number
          seat_max: number | null
          price_per_seat: number
          currency: string
          source_reference: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          config_version_id: string
          suite_tier: string
          suite_tier_label: string
          bracket_index: number
          seat_min: number
          seat_max?: number | null
          price_per_seat: number
          currency?: string
          source_reference?: string | null
          is_active?: boolean
        }
        Update: {
          suite_tier?: string
          suite_tier_label?: string
          bracket_index?: number
          seat_min?: number
          seat_max?: number | null
          price_per_seat?: number
          currency?: string
          source_reference?: string | null
          is_active?: boolean
        }
      }
      cotutor_pricing_assumptions: {
        Row: {
          id: string
          config_version_id: string
          target_gross_margin: number
          active_user_adoption_rate: number
          fixed_infra_per_student_year: number
          student_messages_per_assignment: number
          validation_input_tokens_per_message: number
          validation_output_tokens_per_message: number
          chat_input_tokens_per_message: number
          chat_output_tokens_per_message: number
          chat_history_tokens_per_turn: number
          validation_pass_rate: number
          cache_hit_rate: number
          chatgpt_edu_benchmark_usd_per_user_year: number | null
          source_reference: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          config_version_id: string
          target_gross_margin: number
          active_user_adoption_rate: number
          fixed_infra_per_student_year: number
          student_messages_per_assignment: number
          validation_input_tokens_per_message: number
          validation_output_tokens_per_message: number
          chat_input_tokens_per_message: number
          chat_output_tokens_per_message: number
          chat_history_tokens_per_turn: number
          validation_pass_rate: number
          cache_hit_rate: number
          chatgpt_edu_benchmark_usd_per_user_year?: number | null
          source_reference?: string | null
        }
        Update: {
          target_gross_margin?: number
          active_user_adoption_rate?: number
          fixed_infra_per_student_year?: number
          student_messages_per_assignment?: number
          validation_input_tokens_per_message?: number
          validation_output_tokens_per_message?: number
          chat_input_tokens_per_message?: number
          chat_output_tokens_per_message?: number
          chat_history_tokens_per_turn?: number
          validation_pass_rate?: number
          cache_hit_rate?: number
          chatgpt_edu_benchmark_usd_per_user_year?: number | null
          source_reference?: string | null
        }
      }
      cotutor_ai_models: {
        Row: {
          id: string
          config_version_id: string
          model_id: string
          label: string
          provider: string
          input_rate_per_1m: number
          cached_input_rate_per_1m: number
          output_rate_per_1m: number
          is_default: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          config_version_id: string
          model_id: string
          label: string
          provider?: string
          input_rate_per_1m: number
          cached_input_rate_per_1m: number
          output_rate_per_1m: number
          is_default?: boolean
          sort_order?: number
        }
        Update: {
          model_id?: string
          label?: string
          provider?: string
          input_rate_per_1m?: number
          cached_input_rate_per_1m?: number
          output_rate_per_1m?: number
          is_default?: boolean
          sort_order?: number
        }
      }
      deals: {
        Row: {
          id: string
          customer_name: string
          owner_profile_id: string | null
          stage: string | null
          status: string
          metadata: Json
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          customer_name: string
          owner_profile_id?: string | null
          stage?: string | null
          status?: string
          metadata?: Json
          notes?: string | null
        }
        Update: {
          customer_name?: string
          owner_profile_id?: string | null
          stage?: string | null
          status?: string
          metadata?: Json
          notes?: string | null
        }
      }
      context_reviews: {
        Row: {
          id: string
          deal_id: string | null
          submitted_by: string | null
          authority_level: number
          content: string
          source_type: string
          file_name: string | null
          status: string
          reviewed_by: string | null
          created_at: string
          reviewed_at: string | null
        }
        Insert: {
          deal_id?: string | null
          submitted_by?: string | null
          authority_level?: number
          content: string
          source_type?: string
          file_name?: string | null
          status?: string
          reviewed_by?: string | null
        }
        Update: {
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
      }
      deal_inputs: {
        Row: {
          id: string
          deal_id: string
          student_count: number | null
          faculty_count: number | null
          course_sections: number | null
          exam_days: number | null
          seats_per_exam_day: number | null
          customer_status: 'new' | 'existing' | null
          discount_percent: number
          selected_products: Json
          assumptions: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          deal_id: string
          student_count?: number | null
          faculty_count?: number | null
          course_sections?: number | null
          exam_days?: number | null
          seats_per_exam_day?: number | null
          customer_status?: 'new' | 'existing' | null
          discount_percent?: number
          selected_products?: Json
          assumptions?: Json
        }
        Update: {
          student_count?: number | null
          faculty_count?: number | null
          course_sections?: number | null
          exam_days?: number | null
          seats_per_exam_day?: number | null
          customer_status?: 'new' | 'existing' | null
          discount_percent?: number
          selected_products?: Json
          assumptions?: Json
        }
      }
      quote_lines: {
        Row: {
          id: string
          deal_id: string
          product_id: string
          pricing_model_id: string | null
          quantity: number
          unit: string
          unit_price: number
          list_price: number
          discount_amount: number
          net_price: number
          unit_cost: number | null
          total_cost: number | null
          margin_percent: number | null
          config_version_id: string
          created_at: string
        }
        Insert: {
          deal_id: string
          product_id: string
          pricing_model_id?: string | null
          quantity: number
          unit: string
          unit_price: number
          list_price: number
          discount_amount?: number
          net_price: number
          unit_cost?: number | null
          total_cost?: number | null
          margin_percent?: number | null
          config_version_id: string
        }
        Update: {
          quantity?: number
          unit?: string
          unit_price?: number
          list_price?: number
          discount_amount?: number
          net_price?: number
          unit_cost?: number | null
          total_cost?: number | null
          margin_percent?: number | null
        }
      }
      quote_outputs: {
        Row: {
          id: string
          deal_id: string
          output_type: string
          classification: 'customer_facing' | 'internal_only' | 'mixed_draft'
          content: string
          source_trace: Json
          quality_signal: 'accepted' | 'rejected' | 'modified' | null
          config_version_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          deal_id: string
          output_type: string
          classification: 'customer_facing' | 'internal_only' | 'mixed_draft'
          content: string
          source_trace?: Json
          quality_signal?: 'accepted' | 'rejected' | 'modified' | null
          config_version_id?: string | null
          created_by?: string | null
        }
        Update: {
          output_type?: string
          classification?: 'customer_facing' | 'internal_only' | 'mixed_draft'
          content?: string
          source_trace?: Json
          quality_signal?: 'accepted' | 'rejected' | 'modified' | null
        }
      }
      competitors: {
        Row: {
          id: string
          name: string
          website: string | null
          category: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          website?: string | null
          category?: string | null
          notes?: string | null
        }
        Update: {
          name?: string
          website?: string | null
          category?: string | null
          notes?: string | null
        }
      }
      competitive_matrix: {
        Row: {
          id: string
          product_id: string
          competitor_id: string
          threat_tier: string | null
          escalation_status: string
          category: string | null
          competitor_strength: string | null
          apporto_edge: string | null
          sales_positioning_line: string | null
          threat_rationale: string | null
          key_overlap: string | null
          pricing_intel: string | null
          lms_coverage: string | null
          ferpa_positioning: string | null
          latest_notes: string | null
          evidence_source: string | null
          strategic_window: string | null
          confidence: string
          freshness_date: string | null
          source_document_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          product_id: string
          competitor_id: string
          threat_tier?: string | null
          escalation_status?: string
          category?: string | null
          competitor_strength?: string | null
          apporto_edge?: string | null
          sales_positioning_line?: string | null
          threat_rationale?: string | null
          key_overlap?: string | null
          pricing_intel?: string | null
          lms_coverage?: string | null
          ferpa_positioning?: string | null
          latest_notes?: string | null
          evidence_source?: string | null
          strategic_window?: string | null
          confidence?: string
          freshness_date?: string | null
          source_document_id?: string | null
        }
        Update: {
          threat_tier?: string | null
          escalation_status?: string
          category?: string | null
          competitor_strength?: string | null
          apporto_edge?: string | null
          sales_positioning_line?: string | null
          threat_rationale?: string | null
          key_overlap?: string | null
          pricing_intel?: string | null
          lms_coverage?: string | null
          ferpa_positioning?: string | null
          latest_notes?: string | null
          evidence_source?: string | null
          strategic_window?: string | null
          confidence?: string
          freshness_date?: string | null
        }
      }
      source_documents: {
        Row: {
          id: string
          title: string | null
          file_name: string | null
          file_type: string | null
          uploader_profile_id: string | null
          authority_level: number
          trust_weight: number
          status: string
          extracted_text: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          title?: string | null
          file_name?: string | null
          file_type?: string | null
          uploader_profile_id?: string | null
          authority_level?: number
          trust_weight?: number
          status?: string
          extracted_text?: string | null
          metadata?: Json
        }
        Update: {
          title?: string | null
          file_name?: string | null
          file_type?: string | null
          authority_level?: number
          trust_weight?: number
          status?: string
          extracted_text?: string | null
          metadata?: Json
        }
      }
      feedback_signals: {
        Row: {
          id: string
          deal_id: string | null
          product_id: string | null
          signal_type: string
          content: string
          customer_name: string | null
          source_document_id: string | null
          created_by: string | null
          authority_level: number
          created_at: string
        }
        Insert: {
          deal_id?: string | null
          product_id?: string | null
          signal_type: string
          content: string
          customer_name?: string | null
          source_document_id?: string | null
          created_by?: string | null
          authority_level?: number
        }
        Update: {
          signal_type?: string
          content?: string
          customer_name?: string | null
        }
      }
      portia_sessions: {
        Row: {
          id: string
          user_profile_id: string | null
          deal_id: string | null
          title: string | null
          mode: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          user_profile_id?: string | null
          deal_id?: string | null
          title?: string | null
          mode?: string | null
          metadata?: Json
        }
        Update: {
          title?: string | null
          mode?: string | null
          metadata?: Json
        }
      }
      portia_messages: {
        Row: {
          id: string
          session_id: string
          role: 'system' | 'user' | 'assistant' | 'tool'
          content: string
          source_trace: Json
          created_at: string
        }
        Insert: {
          session_id: string
          role: 'system' | 'user' | 'assistant' | 'tool'
          content: string
          source_trace?: Json
        }
        Update: {
          content?: string
          source_trace?: Json
        }
      }
      ai_events: {
        Row: {
          id: string
          event_type: 'generation' | 'ingestion' | 'conflict' | 'confirmation' | 'proposed_update' | 'applied_update' | 'quote_calculated'
          status: string
          actor_profile_id: string | null
          deal_id: string | null
          source_document_id: string | null
          proposed_update_id: string | null
          reference: Json
          created_at: string
        }
        Insert: {
          event_type: 'generation' | 'ingestion' | 'conflict' | 'confirmation' | 'proposed_update' | 'applied_update' | 'quote_calculated'
          status?: string
          actor_profile_id?: string | null
          deal_id?: string | null
          source_document_id?: string | null
          proposed_update_id?: string | null
          reference?: Json
        }
        Update: {
          status?: string
          reference?: Json
        }
      }
      proposed_updates: {
        Row: {
          id: string
          target_table: string
          target_id: string | null
          proposed_payload: Json
          conflict_summary: string | null
          authority_level: number
          status: 'pending' | 'approved' | 'rejected' | 'applied' | 'needs_confirmation'
          created_by: string | null
          reviewed_by: string | null
          applied_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          target_table: string
          target_id?: string | null
          proposed_payload: Json
          conflict_summary?: string | null
          authority_level?: number
          status?: 'pending' | 'approved' | 'rejected' | 'applied' | 'needs_confirmation'
          created_by?: string | null
          reviewed_by?: string | null
        }
        Update: {
          status?: 'pending' | 'approved' | 'rejected' | 'applied' | 'needs_confirmation'
          reviewed_by?: string | null
          applied_at?: string | null
        }
      }
      market_benchmarks: {
        Row: {
          id: string
          category: string
          vendor: string | null
          metric: string | null
          price_low: number | null
          price_high: number | null
          unit: string | null
          notes: string | null
          source_document_id: string | null
          confidence: string
          created_at: string
        }
        Insert: {
          category: string
          vendor?: string | null
          metric?: string | null
          price_low?: number | null
          price_high?: number | null
          unit?: string | null
          notes?: string | null
          source_document_id?: string | null
          confidence?: string
        }
        Update: {
          category?: string
          vendor?: string | null
          metric?: string | null
          price_low?: number | null
          price_high?: number | null
          unit?: string | null
          notes?: string | null
          confidence?: string
        }
      }
      knowledge_chunks: {
        Row: {
          id: string
          source_document_id: string
          content: string
          embedding: number[] | null
          product_id: string | null
          competitor_id: string | null
          chunk_type: string | null
          confidence: string
          created_at: string
        }
        Insert: {
          source_document_id: string
          content: string
          embedding?: number[] | null
          product_id?: string | null
          competitor_id?: string | null
          chunk_type?: string | null
          confidence?: string
        }
        Update: {
          content?: string
          embedding?: number[] | null
          chunk_type?: string | null
          confidence?: string
        }
      }
      quote_snapshots: {
        Row: {
          id: string
          deal_id: string
          name: string
          inputs_snapshot: Json
          result_snapshot: Json
          config_version_id: string
          final_total: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          deal_id: string
          name: string
          inputs_snapshot: Json
          result_snapshot: Json
          config_version_id: string
          final_total: number
          created_by?: string | null
        }
        Update: {
          name?: string
        }
      }
      integration_settings: {
        Row: {
          id: string
          provider: string
          api_key: string | null
          metadata: Json
          is_active: boolean
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          provider: string
          api_key?: string | null
          metadata?: Json
          is_active?: boolean
          updated_by?: string | null
        }
        Update: {
          api_key?: string | null
          metadata?: Json
          is_active?: boolean
          updated_by?: string | null
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
