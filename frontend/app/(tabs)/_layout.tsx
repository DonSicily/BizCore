import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/components/ThemedComponents';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  
  // Calculate proper bottom padding for Android navigation bar
  const bottomPadding = Platform.OS === 'android' 
    ? Math.max(insets.bottom, 10) + 10  // Extra padding for Android nav bar
    : insets.bottom || 25;
  
  const tabBarHeight = Platform.OS === 'android' 
    ? 60 + bottomPadding 
    : 85;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          // Ensure tab bar is above Android navigation
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 8,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarShowLabel: true,
      }}
    >
