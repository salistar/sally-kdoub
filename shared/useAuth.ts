import { useEffect, useState, useCallback } from 'react';
import * as api from './api';

export interface AuthState {
  isLoading: boolean;
  isSignout: boolean;
  userToken: string | null;
  user: api.User | null;
}

export interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth() {
  const [state, dispatch] = useState<AuthState>({
    isLoading: true,
    isSignout: false,
    userToken: null,
    user: null,
  });

  // Restore token on mount
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        // Check if we have a token stored
        const token = api.getAuthToken();
        if (token) {
          try {
            const user = await api.getMe();
            dispatch({
              isLoading: false,
              isSignout: false,
              userToken: token,
              user,
            });
          } catch (e) {
            // Token is invalid, try to refresh
            try {
              await api.refreshTokenAsync();
              const user = await api.getMe();
              dispatch({
                isLoading: false,
                isSignout: false,
                userToken: api.getAuthToken(),
                user,
              });
            } catch (error) {
              console.error('Failed to restore session:', error);
              dispatch({
                isLoading: false,
                isSignout: true,
                userToken: null,
                user: null,
              });
            }
          }
        } else {
          dispatch({
            isLoading: false,
            isSignout: true,
            userToken: null,
            user: null,
          });
        }
      } catch (e) {
        console.error('Bootstrap error:', e);
        dispatch({
          isLoading: false,
          isSignout: true,
          userToken: null,
          user: null,
        });
      }
    };

    bootstrapAsync();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    dispatch({ isLoading: true, isSignout: false, userToken: null, user: null });
    try {
      const result = await api.login(email, password);
      const user = await api.getMe();
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: result.token,
        user,
      });
    } catch (error) {
      console.error('Sign in error:', error);
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: null,
        user: null,
      });
      throw error;
    }
  }, []);

  const signUp = useCallback(
    async (email: string, username: string, password: string) => {
      dispatch({ isLoading: true, isSignout: false, userToken: null, user: null });
      try {
        const result = await api.register(email, username, password);
        const user = await api.getMe();
        dispatch({
          isLoading: false,
          isSignout: false,
          userToken: result.token,
          user,
        });
      } catch (error) {
        console.error('Sign up error:', error);
        dispatch({
          isLoading: false,
          isSignout: false,
          userToken: null,
          user: null,
        });
        throw error;
      }
    },
    []
  );

  const signInAsGuest = useCallback(async () => {
    dispatch({ isLoading: true, isSignout: false, userToken: null, user: null });
    try {
      const result = await api.createGuestSession();
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: result.token,
        user: null,
      });
    } catch (error) {
      console.error('Guest sign in error:', error);
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: null,
        user: null,
      });
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    dispatch({ isLoading: true, isSignout: false, userToken: null, user: null });
    try {
      await api.logout();
      dispatch({
        isLoading: false,
        isSignout: true,
        userToken: null,
        user: null,
      });
    } catch (error) {
      console.error('Sign out error:', error);
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: null,
        user: null,
      });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await api.getMe();
      dispatch((prevState) => ({
        ...prevState,
        user,
      }));
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, []);

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    signInAsGuest,
    refreshUser,
  };
}
