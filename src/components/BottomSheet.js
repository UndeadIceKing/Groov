import React from 'react';
import { View, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Animated, StyleSheet } from 'react-native';

export default function BottomSheet({ visible, onClose, translateY, backgroundColor, maxHeight = '92%', children }) {
  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.overlayBg} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, { backgroundColor, maxHeight, transform: [{ translateY }] }]}>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
});
