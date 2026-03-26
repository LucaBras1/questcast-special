import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing, Shadow } from '../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      accessibilityLabel={title}
    >
      {isLoading ? (
        <ActivityIndicator
          color={variant === 'secondary' || variant === 'ghost' ? Colors.gold : Colors.background}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.text,
            variantTextStyles[variant],
            sizeTextStyles[size],
            isDisabled && styles.disabledText,
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 48,
    minHeight: 48,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
});

const variantStyles: Record<string, ViewStyle> = StyleSheet.create({
  primary: {
    backgroundColor: Colors.gold,
    borderColor: Colors.goldDark,
    ...Shadow.md,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: Colors.gold,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  danger: {
    backgroundColor: Colors.danger,
    borderColor: Colors.dangerLight,
    ...Shadow.md,
  },
});

const variantTextStyles: Record<string, TextStyle> = StyleSheet.create({
  primary: {
    color: Colors.background,
  },
  secondary: {
    color: Colors.gold,
  },
  ghost: {
    color: Colors.textSecondary,
  },
  danger: {
    color: Colors.white,
  },
});

const sizeStyles: Record<string, ViewStyle> = StyleSheet.create({
  sm: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  md: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  lg: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.xl,
  },
});

const sizeTextStyles: Record<string, TextStyle> = StyleSheet.create({
  sm: {
    fontSize: FontSize.sm,
  },
  md: {
    fontSize: FontSize.md,
  },
  lg: {
    fontSize: FontSize.lg,
  },
});
