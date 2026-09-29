import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

type IconName = SymbolViewProps['name'];

function icon(name: IconName) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={26} />;
  }
  return TabIcon;
}

export default function TabLayout() {
  const c = Colors[useColorScheme()];
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.tabIconDefault,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: 'ClassActionForMe',
          tabBarAccessibilityLabel: 'Home: search lawsuits',
          tabBarIcon: icon({ ios: 'magnifyingglass', android: 'search', web: 'search' }),
        }}
      />
      <Tabs.Screen
        name="items"
        options={{
          title: 'My Items',
          tabBarAccessibilityLabel: 'My Items: things you own, matched to lawsuits',
          tabBarIcon: icon({ ios: 'list.bullet.rectangle', android: 'list', web: 'list' }),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarAccessibilityLabel: 'Scan: photograph products to find lawsuits',
          tabBarIcon: icon({ ios: 'camera.viewfinder', android: 'photo_camera', web: 'photo_camera' }),
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: 'Watchlist',
          tabBarAccessibilityLabel: 'Watchlist: brands you follow',
          tabBarIcon: icon({ ios: 'bell', android: 'notifications', web: 'notifications' }),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings and privacy',
          tabBarIcon: icon({ ios: 'gearshape', android: 'settings', web: 'settings' }),
        }}
      />
    </Tabs>
  );
}
