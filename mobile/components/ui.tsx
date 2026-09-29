// Small set of shared UI primitives built on React Native core components.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  View as RNView,
} from 'react-native';

import { Text, useTheme } from './Themed';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
};

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  style,
  icon,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const c = useTheme();
  const isDisabled = disabled || loading;
  const bg = variant === 'primary' ? c.tint : variant === 'secondary' ? c.surface : 'transparent';
  const fg = variant === 'primary' ? c.onTint : c.tint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: variant === 'secondary' ? c.border : 'transparent',
          opacity: isDisabled ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <RNView style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </RNView>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <RNView style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>
      {children}
    </RNView>
  );
}

export function Field(props: TextInputProps) {
  const c = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[
        styles.input,
        { color: c.text, backgroundColor: c.inputBackground, borderColor: c.border },
        props.multiline && { minHeight: 88, textAlignVertical: 'top' },
        props.style,
      ]}
    />
  );
}

export function Chip({
  label,
  selected,
  onPress,
  onRemove,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const c = useTheme();
  return (
    <RNView
      style={[
        styles.chip,
        {
          backgroundColor: selected ? c.tint : c.surface,
          borderColor: selected ? c.tint : c.border,
        },
      ]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : 'text'}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={onPress ? { selected: !!selected } : undefined}
        hitSlop={6}>
        <Text style={[styles.chipText, { color: selected ? c.onTint : c.text }]}>{label}</Text>
      </Pressable>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          hitSlop={10}
          style={styles.chipRemove}>
          <Text style={{ color: selected ? c.onTint : c.muted, fontSize: 16 }}>×</Text>
        </Pressable>
      ) : null}
    </RNView>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const c = useTheme();
  return (
    <RNView style={styles.state} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <ActivityIndicator color={c.tint} />
      <Text muted style={{ marginTop: 8 }}>
        {label}
      </Text>
    </RNView>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useTheme();
  return (
    <RNView
      style={[styles.state, styles.banner, { backgroundColor: c.dangerBg }]}
      accessibilityRole="alert">
      <Text style={{ color: c.dangerFg, textAlign: 'center' }}>{message}</Text>
      {onRetry ? (
        <Button title="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: 12 }} />
      ) : null}
    </RNView>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <RNView style={styles.state}>
      <Text style={{ fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      {body ? (
        <Text muted style={{ textAlign: 'center', marginTop: 6 }}>
          {body}
        </Text>
      ) : null}
    </RNView>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warn' | 'danger';
  children: ReactNode;
}) {
  const c = useTheme();
  const map = {
    info: [c.infoBg, c.infoFg],
    success: [c.successBg, c.successFg],
    warn: [c.warnBg, c.warnFg],
    danger: [c.dangerBg, c.dangerFg],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <RNView
      style={[styles.banner, { backgroundColor: bg }]}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Text style={{ color: fg, fontSize: 15 }}>{children}</Text>
    </RNView>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  chipText: { fontSize: 15 },
  chipRemove: { paddingLeft: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  state: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  banner: { borderRadius: 12, padding: 14 },
});
