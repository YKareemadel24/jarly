import { useMemo } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { makeStyles } from "@/components/jar-detail.styles";
import { JarVessel } from "@/components/jar-vessel";
import { useColors } from "@/hooks/use-colors";

type Props = {
  visible: boolean;
  level: number | null;
  progress: number;
  accent: string;
  icon: string;
  jarName: string;
  onDismiss: () => void;
};

export function CelebrationModal({
  visible,
  level,
  progress,
  accent,
  icon,
  jarName,
  onDismiss,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.celebrationBackdrop}>
        <View style={styles.celebration}>
          <Text style={styles.celebrationNumber}>{level}%</Text>
          <JarVessel
            accent={accent}
            icon={icon}
            progress={progress}
            size="medium"
          />
          <Text style={styles.celebrationTitle}>
            {level === 100
              ? "You made it."
              : level === 50
                ? "Halfway there."
                : "A beautiful milestone."}
          </Text>
          <Text style={styles.celebrationCopy}>
            {jarName} is now {level}% funded. Small, steady progress is real
            progress.
          </Text>
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.celebrationButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.sheetButtonText}>Keep saving</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
