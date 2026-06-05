import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { syncProfile } from '../services/sync';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email, password, displayName = '') => {
    const trimmedName = displayName.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: trimmedName } },
    });
    if (error) throw error;
    // Also persist to profiles table so edge functions can access it
    if (data.user && trimmedName) {
      syncProfile(data.user.id, trimmedName).catch(() => {});
    }
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const updateDisplayName = async (newName) => {
    const trimmed = newName.trim();
    const { error } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
    if (error) throw error;
    if (session?.user?.id) {
      syncProfile(session.user.id, trimmed).catch(() => {});
    }
  };

  const displayName = session?.user?.user_metadata?.display_name ?? '';

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      user: session?.user ?? null,
      displayName,
      signIn,
      signUp,
      signOut,
      updateDisplayName,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
