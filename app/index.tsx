/**
 * @file index.tsx
 * @description Entry point / root index for Kdoub. Checks authentication status and redirects to either the main tabs or the welcome screen.
 * @author Idriss Kriouile
 * @date 2026-04-05
 * @project SallyCards - Kdoub
 */

import { Redirect } from 'expo-router';
import * as api from '../shared/api';

export default function Index() {
  console.log('[Kdoub/index] Component mounted');

  // Check if a valid auth token exists to determine the initial route
  const token = api.getAuthToken();
  console.log('[Kdoub/index] State update: token =', token ? 'present' : 'absent');

  // If authenticated, redirect to the main tabs; otherwise, redirect to the welcome/onboarding screen
  if (token) {
    console.log('[Kdoub/index] Navigating to /(tabs)');
    return <Redirect href="/(tabs)" />;
  }
  console.log('[Kdoub/index] Navigating to /auth/welcome');
  return <Redirect href="/auth/welcome" />;
}

/* === End of index.tsx — Kdoub — SallyCards === */
