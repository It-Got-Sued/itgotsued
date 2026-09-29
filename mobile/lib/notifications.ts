// Scaffold for push alerts (new lawsuit / claim form opened for a followed brand).
// Not wired into the UI yet: the API has no endpoint for registering push tokens.
// Next step: POST the Expo push token with the followed brands to a future
// /api/watchlist/push endpoint, and call registerForPushAsync() after a follow.
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Asks for permission and returns the Expo push token, or null if unavailable/denied. */
export async function registerForPushAsync(): Promise<string | null> {
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return null;
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
  if (!projectId) return null; // run `eas init` to create a project ID first
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}
