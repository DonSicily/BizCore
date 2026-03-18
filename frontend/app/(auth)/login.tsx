import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../src/components/ThemedComponents';
import { useAuthStore } from '../../src/store/authStore';

const { width, height } = Dimensions.get('window');

WebBrowser.maybeCompleteAuthSession();

const FEATURES = [
  { icon: 'cube-outline',       label: 'Inventory',  color: '#6366F1' },
  { icon: 'cart-outline',       label: 'Orders',     color: '#22C55E' },
  { icon: 'people-outline',     label: 'Partners',   color: '#F59E0B' },
  { icon: 'wallet-outline',     label: 'Finance',    color: '#EC4899' },
  { icon: 'stats-chart-outline',label: 'Reports',    color: '#06B6D4' },
  { icon: 'receipt-outline',    label: 'Procurement',color: '#8B5CF6' },
];

export default function LoginScreen() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasProcessed = useRef(false);

  // Animations
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(40)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const orb1Anim   = useRef(new Animated.Value(0)).current;
  const orb2Anim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();

    // Pulsing logo glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1800, useNativeDriver: true }),
      ])
    ).start();

    // Floating orbs
    Animated.loop(
      Animated.sequence([
        Animated.timing(orb1Anim, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(orb1Anim, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(orb2Anim, { toValue: 1, duration: 5500, useNativeDriver: true }),
        Animated.timing(orb2Anim, { toValue: 0, duration: 5500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // OAuth callback
  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (hasProcessed.current) return;
      const hashIndex = url.indexOf('#');
      if (hashIndex !== -1) {
        const fragment = url.substring(hashIndex + 1);
        const params = new URLSearchParams(fragment);
        const sessionId = params.get('session_id');
        if (sessionId) {
          hasProcessed.current = true;
          setIsLoading(true);
          try {
            await login(sessionId);
            router.replace('/(tabs)');
          } catch (err: any) {
            setError(err.message || 'Login failed');
            setIsLoading(false);
            hasProcessed.current = false;
          }
        }
      }
    };
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); });
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isAuthenticated) router.replace('/(tabs)');
  }, [isAuthenticated]);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const redirectUrl = Linking.createURL('/(auth)/login');
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === 'web') {
        window.location.href = authUrl;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        if (result.type === 'success' && result.url) {
          const hashIndex = result.url.indexOf('#');
          if (hashIndex !== -1) {
            const fragment = result.url.substring(hashIndex + 1);
            const params = new URLSearchParams(fragment);
            const sessionId = params.get('session_id');
            if (sessionId) {
              await login(sessionId);
              router.replace('/(tabs)');
              return;
            }
          }
        }
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setIsLoading(false);
    }
  };

  const orb1Y = orb1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -28] });
  const orb2Y = orb2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });

  return (
    <View style={styles.root}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#0A0A0F', '#0F0F1A', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative orbs */}
      <Animated.View style={[styles.orb1, { transform: [{ translateY: orb1Y }] }]}>
        <LinearGradient colors={['#6366F155', '#6366F100']} style={styles.orbGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      </Animated.View>
      <Animated.View style={[styles.orb2, { transform: [{ translateY: orb2Y }] }]}>
        <LinearGradient colors={['#22C55E44', '#22C55E00']} style={styles.orbGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      </Animated.View>
      <Animated.View style={styles.orb3}>
        <LinearGradient colors={['#EC4899333', '#EC489900']} style={styles.orbGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Logo */}
          <View style={styles.brandSection}>
            <Animated.View style={[styles.logoWrapper, { transform: [{ scale: pulseAnim }] }]}>
              <LinearGradient
                colors={['#6366F1', '#818CF8']}
                style={styles.logoGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="briefcase" size={36} color="#FFFFFF" />
              </LinearGradient>
              {/* Glow ring */}
              <View style={styles.logoGlow} />
            </Animated.View>

            <Text style={styles.appName}>BizCore</Text>
            <Text style={styles.tagline}>Enterprise Resource Planning</Text>

            {/* Divider line */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>All-in-one mobile ERP</Text>
              <View style={styles.dividerLine} />
            </View>
          </View>

          {/* Feature grid */}
          <View style={styles.featureGrid}>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.featureChip}>
                <View style={[styles.featureIconBg, { backgroundColor: `${f.color}22` }]}>
                  <Ionicons name={f.icon as any} size={18} color={f.color} />
                </View>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* Sign-in section */}
          <View style={styles.signInSection}>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={isLoading ? ['#2A2A3E', '#2A2A3E'] : ['#1C1C2E', '#14141F']}
                style={styles.googleButtonInner}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <>
                    <View style={styles.googleIconCircle}>
                      <Ionicons name="logo-google" size={20} color="#EA4335" />
                    </View>
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.textMuted} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Border accent on button */}
            <View style={styles.buttonBorderAccent} />

            <Text style={styles.disclaimer}>
              Secure sign-in · Your data is encrypted and protected
            </Text>
          </View>

        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 24,
  },

  // Orbs
  orb1: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    overflow: 'hidden',
  },
  orb2: {
    position: 'absolute',
    bottom: 80,
    left: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    overflow: 'hidden',
  },
  orb3: {
    position: 'absolute',
    top: height * 0.4,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
  },
  orbGradient: {
    flex: 1,
  },

  // Brand
  brandSection: {
    alignItems: 'center',
    paddingTop: 16,
  },
  logoWrapper: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGradient: {
    width: 88,
    height: 88,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: '#6366F144',
    backgroundColor: 'transparent',
  },
  appName: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },

  // Feature grid
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14141F',
    borderWidth: 1,
    borderColor: '#2A2A3E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 7,
  },
  featureIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },

  // Sign-in
  signInSection: {
    gap: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.danger}18`,
    borderWidth: 1,
    borderColor: `${Colors.danger}40`,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    flex: 1,
  },
  googleButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A3E',
    overflow: 'hidden',
  },
  googleButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  buttonBorderAccent: {
    height: 2,
    marginTop: -14,
    marginHorizontal: 24,
    borderRadius: 1,
    backgroundColor: '#6366F133',
  },
  googleIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF08',
    borderWidth: 1,
    borderColor: '#FFFFFF15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    marginLeft: 12,
  },
  disclaimer: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
