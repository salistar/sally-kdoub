import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { CardValue, VALUES, VALUE_NAMES } from '../game/kdoubEngine';

interface ValueSelectorProps {
  visible: boolean;
  onSelect: (value: CardValue) => void;
  onCancel: () => void;
  title?: string;
}

export default function ValueSelector({
  visible,
  onSelect,
  onCancel,
  title = 'Déclarer une valeur',
}: ValueSelectorProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            Quelle valeur déclarez-vous? (vous pouvez bluffer!)
          </Text>

          <View style={styles.grid}>
            {VALUES.map((value) => (
              <TouchableOpacity
                key={value}
                style={styles.valueButton}
                onPress={() => onSelect(value)}
                activeOpacity={0.7}
              >
                <Text style={styles.valueNumber}>{value}</Text>
                <Text style={styles.valueName}>{VALUE_NAMES[value]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#152A47',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  valueButton: {
    width: 90,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  valueNumber: {
    color: '#22c55e',
    fontSize: 22,
    fontFamily: 'Inter-Black',
  },
  valueName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});
