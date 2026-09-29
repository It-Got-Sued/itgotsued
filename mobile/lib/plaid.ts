// Lazy loader for react-native-plaid-link-sdk. The SDK ships native code, so it is
// missing in Expo Go; loading it lazily keeps the rest of the app working there.
import Constants, { ExecutionEnvironment } from 'expo-constants';

type PlaidSdk = typeof import('react-native-plaid-link-sdk');

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export function loadPlaid(): PlaidSdk | null {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-plaid-link-sdk') as PlaidSdk;
  } catch {
    return null;
  }
}
