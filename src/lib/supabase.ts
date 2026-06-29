import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Using untyped client — query results are typed explicitly at each call site
// using the types from src/types/database.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
