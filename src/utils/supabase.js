import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(
  'https://fdplqvebauivtlywornw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkcGxxdmViYXVpdnRseXdvcm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NDQwNDcsImV4cCI6MjA5NjEyMDA0N30.3cFPMtH3zyb_QAFOnZHU22e74_2P0nAbNN68GtZfsEY',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
