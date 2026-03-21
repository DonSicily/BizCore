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
  Image,
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

// ─── Hexagon geometry ────────────────────────────────────────────────────────
const HEX_R    = 110;   // circumradius (center → vertex)
const HEX_CX   = 150;   // center x inside container
const HEX_CY   = 150;   // center y inside container
const HEX_SIZE = 300;   // square container side length
const CHIP_W   = 88;    // feature chip width
const CHIP_H   = 28;    // feature chip height

const toRad = (d: number) => (d * Math.PI) / 180;

// Pointy-top hexagon: top vertex at 90°, going clockwise
const ANGLES = [90, 30, 330, 270, 210, 150];
const VERTICES = ANGLES.map(deg => ({
  x: HEX_CX + HEX_R * Math.cos(toRad(deg)),
  y: HEX_CY - HEX_R * Math.sin(toRad(deg)),
}));

// Feature at each vertex (same clockwise order)
const FEATURES = [
  { label: 'Inventory',   color: '#6366F1', icon: 'cube-outline'         },
  { label: 'Orders',      color: '#22C55E', icon: 'cart-outline'          },
  { label: 'Partners',    color: '#F59E0B', icon: 'people-outline'        },
  { label: 'Finance',     color: '#EC4899', icon: 'wallet-outline'        },
  { label: 'Reports',     color: '#06B6D4', icon: 'stats-chart-outline'   },
  { label: 'Procurement', color: '#8B5CF6', icon: 'receipt-outline'       },
];

