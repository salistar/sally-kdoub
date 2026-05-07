/**
 * @file game/vs-bot.tsx
 * @description Route for vs Bot mode in Kdoub. Redirects to the local game screen with bot mode parameters.
 * @author Idriss Kriouile
 * @date 2026-04-05
 * @project SallyCards - Kdoub
 */

import { useEffect } from 'react';
import { Redirect } from 'expo-router';

export default function VsBotRedirect() {
  // Log when the vs-bot redirect route mounts
  useEffect(() => {
    console.log('[Kdoub/VsBotRedirect] Component mounted');
    console.log('[Kdoub/VsBotRedirect] Navigating to /game/local?mode=bot&botCount=1');
  }, []);

  // Immediately redirect to the local game screen with bot configuration
  return <Redirect href="/game/local?mode=bot&botCount=1" />;
}

/* === End of game/vs-bot.tsx — Kdoub — SallyCards === */
