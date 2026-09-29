import { Text as DefaultText, View as DefaultView } from 'react-native';

import Colors, { type Palette } from '@/constants/Colors';
import { useColorScheme } from './useColorScheme';

export function useTheme(): Palette {
  return Colors[useColorScheme()];
}

export type TextProps = DefaultText['props'] & { muted?: boolean };
export type ViewProps = DefaultView['props'] & { surface?: boolean };

export function Text({ style, muted, ...rest }: TextProps) {
  const c = useTheme();
  return <DefaultText style={[{ color: muted ? c.muted : c.text, fontSize: 16 }, style]} {...rest} />;
}

export function View({ style, surface, ...rest }: ViewProps) {
  const c = useTheme();
  return (
    <DefaultView style={[{ backgroundColor: surface ? c.surface : c.background }, style]} {...rest} />
  );
}
