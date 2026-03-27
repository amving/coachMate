import { PropsWithChildren } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle
} from "react-native";

export function ScreenCard({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  tone = "primary"
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "secondary" && styles.buttonSecondary,
        tone === "danger" && styles.buttonDanger,
        pressed && styles.buttonPressed
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

export function Pill({
  label,
  active,
  onPress
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        pressed && onPress ? styles.buttonPressed : null
      ]}
    >
      <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor="#6b7280" {...props} style={[styles.field, props.style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3
  },
  sectionHeader: {
    gap: 4
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a"
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#475569"
  },
  button: {
    borderRadius: 18,
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center"
  },
  buttonSecondary: {
    backgroundColor: "#e0f2fe"
  },
  buttonDanger: {
    backgroundColor: "#ef4444"
  },
  buttonPressed: {
    opacity: 0.82
  },
  buttonLabel: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  pill: {
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center"
  },
  pillActive: {
    backgroundColor: "#0ea5e9"
  },
  pillLabel: {
    color: "#0f172a",
    fontWeight: "700"
  },
  pillLabelActive: {
    color: "#ffffff"
  },
  field: {
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#0f172a"
  }
});
