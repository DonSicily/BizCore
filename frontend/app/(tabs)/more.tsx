import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Colors,
  Card,
  Button,
  Input,
  ListItem,
  LoadingScreen,
  EmptyState,
} from '../../src/components/ThemedComponents';
import { useAuthStore } from '../../src/store/authStore';
import { useAppStore } from '../../src/store/appStore';
import { useSyncStore } from '../../src/store/syncStore';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import clientConfig, { isFeatureEnabled } from '../../src/config/clientConfig';
import api from '../../src/utils/api';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { warehouses, fetchWarehouses, createWarehouse, deleteWarehouse } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [stockReport, setStockReport] = useState<any[]>([]);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', address: '' });
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWarehouses();
    setRefreshing(false);
  };

  const loadUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error: any) {
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view users');
        setShowUsersModal(false);
      }
    }
  };

  const loadStockReport = async () => {
    try {
      setLoadingReport(true);
      const response = await api.get('/reports/stock-summary');
      setStockReport(response.data);
    } catch (error) {
      console.error('Error loading report:', error);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleCreateWarehouse = async () => {
    if (!warehouseForm.name) {
      Alert.alert('Error', 'Warehouse name is required');
      return;
    }

    try {
      await createWarehouse(warehouseForm);
      setShowWarehouseModal(false);
      setWarehouseForm({ name: '', address: '' });
      Alert.alert('Success', 'Warehouse created');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create warehouse');
    }
  };

  const handleDeleteWarehouse = (warehouse: any) => {
    Alert.alert(
      'Delete Warehouse',
      `Are you sure you want to delete "${warehouse.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWarehouse(warehouse.warehouse_id);
              Alert.alert('Success', 'Warehouse deleted');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete warehouse');
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      manager: 'Manager',
      purchase_clerk: 'Purchase Clerk',
      sales_executive: 'Sales Executive',
      accountant: 'Accountant',
      viewer: 'Viewer',
    };
    return labels[role] || role;
  };

  const getRoleBadgeColor = (role: string): 'success' | 'warning' | 'info' | 'default' => {
    switch (role) {
      case 'super_admin':
        return 'success';
      case 'manager':
        return 'warning';
      case 'accountant':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>More</Text>
        </View>

        {/* User Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'User'}</Text>
              <Text style={styles.profileEmail}>{user?.email || ''}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{getRoleLabel(user?.role || 'viewer')}</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Admin Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Administration</Text>
          <ListItem
            title="Users"
            subtitle="Manage team members and roles"
            leftIcon="people-outline"
            onPress={() => {
              setShowUsersModal(true);
              loadUsers();
            }}
          />
          <ListItem
            title="Warehouses"
            subtitle={`${warehouses.length} locations`}
            leftIcon="home-outline"
            onPress={() => setShowWarehouseModal(true)}
          />
          <ListItem
            title="Audit Logs"
            subtitle="Track system activity"
            leftIcon="time-outline"
            onPress={() => router.push('/audit-logs')}
          />
        </View>

        {/* Sales & Purchases */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sales & Purchases</Text>
          <ListItem
            title="Quotations"
            subtitle="Manage sales quotes"
            leftIcon="document-text-outline"
            onPress={() => router.push('/quotations')}
          />
          <ListItem
            title="Delivery Notes"
            subtitle="Track shipments"
            leftIcon="car-outline"
            onPress={() => router.push('/delivery-notes')}
          />
          <ListItem
            title="Bill of Materials"
            subtitle="Production recipes"
            leftIcon="construct-outline"
            onPress={() => router.push('/bom')}
          />
          <ListItem
            title="Purchase Requisitions"
            subtitle="Request materials with approval"
            leftIcon="document-attach-outline"
            onPress={() => router.push('/requisitions')}
          />
          <ListItem
            title="Goods Receipt (GRN)"
            subtitle="Receive and verify goods"
            leftIcon="receipt-outline"
            onPress={() => router.push('/grn')}
          />
          <ListItem
            title="3-Way Matching"
            subtitle="PO-GRN-Invoice verification"
            leftIcon="git-compare-outline"
            onPress={() => router.push('/three-way-match')}
          />
        </View>

        {/* Financial Reports */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Reports</Text>
          <ListItem
            title="Balance Sheet & Trial Balance"
            subtitle="Financial statements"
            leftIcon="stats-chart-outline"
            onPress={() => router.push('/financial-reports')}
          />
          <ListItem
            title="Performance Dashboard"
            subtitle="Supplier & Distributor metrics"
            leftIcon="analytics-outline"
            onPress={() => router.push('/performance-dashboard')}
          />
        </View>

        {/* Reports Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reports</Text>
          <ListItem
            title="Stock Summary"
            subtitle="View inventory valuation"
            leftIcon="stats-chart-outline"
            onPress={() => {
              setShowReportsModal(true);
              loadStockReport();
            }}
          />
          <ListItem
            title="Export Data"
            subtitle="Download reports as CSV"
            leftIcon="download-outline"
            onPress={() => Alert.alert('Coming Soon', 'Export functionality will be available soon')}
          />
        </View>

        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <ListItem
            title="Company Profile"
            subtitle="Business information"
            leftIcon="business-outline"
            onPress={() => Alert.alert('Coming Soon', 'Company settings will be available soon')}
          />
          <ListItem
            title="Notifications"
            subtitle="Manage alerts"
            leftIcon="notifications-outline"
            onPress={() => Alert.alert('Coming Soon', 'Notification settings will be available soon')}
          />
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <View style={styles.logoutIcon}>
              <Ionicons name="log-out-outline" size={22} color={Colors.danger} />
            </View>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>{clientConfig.appName}</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appTagline}>{clientConfig.tagline}</Text>
          {isFeatureEnabled('enableOfflineMode') && (
            <View style={{ marginTop: 12 }}>
              <SyncStatusIndicator />
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Warehouses Modal */}
      <Modal visible={showWarehouseModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Warehouses</Text>
              <TouchableOpacity onPress={() => setShowWarehouseModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Add New Warehouse */}
              <View style={styles.addWarehouseSection}>
                <Text style={styles.subsectionTitle}>Add New Warehouse</Text>
                <Input
                  label="Name *"
                  value={warehouseForm.name}
                  onChangeText={(text) => setWarehouseForm({ ...warehouseForm, name: text })}
                  placeholder="Enter warehouse name"
                />
                <Input
                  label="Address"
                  value={warehouseForm.address}
                  onChangeText={(text) => setWarehouseForm({ ...warehouseForm, address: text })}
                  placeholder="Enter address"
                />
                <Button
                  title="Add Warehouse"
                  onPress={handleCreateWarehouse}
                  style={{ marginTop: 8 }}
                />
              </View>

              {/* Existing Warehouses */}
              <Text style={styles.subsectionTitle}>Existing Warehouses</Text>
              {warehouses.length === 0 ? (
                <Text style={styles.emptyText}>No warehouses yet</Text>
              ) : (
                warehouses.map((warehouse) => (
                  <View key={warehouse.warehouse_id} style={styles.warehouseItem}>
                    <View style={styles.warehouseInfo}>
                      <Text style={styles.warehouseName}>{warehouse.name}</Text>
                      {warehouse.address && (
                        <Text style={styles.warehouseAddress}>{warehouse.address}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteWarehouse(warehouse)}
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Users Modal */}
      <Modal visible={showUsersModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Team Members</Text>
              <TouchableOpacity onPress={() => setShowUsersModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {users.length === 0 ? (
                <EmptyState message="No users found" icon="people-outline" />
              ) : (
                users.map((u) => (
                  <View key={u.user_id} style={styles.userItem}>
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>
                        {u.name?.charAt(0).toUpperCase() || 'U'}
                      </Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <Text style={styles.userEmail}>{u.email}</Text>
                    </View>
                    <View
                      style={[
                        styles.userRoleBadge,
                        { backgroundColor: `${getRoleBadgeColor(u.role) === 'success' ? Colors.success : getRoleBadgeColor(u.role) === 'warning' ? Colors.warning : Colors.primary}20` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.userRoleText,
                          { color: getRoleBadgeColor(u.role) === 'success' ? Colors.success : getRoleBadgeColor(u.role) === 'warning' ? Colors.warning : Colors.primary },
                        ]}
                      >
                        {getRoleLabel(u.role)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reports Modal */}
      <Modal visible={showReportsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Stock Summary Report</Text>
              <TouchableOpacity onPress={() => setShowReportsModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingReport ? (
                <LoadingScreen />
              ) : stockReport.length === 0 ? (
                <EmptyState message="No stock data" icon="stats-chart-outline" />
              ) : (
                <>
                  {/* Summary */}
                  <View style={styles.reportSummary}>
                    <View style={styles.reportSummaryItem}>
                      <Text style={styles.reportSummaryValue}>
                        ${stockReport.reduce((sum, item) => sum + (item.value || 0), 0).toFixed(0)}
                      </Text>
                      <Text style={styles.reportSummaryLabel}>Total Value</Text>
                    </View>
                    <View style={styles.reportSummaryItem}>
                      <Text style={styles.reportSummaryValue}>{stockReport.length}</Text>
                      <Text style={styles.reportSummaryLabel}>Items</Text>
                    </View>
                    <View style={styles.reportSummaryItem}>
                      <Text
                        style={[
                          styles.reportSummaryValue,
                          { color: Colors.danger },
                        ]}
                      >
                        {stockReport.filter((item) => item.is_low_stock).length}
                      </Text>
                      <Text style={styles.reportSummaryLabel}>Low Stock</Text>
                    </View>
                  </View>

                  {/* Items */}
                  {stockReport.map((item, index) => (
                    <View key={index} style={styles.reportItem}>
                      <View style={styles.reportItemHeader}>
                        <Text style={styles.reportItemName}>{item.product_name}</Text>
                        {item.is_low_stock && (
                          <View style={styles.lowStockBadge}>
                            <Text style={styles.lowStockText}>LOW</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.reportItemDetails}>
                        <View style={styles.reportItemDetail}>
                          <Text style={styles.reportItemDetailLabel}>SKU</Text>
                          <Text style={styles.reportItemDetailValue}>{item.sku}</Text>
                        </View>
                        <View style={styles.reportItemDetail}>
                          <Text style={styles.reportItemDetailLabel}>Qty</Text>
                          <Text style={styles.reportItemDetailValue}>
                            {item.quantity} {item.unit}
                          </Text>
                        </View>
                        <View style={styles.reportItemDetail}>
                          <Text style={styles.reportItemDetailLabel}>Value</Text>
                          <Text style={styles.reportItemDetailValue}>
                            ${item.value?.toFixed(2) || '0.00'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
  },
  profileCard: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  profileEmail: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: `${Colors.primary}20`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${Colors.danger}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.danger,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  appVersion: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  appTagline: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  addWarehouseSection: {
    backgroundColor: Colors.cardAlt,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  warehouseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  warehouseInfo: {
    flex: 1,
  },
  warehouseName: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  warehouseAddress: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  userEmail: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  userRoleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  userRoleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reportSummary: {
    flexDirection: 'row',
    backgroundColor: Colors.cardAlt,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  reportSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  reportSummaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  reportSummaryLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  reportItem: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reportItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reportItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
    flex: 1,
  },
  lowStockBadge: {
    backgroundColor: `${Colors.danger}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowStockText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.danger,
  },
  reportItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reportItemDetail: {
    alignItems: 'center',
  },
  reportItemDetailLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  reportItemDetailValue: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
});
