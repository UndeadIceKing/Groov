import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { syncProfile, deleteAllUserData } from '../services/sync';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // getUser() round-trips to Supabase servers to cryptographically verify the JWT,
    // preventing a tampered locally-stored token from being silently trusted on startup.
    supabase.auth.getUser().then(async ({ data: { user }, error }) => {
      if (user && !error) {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
      } else {
        setSession(null);
      }
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

  const deleteAccount = async () => {
    const userId = session?.user?.id;
    if (!userId) throw new Error('Not signed in');
    // Delete all user data from database tables first
    await deleteAllUserData(userId);
    // Call Edge Function to delete the auth user (requires service role)
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        },
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete account');
    await supabase.auth.signOut();
  };

  const sendPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  };

  const verifyPasswordReset = async (email, token, newPassword) => {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    });
    if (verifyError) throw verifyError;
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) throw updateError;
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
      deleteAccount,
      sendPasswordReset,
      verifyPasswordReset,
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
