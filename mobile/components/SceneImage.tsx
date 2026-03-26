import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
  Modal,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '../constants/theme';
import { A11yHints, A11yLabels } from '../utils/accessibility';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_ASPECT_RATIO = 16 / 9;
const IMAGE_WIDTH = SCREEN_WIDTH - Spacing.xl * 2;
const IMAGE_HEIGHT = IMAGE_WIDTH / IMAGE_ASPECT_RATIO;

interface SceneImageProps {
  /** The image URL to display */
  imageUrl: string | null;
  /** Whether the image is still loading/generating */
  isLoading?: boolean;
  /** Error message if image generation failed */
  error?: string | null;
  /** Callback to retry image generation */
  onRetry?: () => void;
  /** Image counter text, e.g. "1/2 images" */
  counterText?: string;
  /** Alt text for accessibility */
  altText?: string;
}

export function SceneImage({
  imageUrl,
  isLoading = false,
  error = null,
  onRetry,
  counterText,
  altText = 'AI-generated scene illustration',
}: SceneImageProps) {
  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const shimmerPosition = useRef(new Animated.Value(-1)).current;

  // Fade in when image loads
  useEffect(() => {
    if (imageLoaded && imageUrl) {
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();

      // Subtle glow border pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowPulse, {
            toValue: 0.4,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }
  }, [imageLoaded, imageUrl, fadeIn, glowPulse]);

  // Shimmer animation for loading placeholder
  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.timing(shimmerPosition, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      shimmerPosition.setValue(-1);
    }
  }, [isLoading, shimmerPosition]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoaded(false);
  }, []);

  // Loading placeholder
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeleton}>
          <Animated.View
            style={[
              styles.shimmer,
              {
                transform: [
                  {
                    translateX: shimmerPosition.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [-IMAGE_WIDTH, IMAGE_WIDTH],
                    }),
                  },
                ],
              },
            ]}
          />
          <View style={styles.skeletonContent}>
            <ActivityIndicator size="small" color={Colors.gold} />
            <Text style={styles.skeletonText}>A vision forms...</Text>
          </View>
        </View>
        {counterText && (
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>{counterText}</Text>
          </View>
        )}
      </View>
    );
  }

  // Error state
  if (error || imageError) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={onRetry}
          style={styles.errorContainer}
          accessibilityLabel="Scene image failed to load. Tap to retry."
          accessibilityRole="button"
          accessibilityHint={A11yHints.retryButton}
          disabled={!onRetry}
        >
          <Text style={styles.errorIcon}>{'\uD83D\uDD73\uFE0F'}</Text>
          <Text style={styles.errorText}>The vision fades...</Text>
          {onRetry && (
            <Text style={styles.errorRetry}>Tap to try again</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // No image URL
  if (!imageUrl) return null;

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={styles.container}>
      {/* Glow border */}
      <Animated.View style={[styles.glowBorder, { opacity: glowOpacity }]} />

      {/* Main image */}
      <Animated.View style={[styles.imageWrapper, { opacity: fadeIn }]}>
        <TouchableOpacity
          onPress={() => setFullScreenVisible(true)}
          activeOpacity={0.9}
          accessibilityLabel={altText}
          accessibilityRole="image"
          accessibilityHint={A11yHints.sceneImage}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            onLoad={handleImageLoad}
            onError={handleImageError}
            resizeMode="cover"
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Counter badge */}
      {counterText && (
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>{counterText}</Text>
        </View>
      )}

      {/* Loading overlay while image is loading from URL */}
      {!imageLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.gold} />
        </View>
      )}

      {/* Full-screen modal */}
      <Modal
        visible={fullScreenVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenVisible(false)}
      >
        <View style={styles.fullScreenContainer}>
          <TouchableOpacity
            style={styles.fullScreenBackdrop}
            onPress={() => setFullScreenVisible(false)}
            activeOpacity={1}
            accessibilityLabel="Close full screen image"
            accessibilityRole="button"
          >
            <ScrollView
              contentContainerStyle={styles.fullScreenScrollContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
            >
              <Image
                source={{ uri: imageUrl }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
            </ScrollView>
          </TouchableOpacity>

          {/* Close button */}
          <TouchableOpacity
            onPress={() => setFullScreenVisible(false)}
            style={styles.closeButton}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Text style={styles.closeButtonText}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.md,
    alignItems: 'center',
    position: 'relative',
  },
  glowBorder: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: BorderRadius.lg + 2,
    backgroundColor: Colors.purpleDark,
    ...Shadow.glow(Colors.purple),
  },
  imageWrapper: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.md,
  },
  image: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    borderRadius: BorderRadius.lg,
  },
  counterBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(13, 10, 26, 0.8)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  counterText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 10, 26, 0.5)',
    borderRadius: BorderRadius.lg,
  },

  // Skeleton / loading placeholder
  skeleton: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.backgroundCard,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: IMAGE_WIDTH * 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  skeletonContent: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  skeletonText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },

  // Error state
  errorContainer: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT * 0.6,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: Spacing.sm,
    opacity: 0.5,
  },
  errorText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  errorRetry: {
    color: Colors.gold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },

  // Full screen modal
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  fullScreenBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenScrollContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: FontWeight.bold,
  },
});