// Six edges of the hexagon — pre-computed midpoint + rotation for each line
const EDGES = [
  { left: 142.65, top: 66.5,  angle: '30deg'  },   // V0 → V1
  { left: 190.3,  top: 149.0, angle: '90deg'  },   // V1 → V2
  { left: 142.65, top: 231.5, angle: '150deg' },   // V2 → V3
  { left: 47.35,  top: 231.5, angle: '210deg' },   // V3 → V4
  { left: -0.3,   top: 149.0, angle: '-90deg' },   // V4 → V5
  { left: 47.35,  top: 66.5,  angle: '-30deg' },   // V5 → V0
];
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const hasProcessed              = useRef(false);

  // Animations
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const orb1Anim  = useRef(new Animated.Value(0)).current;
  const orb2Anim  = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();

    // Logo pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    // Edge glow breathe
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2500, useNativeDriver: true }),
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
        const fragment  = url.substring(hashIndex + 1);
        const params    = new URLSearchParams(fragment);
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
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });
    const sub = Linking.addEventListener('url', e => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isAuthenticated) router.replace('/(tabs)');
  }, [isAuthenticated]);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const redirectUrl = Linking.createURL('/(auth)/login');
      const authUrl     = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === 'web') {
        window.location.href = authUrl;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        if (result.type === 'success' && result.url) {
          const hashIndex = result.url.indexOf('#');
          if (hashIndex !== -1) {
            const fragment  = result.url.substring(hashIndex + 1);
            const params    = new URLSearchParams(fragment);
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

  const orb1Y    = orb1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -28] });
  const orb2Y    = orb2Anim.interpolate({ inputRange: [0, 1], outputRange: [0,  22] });
  const edgeOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });

  return (
    <View style={styles.root}>
      {/* Background */}
      <LinearGradient colors={['#06060E', '#0D0D1C', '#06060E']} style={StyleSheet.absoluteFill} />

      {/* Decorative orbs */}
      <Animated.View style={[styles.orb1, { transform: [{ translateY: orb1Y }] }]}>
        <LinearGradient colors={['#6366F155', '#6366F100']} style={styles.orbFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      </Animated.View>
      <Animated.View style={[styles.orb2, { transform: [{ translateY: orb2Y }] }]}>
        <LinearGradient colors={['#06B6D433', '#06B6D400']} style={styles.orbFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      </Animated.View>

      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Tagline */}
          <View style={styles.taglineRow}>
            <View style={styles.taglineLine} />
            <Text style={styles.tagline}>Enterprise Resource Planning</Text>
            <View style={styles.taglineLine} />
          </View>

          {/* ── Hexagon ── */}
          <View style={styles.hexContainer}>

            {/* Edge lines */}
            {EDGES.map((e, i) => (
              <Animated.View
                key={`edge-${i}`}
                style={[
                  styles.hexEdge,
                  {
                    left:      e.left,
                    top:       e.top,
                    opacity:   edgeOpacity,
                    transform: [{ rotate: e.angle }],
                  },
                ]}
              />
            ))}

            {/* Spoke lines (center → each vertex) for inner star effect */}
            {VERTICES.map((v, i) => {
              const dx     = v.x - HEX_CX;
              const dy     = v.y - HEX_CY;
              const spoke  = Math.sqrt(dx * dx + dy * dy) * 0.42; // half-spoke length
              const angle  = (Math.atan2(dy, dx) * 180) / Math.PI;
              const midX   = HEX_CX + dx * 0.21;
              const midY   = HEX_CY + dy * 0.21;
              return (
                <Animated.View
                  key={`spoke-${i}`}
                  style={[
                    styles.spoke,
                    {
                      left:      midX - spoke / 2,
                      top:       midY - 0.5,
                      width:     spoke,
                      opacity:   edgeOpacity,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}

            {/* Feature chips at each vertex */}
            {FEATURES.map((f, i) => {
              const v = VERTICES[i];
              return (
                <View
                  key={f.label}
                  style={[
                    styles.chip,
                    {
                      left:            v.x - CHIP_W / 2,
                      top:             v.y - CHIP_H / 2,
                      borderColor:     `${f.color}55`,
                      backgroundColor: `${f.color}15`,
                    },
                  ]}
                >
                  <Ionicons name={f.icon as any} size={11} color={f.color} />
                  <Text style={[styles.chipLabel, { color: f.color }]}>{f.label}</Text>
                </View>
              );
            })}

            {/* Center logo */}
            <Animated.View style={[styles.logoWrapper, { transform: [{ scale: pulseAnim }] }]}>
              {/* Outer glow ring */}
              <Animated.View style={[styles.glowRing, { opacity: edgeOpacity }]} />
              {/* Logo image */}
              <Image
                source={require('../../assets/images/bizcore_logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </Animated.View>

          </View>
          {/* ── End Hexagon ── */}

          {/* Sign-in section */}
          <View style={styles.signIn}>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={isLoading ? ['#1C1C2E', '#1C1C2E'] : ['#1C1C2E', '#141426']}
                style={styles.googleBtnInner}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <>
                    <View style={styles.googleIconBox}>
                      <Ionicons name="logo-google" size={20} color="#EA4335" />
                    </View>
                    <Text style={styles.googleBtnText}>Continue with Google</Text>
                    <Ionicons name="arrow-forward" size={16} color={Colors.textMuted} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Accent line below button */}
            <LinearGradient
              colors={['transparent', '#6366F155', 'transparent']}
              style={styles.accentLine}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />

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
    backgroundColor: '#06060E',
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    paddingVertical: 20,
  },

  // Orbs
  orb1: {
    position: 'absolute', top: -80, right: -80,
    width: 280, height: 280, borderRadius: 140, overflow: 'hidden',
  },
  orb2: {
    position: 'absolute', bottom: 60, left: -100,
    width: 260, height: 260, borderRadius: 130, overflow: 'hidden',
  },
  orbFill: { flex: 1 },

  // Tagline
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
  },
  taglineLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A2A3E',
  },
  tagline: {
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // ── Hexagon container ──
  hexContainer: {
    width:            HEX_SIZE,
    height:           HEX_SIZE,
    alignSelf:        'center',
    position:         'relative',
  },

  // Edge border lines
  hexEdge: {
    position:         'absolute',
    width:            HEX_R,         // edge length = circumradius for regular hexagon
    height:           1.5,
    backgroundColor:  '#6366F1',
    borderRadius:     1,
  },

  // Spoke lines
  spoke: {
    position:         'absolute',
    height:           1,
    backgroundColor:  '#6366F144',
    borderRadius:     1,
  },

  // Feature chip at each vertex
  chip: {
    position:         'absolute',
    width:            CHIP_W,
    height:           CHIP_H,
    borderRadius:     14,
    borderWidth:      1,
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    gap:              5,
  },
  chipLabel: {
    fontSize:         11,
    fontWeight:       '600',
    letterSpacing:    0.2,
  },

  // Center logo
  logoWrapper: {
    position:         'absolute',
    left:             HEX_CX - 58,
    top:              HEX_CY - 58,
    width:            116,
    height:           116,
    alignItems:       'center',
    justifyContent:   'center',
  },
  glowRing: {
    position:         'absolute',
    width:            116,
    height:           116,
    borderRadius:     58,
    borderWidth:      1,
    borderColor:      '#6366F166',
    backgroundColor:  '#6366F108',
  },
  logoImage: {
    width:            90,
    height:           90,
  },

  // ── Sign-in section ──
  signIn: {
    gap: 10,
  },
  errorBox: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  `${Colors.danger}15`,
    borderWidth:      1,
    borderColor:      `${Colors.danger}40`,
    padding:          12,
    borderRadius:     12,
    gap:              8,
  },
  errorText: {
    color:            Colors.danger,
    fontSize:         13,
    flex:             1,
  },
  googleBtn: {
    borderRadius:     14,
    borderWidth:      1,
    borderColor:      '#2A2A3E',
    overflow:         'hidden',
  },
  googleBtnInner: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 18,
    paddingVertical:  16,
  },
  googleIconBox: {
    width:            36,
    height:           36,
    borderRadius:     10,
    backgroundColor:  '#FFFFFF08',
    borderWidth:      1,
    borderColor:      '#FFFFFF12',
    justifyContent:   'center',
    alignItems:       'center',
  },
  googleBtnText: {
    fontSize:         16,
    fontWeight:       '600',
    color:            '#FFFFFF',
    flex:             1,
    marginLeft:       12,
  },
  accentLine: {
    height:           1,
    marginHorizontal: 32,
  },
  disclaimer: {
    fontSize:         12,
    color:            Colors.textMuted,
    textAlign:        'center',
    letterSpacing:    0.2,
    paddingBottom:    4,
  },
});
